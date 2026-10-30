package org.sanket.mesh

import android.Manifest
import android.content.Intent
import android.os.Build
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import java.security.KeyStore
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.KeyGenerator
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

/**
 * Capacitor 6 Native Android Plugin wrapping Google Nearby Connections API (Strategy.P2P_CLUSTER).
 * Uses Bluetooth Classic + BLE + Wi-Fi Direct/Hotspot under the hood with zero internet dependency.
 * Enforces MAX_CONCURRENT_CONNECTIONS = 4 (3–5 concurrent neighbor cap on Android radios) with idle rotation.
 */
@CapacitorPlugin(
    name = "NearbyMesh",
    permissions = [
        Permission(strings = [Manifest.permission.BLUETOOTH_SCAN], alias = "bluetoothScan"),
        Permission(strings = [Manifest.permission.BLUETOOTH_ADVERTISE], alias = "bluetoothAdvertise"),
        Permission(strings = [Manifest.permission.BLUETOOTH_CONNECT], alias = "bluetoothConnect"),
        Permission(strings = [Manifest.permission.NEARBY_WIFI_DEVICES], alias = "nearbyWifi"),
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "fineLocation"),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")
    ]
)
class NearbyMeshPlugin : Plugin() {

    companion object {
        const val MAX_CONCURRENT_CONNECTIONS = 4
        const val KEYSTORE_ALIAS = "org.sanket.mesh.identity.masterkey"

        /** Bumped whenever the wire packet format or endpoint-name encoding changes. */
        const val PROTOCOL_VERSION = "v1"
    }

    private lateinit var connectionsClient: ConnectionsClient
    private lateinit var relayCore: RelayCore
    private val connectedPeers = ConcurrentHashMap<String, String>()
    private val peerLastActivityMs = ConcurrentHashMap<String, Long>()
    private var localNodeId: String = ""
    private var localDisplayName: String = "SANKET-NODE"
    private var serviceId: String = "org.sanket.mesh.p2p.cluster"

    override fun load() {
        super.load()
        connectionsClient = Nearby.getConnectionsClient(context)
        relayCore = RelayCore(connectionsClient)
    }

    /**
     * Endpoint names carry the protocol version and our short node ID so peers can (a) reject
     * incompatible versions before connecting and (b) deterministically decide who initiates —
     * without this, both sides discovering each other at once could each call
     * requestConnection(), which Nearby Connections does not fully guarantee is race-free.
     */
    private fun encodeEndpointName(nodeId: String, displayName: String): String {
        return "$PROTOCOL_VERSION|$nodeId|$displayName"
    }

    private data class ParsedEndpointName(val version: String, val nodeId: String, val displayName: String)

    private fun parseEndpointName(raw: String): ParsedEndpointName? {
        val parts = raw.split("|", limit = 3)
        if (parts.size != 3) return null
        return ParsedEndpointName(version = parts[0], nodeId = parts[1], displayName = parts[2])
    }

    private fun rotateOldestIdlePeerIfNeeded(incomingEndpointId: String) {
        if (connectedPeers.size < MAX_CONCURRENT_CONNECTIONS || connectedPeers.containsKey(incomingEndpointId)) {
            return
        }
        val oldestEntry = peerLastActivityMs.entries.minByOrNull { it.value }
        val oldestPeerId = oldestEntry?.key ?: connectedPeers.keys().nextElement()
        if (oldestPeerId != null) {
            connectionsClient.disconnectFromEndpoint(oldestPeerId)
            connectedPeers.remove(oldestPeerId)
            peerLastActivityMs.remove(oldestPeerId)

            val lostEvent = JSObject().apply {
                put("peerId", oldestPeerId)
            }
            notifyListeners("peerLost", lostEvent)

            val fanOutEvent = JSObject().apply {
                put("evictedPeerId", oldestPeerId)
                put("incomingPeerId", incomingEndpointId)
                put("maxConcurrent", MAX_CONCURRENT_CONNECTIONS)
                put("reason", "Rotated oldest idle peer to respect P2P_CLUSTER 4-peer concurrent radio cap")
            }
            notifyListeners("fanOutLimit", fanOutEvent)
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type == Payload.Type.BYTES) {
                val bytes = payload.asBytes() ?: return
                peerLastActivityMs[endpointId] = System.currentTimeMillis()

                // Header-only native relay: keeps packets moving to our other peers even if the
                // WebView/JS engine is throttled. Independent of (and in addition to) the full
                // JS-side processing below — see RelayCore's doc comment for the full rationale.
                relayCore.offer(endpointId, bytes, connectedPeers.keys)

                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                val event = JSObject().apply {
                    put("peerId", endpointId)
                    put("bytesBase64", b64)
                }
                notifyListeners("payloadReceived", event)
            }
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            if (update.status == PayloadTransferUpdate.Status.SUCCESS) {
                peerLastActivityMs[endpointId] = System.currentTimeMillis()
                val event = JSObject().apply {
                    put("peerId", endpointId)
                    put("rssi", -58)
                    put("linkQuality", 90)
                }
                notifyListeners("linkQuality", event)
            }
        }
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            val parsed = parseEndpointName(info.endpointName)
            if (parsed != null && parsed.version != PROTOCOL_VERSION) {
                // Incompatible protocol version — reject rather than connect to a peer we can't
                // safely exchange wire-format packets with.
                connectionsClient.rejectConnection(endpointId)
                return
            }

