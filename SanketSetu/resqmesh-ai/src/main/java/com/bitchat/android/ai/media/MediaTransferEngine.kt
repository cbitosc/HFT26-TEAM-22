package com.bitchat.android.ai.media

import java.io.File
import java.io.RandomAccessFile
import java.util.ArrayDeque
import java.util.BitSet
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

enum class MediaLane { BLUETOOTH, WIFI }

enum class MediaFailure { HASH_MISMATCH, STALLED, TOO_LARGE, NEEDS_WIFI, DECRYPT_FAILED, CANCELLED }

/** Everything the engine needs from the radio. The app maps these onto mesh packets. */
interface MediaLink {
    /** [to] null = broadcast to the mesh. [key] non-null = private: deliver inside the Noise channel. */
    fun sendOffer(offer: MediaOffer, to: String?, key: ByteArray?)

    fun sendRequest(to: String, request: MediaRequest)

    /** False when [to] cannot be reached right now; the chunk stays queued. */
    fun sendChunk(to: String, chunk: MediaChunk): Boolean
}

interface MediaEvents {
    fun onIncoming(hashHex: String, from: String, offer: MediaOffer, private: Boolean) {}
    fun onProgress(hashHex: String, received: Int, total: Int, lane: MediaLane) {}
    fun onReceived(media: ReceivedMedia) {}
    fun onFailed(hashHex: String, reason: MediaFailure) {}
    fun onServed(hashHex: String, to: String, served: Int, total: Int) {}
}

/**
 * A verified blob. [file] is the shared content-addressed copy unless [temporary], in which case it is a
 * decrypted scratch file the caller owns (move or delete it).
 */
class ReceivedMedia(
    val hashHex: String,
    val from: String,
    val file: File,
    val mimeTag: Int,
    val size: Long,
    val thumbnail: ByteArray,
    val private: Boolean,
    val temporary: Boolean,
    val fromCache: Boolean
)

/**
 * Resumable, content-addressed media transfer over a lossy mesh.
 *
 * offer -> request(all bits) -> chunks. If the link stalls, [tick] re-requests only the missing bits after
 * [MediaLimits.RESUME_TIMEOUT_MS], so a transfer interrupted at 50% continues from 50%, never from chunk 0.
 * Large blobs can ride the Wi-Fi [LanLane] instead of Bluetooth when both phones share a network.
 */
