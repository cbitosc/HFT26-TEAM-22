package com.bitchat.android.sos

import android.content.Context
import android.util.Log
import com.bitchat.android.ai.sos.AckKind
import com.bitchat.android.ai.sos.Ed25519Verifier
import com.bitchat.android.ai.sos.LocationOutcome
import com.bitchat.android.ai.sos.LocationTier
import com.bitchat.android.ai.sos.ResponderReply
import com.bitchat.android.ai.sos.ResponderRole
import com.bitchat.android.ai.sos.ResponderVerdict
import com.bitchat.android.ai.sos.ResponderVerifier
import com.bitchat.android.ai.sos.SosAck
import com.bitchat.android.ai.sos.SosCategory
import com.bitchat.android.ai.sos.SosLanguage
import com.bitchat.android.ai.sos.SosLocation
import com.bitchat.android.ai.sos.SosPayload
import com.bitchat.android.ai.sos.SosProtocol
import com.bitchat.android.ai.sos.SosTrackerState
import com.bitchat.android.ai.sos.UnverifiedReason
import com.bitchat.android.util.AppConstants
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Base64
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.random.Random

/**
 * Owns everything SOS: the victim's choices, the outgoing SOS and its four-stage tracker, replies to
 * other people's SOS, and this device's responder certificate.
 *
 * A process-wide singleton (like `MeshServiceHolder`) because incoming SOS must be handled — and
 * automatic receipts sent — by the mesh service even when no screen is open. The mesh attaches
 * itself with [attach]; nothing else in the BLE stack knows about SOS.
 */
object SosCoordinator {
    private const val TAG = "SosCoordinator"
    private val MESSAGE_TTL = AppConstants.MESSAGE_TTL_HOPS.toInt()
    private const val SEEN_RECEIPTS_MAX = 256

    /** What the receive path should do with a public message after the coordinator saw it. */
    enum class Intake {
        /** Not SOS traffic — handle as a normal chat message. */
        NOT_SOS,

        /** A reply or receipt: processed here, must not appear as a chat line. */
        CONSUMED,

        /** Somebody's SOS: shown in the chat as an SOS card. */
        SHOW
    }

    enum class SendOutcome { SENT, NO_MESH, ALREADY_SENDING }

    class InstallResult(val ok: Boolean, val message: String)

    class ResponderIdentity(
        val callsign: String,
        val roleLabel: String,
        /** Non-null for development authorities, e.g. "DEMO AUTHORITY". */
        val issuerNote: String?,
        val expiresAtEpochSec: Long
    )

