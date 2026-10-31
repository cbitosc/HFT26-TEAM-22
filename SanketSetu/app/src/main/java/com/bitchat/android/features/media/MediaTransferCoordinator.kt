package com.bitchat.android.features.media

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.bitchat.android.ai.media.BlobStore
import com.bitchat.android.ai.media.LanEnvironment
import com.bitchat.android.ai.media.MediaCodecException
import com.bitchat.android.ai.media.MediaCodecs
import com.bitchat.android.ai.media.MediaEvents
import com.bitchat.android.ai.media.MediaFailure
import com.bitchat.android.ai.media.MediaLane
import com.bitchat.android.ai.media.MediaLink
import com.bitchat.android.ai.media.MediaChunk
import com.bitchat.android.ai.media.MediaOffer
import com.bitchat.android.ai.media.MediaRequest
import com.bitchat.android.ai.media.MediaTransferEngine
import com.bitchat.android.ai.media.MimeTag
import com.bitchat.android.ai.media.ReceivedMedia
import com.bitchat.android.ai.media.TcpLanLane
import com.bitchat.android.features.file.FileUtils
import com.bitchat.android.model.BitchatMessage
import com.bitchat.android.protocol.MessageType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.net.Inet4Address
import java.net.NetworkInterface
import java.security.SecureRandom
import java.util.Collections
import java.util.Date
import java.util.UUID

/** What the coordinator needs from the Bluetooth mesh service. Keeps this class free of BLE details. */
interface MediaMeshHost {
    val myPeerId: String
    fun peerNickname(peerId: String): String?
    fun myNickname(): String?
    fun hasLinks(): Boolean
    fun isDirectPeer(peerId: String): Boolean

    /** Signed, flooded MEDIA_OFFER. */
    fun sendBroadcastOffer(payload: ByteArray)

    /** Recipient-addressed, unsigned, low priority. Returns false when the peer cannot be reached right now. */
    fun sendAddressed(type: MessageType, to: String, payload: ByteArray, direct: Boolean): Boolean

    /** Offer sealed inside the Noise session. Returns false if no session exists yet (a handshake is started). */
    fun sendNoiseOffer(to: String, plaintext: ByteArray): Boolean

    fun deliver(message: BitchatMessage)
}

/** The phone's own Wi-Fi / hotspot address, ignoring cellular and VPN interfaces. */
object AndroidLanEnvironment : LanEnvironment {
    override fun localIpv4(): ByteArray? = try {
        Collections.list(NetworkInterface.getNetworkInterfaces())
            .filter { it.isUp && !it.isLoopback && wifiLike(it.name) }
            .flatMap { Collections.list(it.inetAddresses) }
            .filterIsInstance<Inet4Address>()
            .firstOrNull { it.isSiteLocalAddress }
            ?.address
    } catch (_: Exception) {
        null
    }

    private fun wifiLike(name: String) =
        name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan") || name.startsWith("p2p") || name.startsWith("eth")
}

/** One row of the "receiving" strip. */
data class MediaTransferUi(
    val hashHex: String,
    val title: String,
    val from: String,
    val fraction: Float,
    val lane: MediaLane,
    val failed: Boolean = false,
    val note: String? = null,
    val thumbnail: ByteArray? = null
)

/**
 * Glue between [MediaTransferEngine] (pure Kotlin) and the Bluetooth mesh: packs engine messages into mesh
 * packets, drives the engine's timers, and turns finished blobs into ordinary chat messages so the existing
 * image, voice-note and viewer components render them.
 */