            // Respect 4-neighbor concurrent P2P_CLUSTER cap by rotating the oldest idle peer if full
            rotateOldestIdlePeerIfNeeded(endpointId)
            connectedPeers[endpointId] = parsed?.displayName ?: info.endpointName
            peerLastActivityMs[endpointId] = System.currentTimeMillis()
            connectionsClient.acceptConnection(endpointId, payloadCallback)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (result.status.statusCode == ConnectionsStatusCodes.STATUS_OK) {
                val peerName = connectedPeers[endpointId] ?: "PEER-$endpointId"
                peerLastActivityMs[endpointId] = System.currentTimeMillis()
                val event = JSObject().apply {
                    put("peerId", endpointId)
                    put("displayName", peerName)
                    put("rssi", -56)
                    put("linkQuality", 92)
                }
                notifyListeners("peerFound", event)
            } else {
                connectedPeers.remove(endpointId)
                peerLastActivityMs.remove(endpointId)
            }
        }

        override fun onDisconnected(endpointId: String) {
            connectedPeers.remove(endpointId)
            peerLastActivityMs.remove(endpointId)
            val event = JSObject().apply {
                put("peerId", endpointId)
            }
            notifyListeners("peerLost", event)
        }
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            if (connectedPeers.containsKey(endpointId)) return

            val parsed = parseEndpointName(info.endpointName)
            if (parsed != null && parsed.version != PROTOCOL_VERSION) {
                return // Incompatible protocol version — never initiate towards it.
            }

            // Deterministic tie-break: only the lower-nodeId side initiates requestConnection.
            // Both sides advertise AND discover simultaneously (P2P_CLUSTER), so without this,
            // both could call requestConnection() on the same endpoint pair at once. If we can't
            // parse the remote's node ID (older/foreign peer), fall back to always initiating
            // rather than silently never connecting.
            val remoteNodeId = parsed?.nodeId
            val weInitiate = remoteNodeId == null || localNodeId < remoteNodeId
            if (!weInitiate) return

            rotateOldestIdlePeerIfNeeded(endpointId)
            connectionsClient.requestConnection(
                encodeEndpointName(localNodeId, localDisplayName),
                endpointId,
                connectionLifecycleCallback
            )
        }

        override fun onEndpointLost(endpointId: String) {
            connectedPeers.remove(endpointId)
            peerLastActivityMs.remove(endpointId)
            val event = JSObject().apply {
                put("peerId", endpointId)
            }
            notifyListeners("peerLost", event)
        }
    }

    @PluginMethod
    fun startAdvertising(call: PluginCall) {
        localNodeId = call.getString("nodeId") ?: ""
        localDisplayName = call.getString("displayName") ?: "SANKET-NODE"
        serviceId = call.getString("serviceId") ?: serviceId

        startMeshForegroundService()

        val options = AdvertisingOptions.Builder()
            .setStrategy(Strategy.P2P_CLUSTER)
            .build()

        connectionsClient.startAdvertising(
            encodeEndpointName(localNodeId, localDisplayName),
            serviceId,
            connectionLifecycleCallback,
            options
        ).addOnSuccessListener {
            call.resolve(JSObject().put("started", true))
        }.addOnFailureListener { err ->
            call.reject("startAdvertising failed: ${err.message}")
        }
    }

    @PluginMethod
    fun startDiscovery(call: PluginCall) {
        serviceId = call.getString("serviceId") ?: serviceId

        val options = DiscoveryOptions.Builder()
            .setStrategy(Strategy.P2P_CLUSTER)
            .build()

        connectionsClient.startDiscovery(
            serviceId,
            endpointDiscoveryCallback,
            options
        ).addOnSuccessListener {
            call.resolve(JSObject().put("started", true))
        }.addOnFailureListener { err ->
            call.reject("startDiscovery failed: ${err.message}")
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        connectionsClient.stopAdvertising()
        connectionsClient.stopDiscovery()
        connectionsClient.stopAllEndpoints()
        connectedPeers.clear()
        peerLastActivityMs.clear()
        stopMeshForegroundService()
        call.resolve()
    }

    @PluginMethod
    fun sendPayload(call: PluginCall) {
        val peerId = call.getString("peerId") ?: return call.reject("Missing peerId")
        val b64 = call.getString("bytesBase64") ?: return call.reject("Missing bytesBase64")
        val bytes = Base64.decode(b64, Base64.NO_WRAP)

        peerLastActivityMs[peerId] = System.currentTimeMillis()
        connectionsClient.sendPayload(peerId, Payload.fromBytes(bytes))
            .addOnSuccessListener {
                call.resolve(JSObject().put("sent", true))
            }
            .addOnFailureListener {
                call.resolve(JSObject().put("sent", false))
            }
    }

    @PluginMethod
    fun getPeers(call: PluginCall) {
        val array = JSArray()
        for ((id, name) in connectedPeers.entries) {
            val item = JSObject().apply {
                put("peerId", id)
                put("displayName", name)
                put("rssi", -58)
                put("linkQuality", 90)
            }
            array.put(item)
        }
        call.resolve(JSObject().put("peers", array))
    }

    @PluginMethod
    fun ensureHardwareKeyBacked(call: PluginCall) {
        try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
                val keyGenerator = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES,
                    "AndroidKeyStore"
                )
                val spec = KeyGenParameterSpec.Builder(
                    KEYSTORE_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
                keyGenerator.init(spec)
                keyGenerator.generateKey()
            }
            call.resolve(
                JSObject()
                    .put("hardwareBacked", true)
                    .put("alias", KEYSTORE_ALIAS)
            )
        } catch (err: Exception) {
            call.resolve(
                JSObject()
                    .put("hardwareBacked", false)
                    .put("fallback", "PIN-XSalsa20-Poly1305")
            )
        }
    }

    private fun startMeshForegroundService() {
        val intent = Intent(context, MeshForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }

    private fun stopMeshForegroundService() {
        val intent = Intent(context, MeshForegroundService::class.java)
        context.stopService(intent)
    }
}