    data class UiState(
        val language: SosLanguage = SosLanguage.EN,
        val tier: LocationTier = LocationTier.COARSE,
        val selected: SosCategory? = null,
        val sending: Boolean = false,
        /** The sender's own live SOS, or null. */
        val tracker: SosTrackerState? = null,
        /** When an "I'm safe" check-in was last sent from this screen. */
        val safeSentAtMs: Long? = null,
        val responder: ResponderIdentity? = null,
        /** Strongest reply this device has sent per SOS id, so buttons can show what was done. */
        val respondedTo: Map<String, AckKind> = emptyMap()
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val sendGuard = AtomicBoolean(false)
    private val receiptsSent = LinkedHashSet<String>()

    @Volatile private var bridge: SosMeshBridge? = null
    @Volatile private var appContext: Context? = null
    private var prefs: SosPreferences? = null

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    /** Called by the mesh service when it starts; replaces any earlier (stale) bridge. */
    @Synchronized
    fun attach(context: Context, newBridge: SosMeshBridge) {
        val app = context.applicationContext
        appContext = app
        bridge = newBridge
        val p = prefs ?: SosPreferences(app).also { prefs = it }
        _state.update { it.copy(language = p.language, tier = p.tier) }
        refreshResponder()
    }

    /** Clears all state so each unit test starts from a fresh process. */
    @androidx.annotation.VisibleForTesting
    internal fun resetForTesting() {
        bridge = null
        prefs?.responderCertificate = null
        synchronized(receiptsSent) { receiptsSent.clear() }
        sendGuard.set(false)
        _state.value = UiState()
    }

    // ---- victim choices -----------------------------------------------------------------------

    fun setLanguage(language: SosLanguage) {
        prefs?.language = language
        _state.update { it.copy(language = language) }
    }

    fun setTier(tier: LocationTier) {
        prefs?.tier = tier
        _state.update { it.copy(tier = tier) }
    }

    fun select(category: SosCategory?) = _state.update { it.copy(selected = category) }

    /**
     * What a bare hold-to-send transmits: the situation picked in this session, else general help.
     * Never a remembered one from an earlier emergency, and never the "I'm safe" check-in.
     */
    fun defaultCategory(): SosCategory = _state.value.selected?.takeIf { it.isDistress } ?: SosCategory.GENERAL

    // ---- sending ------------------------------------------------------------------------------

    /**
     * Broadcasts an SOS (or, for [SosCategory.SAFE], a lower-priority shelter check-in).
     * Suspends briefly to read GPS when a location tier is chosen; never blocks on it for long.
     */
    suspend fun send(category: SosCategory): SendOutcome {
        val b = bridge
        val ctx = appContext
        if (b == null || ctx == null) return SendOutcome.NO_MESH
        if (!sendGuard.compareAndSet(false, true)) return SendOutcome.ALREADY_SENDING
        try {
            _state.update { it.copy(sending = true) }
            val tier = _state.value.tier
            val fix = if (tier != LocationTier.NONE) SosLocationSource.lastKnown(ctx) else null
            val latLon = SosLocation.format(tier, fix?.first, fix?.second)
            val outcome = when {
                tier == LocationTier.NONE -> LocationOutcome.NOT_SHARED
                latLon != null -> LocationOutcome.SHARED
                else -> LocationOutcome.NO_FIX
            }
            val payload = SosPayload(
                id = SosProtocol.newSosId(),
                category = category,
                tier = if (latLon == null) LocationTier.NONE else tier,
                latLon = latLon
            )
            val peers = b.connectedPeerCount()
            // Priority 0 = CRITICAL, the front of the existing priority broadcast queue.
            b.broadcast(SosProtocol.encodeSos(payload), priority = if (category.isDistress) 0 else 1, ttl = MESSAGE_TTL)
            Log.i(TAG, "Sent ${if (category.isDistress) "SOS" else "check-in"} ${payload.id} cat=${category.code} tier=${payload.tier} peers=$peers")

            val now = System.currentTimeMillis()
            _state.update {
                if (category.isDistress) {
                    it.copy(
                        sending = false, safeSentAtMs = null,
                        tracker = SosTrackerState(
                            sosId = payload.id, category = category, tier = payload.tier, latLon = latLon,
                            locationOutcome = outcome, createdAtMs = now, handedToPeers = peers
                        )
                    )
                } else {
                    it.copy(sending = false, safeSentAtMs = now)
                }
            }
            return SendOutcome.SENT
        } finally {
            _state.update { it.copy(sending = false) }
            sendGuard.set(false)
        }
    }

    /** Dismisses the sender's tracker so a new SOS can be composed. Does not recall anything already sent. */
    fun clearTracker() = _state.update { it.copy(tracker = null, safeSentAtMs = null) }

    // ---- receiving ----------------------------------------------------------------------------

    /**
     * Called by the mesh for every public text message that already passed signature and
     * known-peer checks. [packetTtl] is the TTL as received (each relay subtracts one) and
     * [senderSigningKey] the Ed25519 key that signed the packet.
     */
    fun onBroadcastText(
        text: String,
        fromPeerId: String,
        packetTimestampMs: Long,
        packetTtl: Int,
        senderSigningKey: ByteArray?
    ): Intake {
        if (!SosProtocol.looksLikeSosTraffic(text)) return Intake.NOT_SOS
        val b = bridge ?: return Intake.NOT_SOS

        SosProtocol.parseAck(text)?.let { ack ->
            handleAck(b, ack, fromPeerId, packetTtl, senderSigningKey)
            return Intake.CONSUMED
        }
        SosProtocol.parseSos(text)?.let { sos ->
            handleIncomingSos(b, sos, fromPeerId, packetTimestampMs, packetTtl)
            return Intake.SHOW
        }
        return Intake.NOT_SOS
    }

    private fun handleAck(b: SosMeshBridge, ack: SosAck, fromPeerId: String, packetTtl: Int, signer: ByteArray?) {
        val tracker = _state.value.tracker
        // Only replies to *our* live SOS matter; everything else is other people's traffic.
        if (tracker == null || tracker.sosId != ack.sosId || !ack.originPeerId.equals(b.myPeerId, ignoreCase = true)) return

        val verdict = ResponderVerifier.verify(
            token = ack.certificate,
            packetSignerKey = signer,
            nowEpochSec = System.currentTimeMillis() / 1000,
            anchors = TrustAnchors.all(),
            verifier = verifierFor(b)
        )
        val cert = (verdict as? ResponderVerdict.Verified)?.certificate
        val reply = ResponderReply(
            peerId = fromPeerId,
            kind = ack.kind,
            callsign = cert?.callsign ?: ack.callsign,
            verified = cert != null,
            roleLabel = cert?.role?.label,
            issuerNote = cert?.let { TrustAnchors.issuerNote(it.authorityKeyId) },
            hops = (ack.initialTtl - packetTtl).coerceAtLeast(0),
            note = ack.note,
            receivedAtMs = System.currentTimeMillis()
        )
        Log.i(TAG, "Reply to ${ack.sosId}: kind=${ack.kind} from=${fromPeerId.take(8)} verified=${cert != null} hops=${reply.hops}" +
            ((verdict as? ResponderVerdict.Unverified)?.takeIf { ack.certificate != null }?.let { " (cert rejected: ${it.reason})" } ?: ""))
        _state.update { s ->
            val t = s.tracker
            if (t != null && t.sosId == ack.sosId) s.copy(tracker = t.withReply(reply)) else s
        }
    }

    private fun handleIncomingSos(b: SosMeshBridge, sos: SosPayload, fromPeerId: String, ts: Long, packetTtl: Int) {
        // Only fresh distress calls get an automatic receipt: gossip sync replays history to newly
        // joined devices, and answering all of it would flood the mesh with stale receipts.
        if (!sos.category.isDistress || !SosProtocol.isFresh(ts, System.currentTimeMillis())) return
        if (fromPeerId.equals(b.myPeerId, ignoreCase = true)) return
        synchronized(receiptsSent) {
            if (!receiptsSent.add(sos.id)) return
            if (receiptsSent.size > SEEN_RECEIPTS_MAX) receiptsSent.remove(receiptsSent.first())
        }
        // Buzz + notify the person nearby (once per SOS id, only fresh distress calls from someone else).
        appContext?.let { ctx ->
            try {
                SosAlertNotifier.alert(ctx, sos, b.peerNickname(fromPeerId), _state.value.language)
            } catch (e: Exception) {
                Log.w(TAG, "SOS alert failed: ${e.message}")
            }
        }

        val hopsFromOrigin = (MESSAGE_TTL - packetTtl).coerceAtLeast(0)
        // Enough TTL to get back across the same number of relays; at least 4 so relays treat it on
        // the same always-relay path as the SOS itself instead of dropping it probabilistically.
        val ttl = (hopsFromOrigin + 2).coerceIn(4, MESSAGE_TTL)
        scope.launch {
            delay(Random.nextLong(400, 2_500)) // spread receipts so a crowd does not collide on the radio
            val ack = SosAck(
                sosId = sos.id, originPeerId = fromPeerId, kind = AckKind.RECEIVED, initialTtl = ttl,
                callsign = b.myNickname(), certificate = null, note = null
            )
            try {
                b.broadcast(SosProtocol.encodeAck(ack), priority = 1, ttl = ttl, syncable = false)
                Log.d(TAG, "Receipt sent for ${sos.id} (ttl=$ttl)")
            } catch (e: Exception) {
                Log.w(TAG, "Receipt failed: ${e.message}")
            }
        }
    }

    // ---- responding to somebody else's SOS ----------------------------------------------------

    /**
     * Sends a human reply. A certificate is attached only if this device currently holds a valid
     * one; otherwise the reply goes out as an ordinary (unverified) civilian relay.
     */
    fun respond(sosId: String, originPeerId: String, kind: AckKind, note: String? = null): Boolean {
        val b = bridge ?: return false
        if (kind == AckKind.RECEIVED) return false
        refreshResponder()
        val identity = _state.value.responder
        val token = if (identity != null) prefs?.responderCertificate else null
        val ack = SosAck(
            sosId = sosId, originPeerId = originPeerId, kind = kind, initialTtl = MESSAGE_TTL,
            callsign = identity?.callsign ?: b.myNickname(), certificate = token, note = note
        )
        b.broadcast(SosProtocol.encodeAck(ack), priority = 0, ttl = MESSAGE_TTL)
        _state.update { s ->
            val prev = s.respondedTo[sosId]
            if (prev != null && prev >= kind) s else s.copy(respondedTo = s.respondedTo + (sosId to kind))
        }
        return true
    }

    // ---- responder identity -------------------------------------------------------------------

    /** The key an authority must issue a certificate for, as base64url. Null until the mesh is up. */
    fun mySigningKeyToken(): String? =
        bridge?.mySigningPublicKey()?.let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

    fun installCertificate(token: String): InstallResult {
        val b = bridge ?: return InstallResult(false, "Mesh is not running yet.")
        val verdict = verdictFor(b, token.trim())
        return when (verdict) {
            is ResponderVerdict.Verified -> {
                prefs?.responderCertificate = token.trim()
                refreshResponder()
                InstallResult(true, "Certificate accepted: ${verdict.certificate.role.label} ${verdict.certificate.callsign}")
            }
            is ResponderVerdict.Unverified -> InstallResult(false, describe(verdict.reason))
        }
    }

    fun clearCertificate() {
        prefs?.responderCertificate = null
        refreshResponder()
    }

    /** Debug builds only: certify this phone with the development authority. */
    val demoAuthorityAvailable: Boolean get() = DemoAuthority.enabled

    fun issueDemoCertificate(role: ResponderRole, callsign: String): InstallResult {
        val key = bridge?.mySigningPublicKey() ?: return InstallResult(false, "Mesh is not running yet.")
        val clean = callsign.trim().take(SosProtocol.MAX_CALLSIGN_CHARS).ifEmpty { "DEMO-1" }
        val token = DemoAuthority.issue(role, clean, key, validDays = 30)
            ?: return InstallResult(false, "Demo authority is not available in this build.")
        return installCertificate(token)
    }

    private fun refreshResponder() {
        val b = bridge ?: return
        val token = prefs?.responderCertificate
        val cert = (verdictFor(b, token) as? ResponderVerdict.Verified)?.certificate
        val identity = cert?.let {
            ResponderIdentity(it.callsign, it.role.label, TrustAnchors.issuerNote(it.authorityKeyId), it.expiresAtEpochSec)
        }
        _state.update { it.copy(responder = identity) }
    }

    private fun verdictFor(b: SosMeshBridge, token: String?): ResponderVerdict =
        ResponderVerifier.verify(token, b.mySigningPublicKey(), System.currentTimeMillis() / 1000, TrustAnchors.all(), verifierFor(b))

    private fun verifierFor(b: SosMeshBridge) = Ed25519Verifier { sig, data, pub -> b.verifyEd25519(sig, data, pub) }

    private fun describe(r: UnverifiedReason): String = when (r) {
        UnverifiedReason.NO_CERTIFICATE -> "Paste a certificate first."
        UnverifiedReason.MALFORMED -> "That is not a valid certificate."
        UnverifiedReason.UNKNOWN_AUTHORITY -> "Issued by an authority this app does not trust."
        UnverifiedReason.BAD_SIGNATURE -> "The certificate signature is invalid."
        UnverifiedReason.EXPIRED -> "The certificate has expired."
        UnverifiedReason.KEY_MISMATCH -> "This certificate was issued for a different phone."
    }
}