class MediaTransferCoordinator(
    private val context: Context,
    private val host: MediaMeshHost,
    private val scope: CoroutineScope
) : MediaLink, MediaEvents {

    private val store = BlobStore(File(context.cacheDir, "blobs"))
    private val engine = MediaTransferEngine(store, this, this, TcpLanLane(AndroidLanEnvironment))
    private val random = SecureRandom()
    private var job: Job? = null

    private val delivered = Collections.synchronizedSet(HashSet<String>())
    private val ui = MutableStateFlow<Map<String, MediaTransferUi>>(emptyMap())
    val transfers: StateFlow<Map<String, MediaTransferUi>> = ui.asStateFlow()
    private val lastEmit = HashMap<String, Long>()

    /** Sender-side progress: (blobHash, chunksServed, totalChunks, private). Set by the chat layer. */
    @Volatile var sendProgress: ((String, Int, Int, Boolean) -> Unit)? = null

    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            var lastTick = 0L
            while (isActive) {
                val busy = try { engine.pump(PUMP_BUDGET) } catch (e: Exception) { Log.w(TAG, "pump failed: ${e.message}"); false }
                val now = SystemClock.elapsedRealtime()
                if (now - lastTick >= 1_000) {
                    lastTick = now
                    try { engine.tick() } catch (e: Exception) { Log.w(TAG, "tick failed: ${e.message}") }
                }
                delay(if (busy) PUMP_INTERVAL_MS else IDLE_INTERVAL_MS)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
        engine.shutdown()
    }

    // ------------------------------------------------------------------ sending

    /**
     * Offers [file] to [toPeer] (private, end-to-end sealed) or to the whole mesh when null. Hashing and
     * sealing run off the main thread; [onOffered] gets the blob hash, or null if it could not be offered.
     */
    fun send(file: File, mime: String, toPeer: String?, thumbnail: ByteArray, onOffered: (String?) -> Unit) {
        scope.launch {
            val hash = try {
                val key = if (toPeer != null) ByteArray(32).also { random.nextBytes(it) } else null
                engine.offer(file, MimeTag.fromMime(mime), thumbnail, toPeer, key).hashHex
            } catch (e: Exception) {
                Log.e(TAG, "offer failed: ${e.message}")
                null
            }
            onOffered(hash)
        }
    }

    fun cancel(hashHex: String) = engine.cancel(hashHex)

    // ----------------------------------------------------------------- inbound

    fun onOfferPacket(from: String, payload: ByteArray) {
        try { engine.onOffer(from, MediaCodecs.decodeOffer(payload)) } catch (_: MediaCodecException) { }
    }

    /** A private offer: `offer | key(32)`, already decrypted by the Noise layer. */
    fun onPrivateOffer(from: String, data: ByteArray) {
        if (data.size <= KEY_BYTES) return
        try {
            val offer = MediaCodecs.decodeOffer(data.copyOfRange(0, data.size - KEY_BYTES))
            engine.onOffer(from, offer, data.copyOfRange(data.size - KEY_BYTES, data.size))
        } catch (_: MediaCodecException) { }
    }

    fun onRequestPacket(from: String, payload: ByteArray) {
        try { engine.onRequest(from, MediaCodecs.decodeRequest(payload)) } catch (_: MediaCodecException) { }
    }

    fun onChunkPacket(from: String, payload: ByteArray) {
        try { engine.onChunk(from, MediaCodecs.decodeChunk(payload)) } catch (_: MediaCodecException) { }
    }

    fun onPeerReconnected(peerId: String) = engine.onPeerReconnected(peerId)

    // -------------------------------------------------------------- MediaLink

    override fun sendOffer(offer: MediaOffer, to: String?, key: ByteArray?) {
        val bytes = MediaCodecs.encodeOffer(offer)
        if (to == null || key == null) host.sendBroadcastOffer(bytes) else host.sendNoiseOffer(to, bytes + key)
    }

    override fun sendRequest(to: String, request: MediaRequest) {
        host.sendAddressed(MessageType.MEDIA_REQUEST, to, MediaCodecs.encodeRequest(request), host.isDirectPeer(to))
    }

    override fun sendChunk(to: String, chunk: MediaChunk): Boolean {
        if (!host.hasLinks()) return false
        return host.sendAddressed(MessageType.MEDIA_CHUNK, to, MediaCodecs.encodeChunk(chunk), host.isDirectPeer(to))
    }

    // ------------------------------------------------------------ MediaEvents

    override fun onIncoming(hashHex: String, from: String, offer: MediaOffer, private: Boolean) {
        val who = host.peerNickname(from) ?: "a nearby phone"
        put(MediaTransferUi(hashHex, "${kindOf(offer.mimeTag)} from $who", from, 0f, MediaLane.BLUETOOTH, thumbnail = offer.thumbnail.takeIf { it.isNotEmpty() }))
    }

    override fun onProgress(hashHex: String, received: Int, total: Int, lane: MediaLane) {
        val now = SystemClock.elapsedRealtime()
        val last = lastEmit[hashHex] ?: 0L
        if (received < total && now - last < PROGRESS_THROTTLE_MS) return
        lastEmit[hashHex] = now
        ui.value[hashHex]?.let { put(it.copy(fraction = received.toFloat() / total, lane = lane, failed = false, note = null)) }
    }

    override fun onReceived(media: ReceivedMedia) {
        remove(media.hashHex)
        if (!delivered.add(media.hashHex + "|" + media.from)) return
        val mime = MimeTag.toMime(media.mimeTag)
        val name = "${kindOf(media.mimeTag).lowercase().replace(' ', '_')}_${media.hashHex.take(8)}${MimeTag.extension(media.mimeTag)}"
        val path = try {
            FileUtils.adoptIncomingFile(context, media.file, mime, name, move = media.temporary)
        } catch (e: Exception) {
            Log.e(TAG, "could not store received media: ${e.message}")
            return
        }
        host.deliver(
            BitchatMessage(
                id = UUID.randomUUID().toString().uppercase(),
                sender = host.peerNickname(media.from) ?: "unknown",
                content = path,
                type = FileUtils.messageTypeForMime(mime),
                timestamp = Date(),
                isRelay = false,
                isPrivate = media.private,
                recipientNickname = if (media.private) host.myNickname() else null,
                senderPeerID = media.from
            )
        )
    }

    override fun onFailed(hashHex: String, reason: MediaFailure) {
        if (reason == MediaFailure.CANCELLED) { remove(hashHex); return }
        val note = when (reason) {
            MediaFailure.HASH_MISMATCH -> "Corrupted in transit, discarded"
            MediaFailure.STALLED -> "Sender went out of range"
            MediaFailure.TOO_LARGE -> "Too large"
            MediaFailure.NEEDS_WIFI -> "Needs a shared Wi-Fi or hotspot"
            MediaFailure.DECRYPT_FAILED -> "Could not decrypt"
            MediaFailure.CANCELLED -> null
        }
        val cur = ui.value[hashHex] ?: MediaTransferUi(hashHex, "Media", "", 0f, MediaLane.BLUETOOTH)
        put(cur.copy(failed = true, note = note))
        scope.launch { delay(FAILED_LINGER_MS); remove(hashHex) }
    }

    override fun onServed(hashHex: String, to: String, served: Int, total: Int) {
        sendProgress?.invoke(hashHex, served, total, true)
    }

    private fun put(row: MediaTransferUi) { ui.value = ui.value + (row.hashHex to row) }
    private fun remove(hash: String) { ui.value = ui.value - hash; lastEmit.remove(hash) }

    private fun kindOf(tag: Int) = when (tag) {
        MimeTag.JPEG, MimeTag.PNG, MimeTag.WEBP -> "Photo"
        MimeTag.M4A -> "Voice note"
        MimeTag.MP4 -> "Video"
        else -> "File"
    }

    companion object {
        private const val TAG = "MediaTransfer"
        private const val KEY_BYTES = 32
        private const val PUMP_BUDGET = 4
        private const val PUMP_INTERVAL_MS = 120L
        private const val IDLE_INTERVAL_MS = 400L
        private const val PROGRESS_THROTTLE_MS = 200L
        private const val FAILED_LINGER_MS = 8_000L
    }
}
