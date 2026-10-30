package org.sanket.mesh

import com.google.android.gms.nearby.connection.ConnectionsClient
import java.util.concurrent.ConcurrentHashMap

/**
 * Connection admission control for the P2P_CLUSTER mesh (plugins/nearby-mesh/.../ConnectionManager.kt).
 *
 * Owns three related responsibilities, kept together because they all gate "should we be
 * connected to this endpoint":
 * 1. The ~3-5 concurrent-link cap Nearby Connections devices reliably sustain — enforced here as
 *    a hard [MAX_CONCURRENT_CONNECTIONS], rotating out the least-recently-active peer when a new
 *    one needs a slot. This is device-dependent in practice; never claim unlimited connections.
 * 2. Protocol-version-tagged endpoint names ("v1|<nodeId>|<displayName>"), so an incompatible
 *    peer (future wire-format change) is rejected before any packet is exchanged with it.
 * 3. The deterministic "lower node ID initiates" tie-break. P2P_CLUSTER has both sides
 *    simultaneously advertising AND discovering, so on mutual discovery both could otherwise
 *    call requestConnection() on each other at once; only one side may safely initiate.
 */
class ConnectionManager(
    private val connectionsClient: ConnectionsClient,
    private val maxConcurrentConnections: Int = MAX_CONCURRENT_CONNECTIONS,
) {
    companion object {
        const val MAX_CONCURRENT_CONNECTIONS = 4

        /** Bumped whenever the wire packet format or endpoint-name encoding changes. */
        const val PROTOCOL_VERSION = "v1"
    }

    data class ParsedEndpointName(
        val version: String,
        val nodeId: String,
        val displayName: String,
    )

    interface Listener {
        fun onPeerLost(peerId: String)
        fun onFanOutLimit(evictedPeerId: String, incomingPeerId: String, maxConcurrent: Int, reason: String)
    }

    var listener: Listener? = null

    /** endpointId -> display name, for currently-connected peers only. */
    val connectedPeers = ConcurrentHashMap<String, String>()
    private val peerLastActivityMs = ConcurrentHashMap<String, Long>()

    fun encodeEndpointName(nodeId: String, displayName: String): String {
        return "$PROTOCOL_VERSION|$nodeId|$displayName"
    }

    fun parseEndpointName(raw: String): ParsedEndpointName? {
        val parts = raw.split("|", limit = 3)
        if (parts.size != 3) return null
        return ParsedEndpointName(version = parts[0], nodeId = parts[1], displayName = parts[2])
    }

    /** An endpoint whose name we can't parse is treated as compatible (older/foreign peer, don't hard-block it). */
    fun isVersionCompatible(parsed: ParsedEndpointName?): Boolean {
        return parsed == null || parsed.version == PROTOCOL_VERSION
    }

    /**
     * True if the LOCAL side should be the one to call requestConnection() for this remote node.
     * If the remote's node ID can't be determined, default to initiating rather than risking both
     * sides silently never connecting.
     */
    fun shouldInitiate(localNodeId: String, remoteNodeId: String?): Boolean {
        return remoteNodeId == null || localNodeId < remoteNodeId
    }

    fun markActive(endpointId: String) {
        peerLastActivityMs[endpointId] = System.currentTimeMillis()
    }

    fun registerConnected(endpointId: String, displayName: String) {
        connectedPeers[endpointId] = displayName
        markActive(endpointId)
    }

    fun unregister(endpointId: String) {
        connectedPeers.remove(endpointId)
        peerLastActivityMs.remove(endpointId)
    }

    fun isConnected(endpointId: String): Boolean = connectedPeers.containsKey(endpointId)

    fun clear() {
        connectedPeers.clear()
        peerLastActivityMs.clear()
    }

    /**
     * Enforces [maxConcurrentConnections] by disconnecting the least-recently-active peer when a
     * new endpoint needs a slot. No-op if already under the cap or already connected to it.
     */
    fun rotateOldestIdlePeerIfNeeded(incomingEndpointId: String) {
        if (connectedPeers.size < maxConcurrentConnections || connectedPeers.containsKey(incomingEndpointId)) {
            return
        }
        val oldestEntry = peerLastActivityMs.entries.minByOrNull { it.value }
        val oldestPeerId = oldestEntry?.key ?: connectedPeers.keys().nextElement()
        if (oldestPeerId != null) {
            connectionsClient.disconnectFromEndpoint(oldestPeerId)
            unregister(oldestPeerId)
            listener?.onPeerLost(oldestPeerId)
            listener?.onFanOutLimit(
                oldestPeerId,
                incomingEndpointId,
                maxConcurrentConnections,
                "Rotated oldest idle peer to respect P2P_CLUSTER $maxConcurrentConnections-peer concurrent radio cap"
            )
        }
    }
}
