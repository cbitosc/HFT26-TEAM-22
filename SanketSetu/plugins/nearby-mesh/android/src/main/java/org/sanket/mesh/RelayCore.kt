package org.sanket.mesh

import android.util.Log
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.Payload
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Header-only native relay (plugins/nearby-mesh/.../RelayCore.kt).
 *
 * Architectural split (documented in docs/SECURITY.md and README.md): this class does NOT
 * verify Ed25519 signatures, decrypt payloads, or make any trust decision — it only reads the
 * three wire-format fields it needs (`id`, `ttl`, `hops`) to dedup and decrement-and-forward a
 * packet to this device's OTHER connected peers. The TypeScript MeshEngine remains the sole
 * authority for signature verification, decryption, ACKs, delivery state, and UI — it receives
 * every payload exactly as before via `payloadReceived`, independent of what RelayCore does.
 *
 * Why this exists: on Android the WebView can be throttled heavily (Doze, App Standby, or the
 * OS simply deprioritizing a backgrounded renderer) even while this plugin's foreground service
 * keeps the process and the Nearby Connections radio alive. Without a relay path that does not
 * depend on the WebView event loop running promptly, the mesh stops forwarding other nodes'
 * traffic whenever the screen is off or the app is backgrounded — defeating the "offline mesh"
 * requirement. RelayCore is the fallback that keeps packets moving in that situation.
 *
 * Trade-off (also documented): this is an unconditional, unprioritized, unjittered forward — it
 * has none of the TS engine's priority scheduling, jitter, or overhear suppression. Under normal
 * operation (WebView running) a packet is typically relayed by BOTH paths; receiving nodes'
 * normal per-packet-id dedup absorbs the duplicate, so this costs a little extra radio traffic,
 * never correctness. Because this class never verifies signatures, a malicious peer could flood
 * fabricated packets purely to burn radio/battery; this is bounded only by the dedup cache size
 * and TTL, not by any trust check — a known limitation, see docs/SECURITY.md.
 */
class RelayCore(private val connectionsClient: ConnectionsClient) {

    companion object {
        private const val TAG = "SanketRelayCore"
        private const val SEEN_CACHE_MAX_ENTRIES = 4096
        private const val SEEN_CACHE_TTL_MS = 60 * 60 * 1000L // 1 hour, matches MESH_CONSTANTS.SEEN_CACHE_TTL_MS
    }

    private data class SeenEntry(val expiresAtMs: Long)

    private val seen = ConcurrentHashMap<String, SeenEntry>()
    private val insertionOrder = java.util.Collections.synchronizedList(ArrayList<String>())

    /** Mirrors the TS PowerManager mode so Saver can restrict native relay the same way the
     * TS engine's own canRelayUnderPowerPolicy does (priority.ts): only P0/P1 relay. */
    @Volatile
    private var powerMode: String = "active"

    fun setPowerMode(mode: String) {
        powerMode = mode
    }

    /**
     * Called with every payload this device receives, before (and independent of) JS processing.
     * Relays it on to every other currently-connected endpoint if it is new and still has hops
     * left. Never throws — any malformed packet is silently ignored by this layer (the TS engine
     * will separately reject it when it processes the same bytes via payloadReceived).
     */
    fun offer(fromEndpointId: String, bytes: ByteArray, connectedEndpointIds: Collection<String>) {
        try {
            val json = JSONObject(String(bytes, Charsets.UTF_8))
            val id = json.optString("id", "")
            val ttl = json.optInt("ttl", 0)
            if (id.isEmpty()) return

            // HELLO / SYNC_INV / SYNC_REQ are link-local: the TypeScript engine never relays them,
            // so neither does this layer (otherwise phones two hops away would see them).
            val type = json.optString("type", "")
            if (type == "HELLO" || type == "SYNC_INV" || type == "SYNC_REQ") return

            pruneExpired()
            if (seen.containsKey(id)) {
                return // Already relayed this packet id — standard flood-suppression dedup.
            }
            markSeen(id)

            // Saver mode: only relay P0 (SOS/SOS_ACK) and P1 (Emergency/Safe/Hazard), matching
            // the TS engine's own canRelayUnderPowerPolicy (src/mesh/priority.ts). Control
            // packets (prio 3: HELLO/ACK/SYNC_INV/SYNC_REQ) have no "prio" field semantics that
            // matter here since they're small and link-local (TTL 2) — only dropped if >=2.
            val prio = json.optInt("prio", 0)
            if (powerMode == "saver" && prio >= 2) {
                return
            }

            val nextTtl = ttl - 1
            if (nextTtl <= 0) {
                return // Reached TTL 0 — do not relay further.
            }

            val hops = json.optInt("hops", 0)
            json.put("ttl", nextTtl)
            json.put("hops", hops + 1)
            val forwardedBytes = json.toString().toByteArray(Charsets.UTF_8)
            val payload = Payload.fromBytes(forwardedBytes)

            for (endpointId in connectedEndpointIds) {
                if (endpointId == fromEndpointId) continue
                connectionsClient.sendPayload(endpointId, payload)
            }
        } catch (err: Exception) {
            Log.d(TAG, "RelayCore.offer: ignoring malformed/non-JSON payload (${err.message})")
        }
    }

    private fun markSeen(id: String) {
        val now = System.currentTimeMillis()
        seen[id] = SeenEntry(now + SEEN_CACHE_TTL_MS)
        insertionOrder.add(id)
        if (insertionOrder.size > SEEN_CACHE_MAX_ENTRIES) {
            val oldest = insertionOrder.removeAt(0)
            seen.remove(oldest)
        }
    }

    private fun pruneExpired() {
        val now = System.currentTimeMillis()
        val iterator = seen.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (entry.value.expiresAtMs <= now) {
                iterator.remove()
                insertionOrder.remove(entry.key)
            }
        }
    }

    fun clear() {
        seen.clear()
        insertionOrder.clear()
    }
}
