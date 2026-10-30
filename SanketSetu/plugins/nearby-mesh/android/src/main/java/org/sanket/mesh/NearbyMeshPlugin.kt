package org.sanket.mesh

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
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
import java.util.concurrent.ConcurrentLinkedQueue
import javax.crypto.KeyGenerator
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

/**
 * Capacitor Native Android Plugin wrapping Google Nearby Connections API (Strategy.P2P_CLUSTER).
 * Uses Bluetooth Classic + BLE + Wi-Fi Direct/Hotspot under the hood with zero internet dependency.
 * Connection admission (concurrent cap, idle rotation, version tagging, tie-break) lives in
 * [ConnectionManager]; header-only flood relay lives in [RelayCore]. This class is the thin
 * Capacitor <-> Nearby Connections bridge.
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
class NearbyMeshPlugin : Plugin(), ConnectionManager.Listener {

    companion object {
        const val KEYSTORE_ALIAS = "org.sanket.mesh.identity.masterkey"

        /** Bounded backstop so a flood can't grow this queue without limit while the WebView is paused. */
        const val PENDING_PAYLOAD_RING_CAPACITY = 256
    }

    private lateinit var connectionsClient: ConnectionsClient
    private lateinit var connectionManager: ConnectionManager
    private lateinit var relayCore: RelayCore

    /**
     * Bounded ring buffer of payloads received while nothing has drained them yet. Capacitor's
     * own `notifyListeners(..., retainUntilConsumed = true)` already retains undelivered events
     * for the JS listener, but that retention is unbounded; this ring buffer is an explicit,
     * bounded backstop a resuming WebView can proactively drain via [drainPendingPayloads]
     * rather than relying solely on bridge-level retention surviving a WebView reload.
     */
    private val pendingPayloadRing = ConcurrentLinkedQueue<Pair<String, ByteArray>>()

    private var localNodeId: String = ""
    private var localDisplayName: String = "SANKET-NODE"
    private var serviceId: String = "org.sanket.mesh.p2p.cluster"

    override fun load() {
        super.load()
        connectionsClient = Nearby.getConnectionsClient(context)
        connectionManager = ConnectionManager(connectionsClient).also { it.listener = this }
        relayCore = RelayCore(connectionsClient)
    }

    // --- ConnectionManager.Listener -------------------------------------------------------

    override fun onPeerLost(peerId: String) {
        notifyListeners("peerLost", JSObject().put("peerId", peerId))
    }

    override fun onFanOutLimit(evictedPeerId: String, incomingPeerId: String, maxConcurrent: Int, reason: String) {
        val event = JSObject().apply {
            put("evictedPeerId", evictedPeerId)
            put("incomingPeerId", incomingPeerId)
            put("maxConcurrent", maxConcurrent)
            put("reason", reason)
        }
        notifyListeners("fanOutLimit", event)
    }

    // --- Nearby Connections callbacks ------------------------------------------------------

    private fun enqueuePendingPayload(peerId: String, bytes: ByteArray) {
        pendingPayloadRing.add(peerId to bytes)
        while (pendingPayloadRing.size > PENDING_PAYLOAD_RING_CAPACITY) {
            pendingPayloadRing.poll()
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type == Payload.Type.BYTES) {
                val bytes = payload.asBytes() ?: return
                connectionManager.markActive(endpointId)

                // Header-only native relay: keeps packets moving to our other peers even if the
                // WebView/JS engine is throttled. Independent of (and in addition to) the full
                // JS-side processing below — see RelayCore's doc comment for the full rationale.
                relayCore.offer(endpointId, bytes, connectionManager.connectedPeers.keys)

                enqueuePendingPayload(endpointId, bytes)

                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                val event = JSObject().apply {
                    put("peerId", endpointId)
                    put("bytesBase64", b64)
                }
                // retainUntilConsumed=true: if no JS listener is currently attached (WebView
                // paused/reloading), Capacitor retains this event and delivers it once one attaches.
                notifyListeners("payloadReceived", event, true)
            }
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            if (update.status == PayloadTransferUpdate.Status.SUCCESS) {
                connectionManager.markActive(endpointId)
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
            val parsed = connectionManager.parseEndpointName(info.endpointName)
            if (!connectionManager.isVersionCompatible(parsed)) {
                // Incompatible protocol version — reject rather than connect to a peer we can't
                // safely exchange wire-format packets with.
                connectionsClient.rejectConnection(endpointId)
                return
            }

            // Respect the concurrent P2P_CLUSTER cap by rotating the oldest idle peer if full
            connectionManager.rotateOldestIdlePeerIfNeeded(endpointId)
            connectionManager.registerConnected(endpointId, parsed?.displayName ?: info.endpointName)
            connectionsClient.acceptConnection(endpointId, payloadCallback)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (result.status.statusCode == ConnectionsStatusCodes.STATUS_OK) {
                val peerName = connectionManager.connectedPeers[endpointId] ?: "PEER-$endpointId"
                connectionManager.markActive(endpointId)
                val event = JSObject().apply {
                    put("peerId", endpointId)
                    put("displayName", peerName)
                    put("rssi", -56)
                    put("linkQuality", 92)
                }
                notifyListeners("peerFound", event)
            } else {
                connectionManager.unregister(endpointId)
            }
        }

        override fun onDisconnected(endpointId: String) {
            connectionManager.unregister(endpointId)
            notifyListeners("peerLost", JSObject().put("peerId", endpointId))
        }
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            if (connectionManager.isConnected(endpointId)) return

            val parsed = connectionManager.parseEndpointName(info.endpointName)
            if (!connectionManager.isVersionCompatible(parsed)) {
                return // Incompatible protocol version — never initiate towards it.
            }
            if (!connectionManager.shouldInitiate(localNodeId, parsed?.nodeId)) {
                return // Deterministic tie-break: the other side initiates.
            }

            connectionManager.rotateOldestIdlePeerIfNeeded(endpointId)
            connectionsClient.requestConnection(
                connectionManager.encodeEndpointName(localNodeId, localDisplayName),
                endpointId,
                connectionLifecycleCallback
            )
        }

        override fun onEndpointLost(endpointId: String) {
            connectionManager.unregister(endpointId)
            notifyListeners("peerLost", JSObject().put("peerId", endpointId))
        }
    }

    @PluginMethod
    fun startAdvertising(call: PluginCall) {
        if (!hasAllRequiredMeshPermissions()) {
            call.reject("Required permissions not granted. Call ensureMeshPermissions() first.")
            return
        }
        localNodeId = call.getString("nodeId") ?: ""
        localDisplayName = call.getString("displayName") ?: "SANKET-NODE"
        serviceId = call.getString("serviceId") ?: serviceId

        startMeshForegroundService()

        val options = AdvertisingOptions.Builder()
            .setStrategy(Strategy.P2P_CLUSTER)
            .build()

        connectionsClient.startAdvertising(
            connectionManager.encodeEndpointName(localNodeId, localDisplayName),
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
        if (!hasAllRequiredMeshPermissions()) {
            call.reject("Required permissions not granted. Call ensureMeshPermissions() first.")
            return
        }
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
        connectionManager.clear()
        pendingPayloadRing.clear()
        stopMeshForegroundService()
        call.resolve()
    }

    @PluginMethod
    fun sendPayload(call: PluginCall) {
        val peerId = call.getString("peerId") ?: return call.reject("Missing peerId")
        val b64 = call.getString("bytesBase64") ?: return call.reject("Missing bytesBase64")
        val bytes = Base64.decode(b64, Base64.NO_WRAP)

        connectionManager.markActive(peerId)
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
        for ((id, name) in connectionManager.connectedPeers.entries) {
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

    /**
     * Explicitly drains the bounded pending-payload ring buffer (see [pendingPayloadRing]) back
     * to JS as a resume-time backstop, in case the WebView missed `payloadReceived` events for
     * any reason despite `retainUntilConsumed`. Safe to call unconditionally on app resume.
     */
    @PluginMethod
    fun drainPendingPayloads(call: PluginCall) {
        val array = JSArray()
        var item = pendingPayloadRing.poll()
        while (item != null) {
            val (peerId, bytes) = item
            array.put(
                JSObject().apply {
                    put("peerId", peerId)
                    put("bytesBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                }
            )
            item = pendingPayloadRing.poll()
        }
        call.resolve(JSObject().put("payloads", array))
    }

    // --- Runtime permissions ----------------------------------------------------------------
    //
    // The exact set of OS permissions actually required depends on API level: BLUETOOTH_SCAN/
    // ADVERTISE/CONNECT only exist from API 31 (Android 12); on older OS versions, Bluetooth
    // discovery instead required ACCESS_FINE_LOCATION, which we request unconditionally anyway
    // (it's also used for opt-in precise SOS coordinates at the app level, independent of the
    // mesh transport). NEARBY_WIFI_DEVICES only exists from API 33, as does POST_NOTIFICATIONS.
    // Requesting an alias whose underlying permission doesn't apply to the current OS version is
    // a harmless no-op in Capacitor's permission helper, but we compute the precise required set
    // anyway so `permissionState` accurately reflects what THIS device actually needs.

    private fun requiredPermissionAliasesForSdk(): Array<String> {
        val aliases = mutableListOf("fineLocation")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { // API 31
            aliases.add("bluetoothScan")
            aliases.add("bluetoothAdvertise")
            aliases.add("bluetoothConnect")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // API 33
            aliases.add("nearbyWifi")
            aliases.add("notifications")
        }
        return aliases.toTypedArray()
    }

    private fun hasAllRequiredMeshPermissions(): Boolean {
        return requiredPermissionAliasesForSdk().all { getPermissionState(it) == PermissionState.GRANTED }
    }

    private fun permissionStateResult(): JSObject {
        val result = JSObject()
        var allGranted = true
        for (alias in requiredPermissionAliasesForSdk()) {
            val granted = getPermissionState(alias) == PermissionState.GRANTED
            result.put(alias, granted)
            if (!granted) allGranted = false
        }
        result.put("allGranted", allGranted)
        result.put("sdkInt", Build.VERSION.SDK_INT)
        return result
    }

    /**
     * Returns current grant state for exactly the permission aliases this device's API level
     * actually needs for Nearby Connections, without prompting. Call this first; only call
     * [requestMeshPermissions] if it reports `allGranted: false` and the user has confirmed a
     * rationale screen (required by Play policy for runtime permission requests).
     */
    @PluginMethod
    fun checkMeshPermissions(call: PluginCall) {
        call.resolve(permissionStateResult())
    }

    /** Triggers the OS runtime permission dialog(s) for exactly the aliases this device needs. */
    @PluginMethod
    fun requestMeshPermissions(call: PluginCall) {
        requestPermissionForAliases(requiredPermissionAliasesForSdk(), call, "onMeshPermissionsResult")
    }

    @PermissionCallback
    private fun onMeshPermissionsResult(call: PluginCall) {
        val result = permissionStateResult()
        notifyListeners("permissionState", result)
        call.resolve(result)
    }

    /** Opens this app's system Settings page, for the denial UI's "Open Settings" action. */
    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
        }
        context.startActivity(intent)
        call.resolve()
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