class MediaTransferEngine(
    private val store: BlobStore,
    private val link: MediaLink,
    private val events: MediaEvents,
    private val lan: LanLane? = null,
    private val clock: () -> Long = { System.currentTimeMillis() }
) {
    /** Return false to ignore an offer (user policy, storage, trust). Default: fetch everything within limits. */
    @Volatile var shouldFetch: (offer: MediaOffer, from: String, private: Boolean) -> Boolean = { _, _, _ -> true }

    private val lock = Any()

    private class Outgoing(
        val offer: MediaOffer,
        val to: String?,
        val key: ByteArray?,
        val maxOfferTries: Int,
        var tries: Int = 1,
        var lastOfferMs: Long,
        var requested: Boolean = false
    )

    private class Outbox(val peer: String, val hashHex: String, var lastMs: Long) {
        val queue = ArrayDeque<Int>()
        val served = BitSet()
    }

    private val outgoing = HashMap<String, Outgoing>()
    private val outboxes = LinkedHashMap<String, Outbox>()
    private val incoming = HashMap<String, IncomingTransfer>()
    private val lanFailedUntil = HashMap<String, Long>()
    private val lanStreaming = HashSet<String>()
    private val executor: ExecutorService by lazy {
        Executors.newCachedThreadPool { r -> Thread(r, "media-lan-send").apply { isDaemon = true } }
    }

    // ------------------------------------------------------------------ sender

    /**
     * Stores [src] in the blob store and announces it. [to] null broadcasts a plaintext, deduplicated blob;
     * [to] + [key] sends a private blob whose chunks are sealed so relays only ever see ciphertext.
     */
    fun offer(src: File, mimeTag: Int, thumbnail: ByteArray, to: String?, key: ByteArray? = null): MediaOffer {
        require(src.isFile) { "no such file" }
        val size = src.length()
        require(size in 1..MediaLimits.LAN_MAX_BYTES) { "media size out of range" }
        require(thumbnail.size <= MediaLimits.MAX_THUMBNAIL_BYTES) { "thumbnail too large" }
        if (key != null) {
            require(MediaCipher.isValidKey(key)) { "bad key" }
            require(to != null) { "private media needs a recipient" }
        }
        val wire = MediaLimits.chunkSizeFor(size)
        store.trim(activeHashes(), size)
        val ref = if (key == null) store.putFile(src) else store.putEncrypted(src, key, wire)
        val offer = MediaOffer(ref.hash, ref.size, mimeTag, wire, thumbnail)
        synchronized(lock) {
            outgoing[ref.hashHex] = Outgoing(
                offer = offer, to = to, key = key,
                maxOfferTries = if (to == null) BROADCAST_OFFER_TRIES else PRIVATE_OFFER_TRIES,
                lastOfferMs = clock()
            )
        }
        link.sendOffer(offer, to, key)
        return offer
    }

    fun onRequest(from: String, request: MediaRequest) {
        synchronized(lock) {
            val out = outgoing[request.hashHex] ?: return
            if (request.chunkCount != out.offer.chunkCount) return
            if (out.to != null && out.to != from) return // private blobs go to their recipient only
            out.requested = true
            val now = clock()
            val indexes = request.indexes.filter { it in 0 until out.offer.chunkCount }.sorted()
            if (indexes.isEmpty()) return
            val key = from + "|" + request.hashHex

            val ep = request.lan
            if (lan != null && ep != null && out.offer.totalSize > MediaLimits.LAN_THRESHOLD_BYTES &&
                (lanFailedUntil[from] ?: 0L) <= now
            ) {
                if (!lanStreaming.add(key)) return // a stream for this pair is already in flight
                outboxes.remove(key)
                executor.execute { streamOverLan(from, out.offer, indexes, ep, key) }
                return
            }
            val box = outboxes.getOrPut(key) { Outbox(from, request.hashHex, now) }
            box.queue.clear() // a resume replaces whatever was still queued: no duplicates, no restart
            box.queue.addAll(indexes)
            box.lastMs = now
        }
    }

    /** Sends up to [budget] queued chunks over Bluetooth. Returns true while more are waiting. */
    fun pump(budget: Int): Boolean {
        synchronized(lock) {
            if (outboxes.isEmpty()) return false
            val boxes = outboxes.values.toList()
            val blocked = HashSet<Outbox>()
            var sent = 0
            var progressed = true
            while (sent < budget && progressed) {
                progressed = false
                for (box in boxes) {
                    if (sent >= budget) break
                    if (box in blocked) continue
                    val idx = box.queue.peekFirst() ?: continue
                    val out = outgoing[box.hashHex]
                    val data = out?.let { store.readChunk(it.offer.hashHex, idx, it.offer.chunkSize, it.offer.totalSize) }
                    if (out == null || data == null) {
                        box.queue.pollFirst()
                        progressed = true
                        continue
                    }
                    if (!link.sendChunk(box.peer, MediaChunk(out.offer.blobHash, idx.toLong(), data))) {
                        blocked += box
                        continue
                    }
                    box.queue.pollFirst()
                    box.served.set(idx)
                    box.lastMs = clock()
                    sent++
                    progressed = true
                    events.onServed(box.hashHex, box.peer, box.served.cardinality(), out.offer.chunkCount)
                }
            }
            outboxes.values.removeAll { it.queue.isEmpty() }
            return outboxes.values.any { it.queue.isNotEmpty() }
        }
    }

    private fun streamOverLan(from: String, offer: MediaOffer, indexes: List<Int>, ep: LanEndpoint, key: String) {
        try {
            val lane = lan ?: return
            RandomAccessFile(store.file(offer.hashHex), "r").use { raf ->
                val it = indexes.iterator()
                lane.stream(ep, offer.blobHash, object : Iterator<MediaChunk> {
                    override fun hasNext() = it.hasNext()
                    override fun next(): MediaChunk {
                        val i = it.next()
                        val buf = ByteArray(offer.wireSize(i))
                        raf.seek(i.toLong() * offer.chunkSize)
                        raf.readFully(buf)
                        return MediaChunk(offer.blobHash, i.toLong(), buf)
                    }
                })
            }
            events.onServed(offer.hashHex, from, indexes.size, offer.chunkCount)
        } catch (_: Exception) {
            synchronized(lock) { lanFailedUntil[from] = clock() + LAN_RETRY_COOLDOWN_MS }
        } finally {
            synchronized(lock) { lanStreaming.remove(key) }
        }
    }

    // ---------------------------------------------------------------- receiver

    fun onOffer(from: String, offer: MediaOffer, key: ByteArray? = null) {
        synchronized(lock) {
            val hex = offer.hashHex
            if (outgoing.containsKey(hex)) return // our own offer echoing back
            incoming[hex]?.let { it.addSource(from); return }
            val private = key != null
            if (private && !MediaCipher.isValidKey(key)) return
            if (private && offer.chunkSize <= MediaLimits.AEAD_TAG_BYTES) return

            // Content addressing: a plain blob we already hold is never fetched again.
            if (!private && store.has(hex)) {
                events.onReceived(
                    ReceivedMedia(hex, from, store.file(hex), offer.mimeTag, offer.totalSize, offer.thumbnail,
                        private = false, temporary = false, fromCache = true)
                )
                return
            }
            val limit = MediaLimits.LAN_MAX_BYTES + MediaLimits.MAX_CHUNKS * MediaLimits.AEAD_TAG_BYTES
            if (offer.totalSize > limit) { events.onFailed(hex, MediaFailure.TOO_LARGE); return }
            if (offer.totalSize > MediaLimits.BLE_MAX_BYTES + MediaLimits.MAX_CHUNKS * MediaLimits.AEAD_TAG_BYTES && lan == null) {
                events.onFailed(hex, MediaFailure.NEEDS_WIFI); return
            }
            if (incoming.size >= MAX_ACTIVE_INCOMING) return
            if (!shouldFetch(offer, from, private)) return

            store.trim(activeHashes(), offer.totalSize)
            val t = IncomingTransfer(offer, key, store.partFile(hex), store.mapFile(hex), from, clock())
            incoming[hex] = t
            events.onIncoming(hex, from, offer, private)
            if (t.isComplete()) finish(t, from) else requestMissing(t)
        }
    }

    fun onChunk(from: String, chunk: MediaChunk) {
        synchronized(lock) {
            val t = incoming[chunk.hashHex] ?: return
            if (!t.hasSource(from)) return
            accept(t, chunk, MediaLane.BLUETOOTH, from)
        }
    }

    private fun onLanChunk(chunk: MediaChunk) {
        synchronized(lock) {
            val t = incoming[chunk.hashHex] ?: return
            accept(t, chunk, MediaLane.WIFI, t.currentSource)
        }
    }

    private fun accept(t: IncomingTransfer, chunk: MediaChunk, lane: MediaLane, from: String) {
        if (!t.accept(chunk.index, chunk.data, clock())) return
        events.onProgress(t.offer.hashHex, t.receivedCount(), t.offer.chunkCount, lane)
        if (t.isComplete()) finish(t, from)
    }

    private fun finish(t: IncomingTransfer, from: String) {
        val hex = t.offer.hashHex
        incoming.remove(hex)
        lan?.stopListening(hex)
        t.close()
        if (!t.verifyHash()) {
            t.discard() // forged or corrupt: dropped whole, never delivered
            events.onFailed(hex, MediaFailure.HASH_MISMATCH)
            return
        }
        store.mapFile(hex).delete()
        if (t.key == null) {
            val file = store.adopt(t.partFile(), hex)
            events.onReceived(
                ReceivedMedia(hex, from, file, t.offer.mimeTag, t.offer.totalSize, t.offer.thumbnail,
                    private = false, temporary = false, fromCache = false)
            )
        } else {
            val dec = store.tempDecryptedFile(hex)
            val ok = t.decryptTo(dec)
            t.partFile().delete()
            if (!ok) {
                dec.delete()
                events.onFailed(hex, MediaFailure.DECRYPT_FAILED)
                return
            }
            events.onReceived(
                ReceivedMedia(hex, from, dec, t.offer.mimeTag, dec.length(), t.offer.thumbnail,
                    private = true, temporary = true, fromCache = false)
            )
        }
    }

    private fun requestMissing(t: IncomingTransfer) {
        val missing = t.missing()
        if (missing.isEmpty()) return
        val hex = t.offer.hashHex
        val ep = if (lan != null && t.offer.totalSize > MediaLimits.LAN_THRESHOLD_BYTES) {
            lan.listen(hex) { chunk -> onLanChunk(chunk) }
        } else null
        t.lastActivityMs = clock()
        link.sendRequest(t.currentSource, MediaRequest(t.offer.blobHash, t.offer.chunkCount, missing, ep))
    }

    /** A neighbour came back: ask it for what is still missing right away instead of waiting out the timer. */
    fun onPeerReconnected(peer: String) {
        synchronized(lock) {
            for (t in incoming.values.toList()) {
                if (t.useSource(peer)) requestMissing(t)
            }
        }
    }

    // -------------------------------------------------------------------- tick

    /** Call about once a second: resumes stalled transfers, retries unanswered offers, expires idle queues. */
    fun tick() {
        synchronized(lock) {
            val now = clock()
            for (t in incoming.values.toList()) {
                if (t.isComplete()) continue
                if (now - t.lastProgressMs > MediaLimits.GIVE_UP_AFTER_MS) {
                    incoming.remove(t.offer.hashHex)
                    lan?.stopListening(t.offer.hashHex)
                    t.persist()
                    t.close() // the partial stays on disk: a later offer of the same blob picks up where this stopped
                    events.onFailed(t.offer.hashHex, MediaFailure.STALLED)
                    continue
                }
                if (now - t.lastActivityMs >= MediaLimits.RESUME_TIMEOUT_MS) {
                    t.stalledResumes++
                    if (t.stalledResumes % 2 == 0) t.rotateSource()
                    t.persist()
                    requestMissing(t)
                }
            }
            for (o in outgoing.values) {
                if (!o.requested && o.tries < o.maxOfferTries && now - o.lastOfferMs >= OFFER_RETRY_MS) {
                    o.tries++
                    o.lastOfferMs = now
                    link.sendOffer(o.offer, o.to, o.key)
                }
            }
            outboxes.values.removeAll { it.queue.isEmpty() && now - it.lastMs > OUTBOX_IDLE_MS }
        }
    }

    fun cancel(hashHex: String) {
        synchronized(lock) {
            incoming.remove(hashHex)?.let { it.discard(); lan?.stopListening(hashHex); events.onFailed(hashHex, MediaFailure.CANCELLED) }
            outgoing.remove(hashHex)
            outboxes.values.removeAll { it.hashHex == hashHex }
        }
    }

    fun incomingCount(): Int = synchronized(lock) { incoming.size }

    fun missingOf(hashHex: String): List<Int>? = synchronized(lock) { incoming[hashHex]?.missing() }

    fun shutdown() {
        synchronized(lock) {
            for (t in incoming.values) { t.persist(); t.close(); lan?.stopListening(t.offer.hashHex) }
            incoming.clear()
        }
        if (lan != null) executor.shutdownNow()
    }

    private fun activeHashes(): Set<String> = synchronized(lock) { incoming.keys + outgoing.keys }

    companion object {
        const val MAX_ACTIVE_INCOMING = 4
        const val OFFER_RETRY_MS = 30_000L
        const val PRIVATE_OFFER_TRIES = 20
        const val BROADCAST_OFFER_TRIES = 3
        const val LAN_RETRY_COOLDOWN_MS = 60_000L
        const val OUTBOX_IDLE_MS = 5 * 60_000L
    }
}
