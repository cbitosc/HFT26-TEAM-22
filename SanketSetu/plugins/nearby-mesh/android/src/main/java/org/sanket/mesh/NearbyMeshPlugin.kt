package org.sanket.mesh

import android.Manifest
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
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
import com.google.android.gms.common.api.ApiException
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
import java.util.concurrent.ConcurrentLinkedQueue
import javax.crypto.KeyGenerator
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

/**
 * Capacitor plugin wrapping Google Nearby Connections (Strategy.P2P_CLUSTER). Connection admission
 * (cap, rotation, version tag, tie-break) lives in [ConnectionManager]; header-only flood relay in
 * [RelayCore]; all callbacks are logged through [MeshDiag] (logcat tag "SanketMesh").
 *
 * Wire identity: a Nearby endpointId is a random per-session string, NOT a node id. Every event
 * that names a peer therefore also carries `nodeId` (taken from the version-tagged endpoint name),
 * so the TypeScript engine can map transport peers to signed identities.
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

        // Discovery duty-cycle windows, matching src/mesh/power.ts's computePowerSchedule.
        const val BALANCED_SCAN_MS = 10_000L
        const val BALANCED_BASE_SLEEP_MS = 20_000L
        const val SAVER_SCAN_MS = 5_000L
        const val SAVER_BASE_SLEEP_MS = 45_000L
        const val MAX_SLEEP_MS = 60_000L

        // Nearby status codes (numeric so a rename in the SDK cannot break the build).
        const val STATUS_ALREADY_ADVERTISING = 8001
        const val STATUS_ALREADY_DISCOVERING = 8002
        const val STATUS_ALREADY_CONNECTED = 8003
        const val STATUS_CONNECTION_REJECTED = 8004

        // Reconnect pacing for endpoints we can see but are not connected to.
        const val CONNECT_RETRY_BASE_MS = 2_000L
        const val CONNECT_RETRY_MAX_MS = 30_000L
        /** The higher node id normally waits to be called; after this long it dials out too. */
        const val NON_INITIATOR_GRACE_MS = 10_000L
    }

    private lateinit var connectionsClient: ConnectionsClient
    private lateinit var connectionManager: ConnectionManager
    private lateinit var relayCore: RelayCore
    private val mainHandler = Handler(Looper.getMainLooper())

    // --- Power-mode duty cycling (see setPowerMode) ----------------------------------------
    private val powerHandler = Handler(Looper.getMainLooper())
    private var powerMode: String = "active"
    private var discoveryActive = false
    private var consecutiveEmptyScans = 0
    private var dutyCycleRunnable: Runnable? = null

    /** Bounded ring of payloads not yet drained by JS; see drainPendingPayloads. */
    private val pendingPayloadRing = ConcurrentLinkedQueue<Triple<String, String?, ByteArray>>()

    private var localNodeId: String = ""
    private var localDisplayName: String = "Sanket phone"
    private var serviceId: String = "org.sanket.mesh.p2p.cluster"

    /** Endpoints currently visible to discovery (not necessarily connected). */
    private val discovered = ConcurrentHashMap<String, DiscoveredEndpointInfo>()
    private val dialing = ConcurrentHashMap.newKeySet<String>()
    private val connectAttempts = ConcurrentHashMap<String, Int>()

    override fun load() {
        super.load()
        connectionsClient = Nearby.getConnectionsClient(context)
        connectionManager = ConnectionManager(connectionsClient).also { it.listener = this }
        relayCore = RelayCore(connectionsClient)
        MeshDiag.log("plugin loaded, sdk=${Build.VERSION.SDK_INT}")
    }

    // --- ConnectionManager.Listener -------------------------------------------------------

    override fun onPeerLost(peerId: String) {
        notifyListeners("peerLost", JSObject().put("peerId", peerId))
    }

    override fun onFanOutLimit(evictedPeerId: String, incomingPeerId: String, maxConcurrent: Int, reason: String) {
        MeshDiag.log("link cap reached: evicted $evictedPeerId for $incomingPeerId (max $maxConcurrent)")
        val event = JSObject().apply {
            put("evictedPeerId", evictedPeerId)
            put("incomingPeerId", incomingPeerId)
            put("maxConcurrent", maxConcurrent)
            put("reason", reason)
        }
        notifyListeners("fanOutLimit", event)
    }

    // --- Nearby callbacks ------------------------------------------------------------------

    private fun enqueuePendingPayload(peerId: String, nodeId: String?, bytes: ByteArray) {
        pendingPayloadRing.add(Triple(peerId, nodeId, bytes))
        while (pendingPayloadRing.size > PENDING_PAYLOAD_RING_CAPACITY) {
            pendingPayloadRing.poll()
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type != Payload.Type.BYTES) {
                MeshDiag.warn("ignored non-bytes payload from $endpointId (type ${payload.type})")
                return
            }
            val bytes = payload.asBytes() ?: return
            val nodeId = connectionManager.nodeIdFor(endpointId)
            connectionManager.markActive(endpointId)
            MeshDiag.receivedCount += 1
            MeshDiag.lastReceived = MeshDiag.Transfer(System.currentTimeMillis(), bytes.size, nodeId ?: endpointId)
            MeshDiag.log("payload received ${bytes.size} B from ${nodeId ?: endpointId}")

            // Header-only native relay: keeps packets moving even if the WebView is throttled.
            relayCore.offer(endpointId, bytes, connectionManager.connectedPeers.keys)

            enqueuePendingPayload(endpointId, nodeId, bytes)

            val event = JSObject().apply {
                put("peerId", endpointId)
                if (nodeId != null) put("nodeId", nodeId)
                put("bytesBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            }
            // retainUntilConsumed=true: if no JS listener is attached yet (WebView paused or still
            // loading), Capacitor keeps the event and delivers it when one attaches.
            notifyListeners("payloadReceived", event, true)
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            if (update.status == PayloadTransferUpdate.Status.FAILURE) {
                MeshDiag.warn("payload transfer FAILED to/from $endpointId")
            }
        }
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            val parsed = connectionManager.parseEndpointName(info.endpointName)
            MeshDiag.log(
                "connection initiated with $endpointId name='${info.endpointName}' " +
                    "incoming=${info.isIncomingConnection}"
            )
            if (!connectionManager.isVersionCompatible(parsed)) {
                MeshDiag.warn("rejecting $endpointId: incompatible protocol version '${parsed?.version}'")
                connectionsClient.rejectConnection(endpointId)
                return
            }
            connectionManager.rotateOldestIdlePeerIfNeeded(endpointId)
            connectionManager.registerConnected(endpointId, parsed?.displayName ?: info.endpointName, parsed?.nodeId)
            connectionsClient.acceptConnection(endpointId, payloadCallback)
                .addOnFailureListener { MeshDiag.warn("acceptConnection($endpointId) failed: ${describe(it)}") }
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            val code = result.status.statusCode
            dialing.remove(endpointId)
            if (code == ConnectionsStatusCodes.STATUS_OK) {
                val name = connectionManager.connectedPeers[endpointId] ?: "Phone"
                val nodeId = connectionManager.nodeIdFor(endpointId)
                connectionManager.markActive(endpointId)
                connectAttempts.remove(endpointId)
                MeshDiag.log("CONNECTED to $endpointId name='$name' nodeId=$nodeId")
                val event = JSObject().apply {
                    put("peerId", endpointId)
                    if (nodeId != null) put("nodeId", nodeId)
                    put("displayName", name)
                }
                notifyListeners("peerFound", event)
            } else {
                MeshDiag.warn(
                    "connection to $endpointId FAILED: code=$code " +
                        ConnectionsStatusCodes.getStatusCodeString(code)
                )
                connectionManager.unregister(endpointId)
                if (code != STATUS_CONNECTION_REJECTED) scheduleConnectRetry(endpointId)
            }
        }

        override fun onDisconnected(endpointId: String) {
            MeshDiag.log("DISCONNECTED from $endpointId")
            connectionManager.unregister(endpointId)
            notifyListeners("peerLost", JSObject().put("peerId", endpointId))
            // Reconnect handling: if we can still see it, dial again after a short pause.
            if (discovered.containsKey(endpointId)) scheduleConnectRetry(endpointId)
        }
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            val parsed = connectionManager.parseEndpointName(info.endpointName)
            MeshDiag.log("endpoint FOUND $endpointId name='${info.endpointName}'")
            discovered[endpointId] = info
            if (connectionManager.isConnected(endpointId)) return
            if (!connectionManager.isVersionCompatible(parsed)) {
                MeshDiag.warn("ignoring $endpointId: incompatible protocol version '${parsed?.version}'")
                return
            }
            if (connectionManager.shouldInitiate(localNodeId, parsed?.nodeId)) {
                tryConnect(endpointId, "we have the lower node id")
            } else {
                MeshDiag.log("waiting for $endpointId to call us (their node id is lower)")
                mainHandler.postDelayed({
                    if (discovered.containsKey(endpointId) && !connectionManager.isConnected(endpointId)) {
                        tryConnect(endpointId, "no call from the other phone after ${NON_INITIATOR_GRACE_MS / 1000}s")
                    }
                }, NON_INITIATOR_GRACE_MS)
            }
        }

        override fun onEndpointLost(endpointId: String) {
            // Discovery lost sight of it. An established connection is independent of discovery, so
            // do NOT tear it down here (doing so made live links invisible to the app).
            MeshDiag.log("endpoint LOST from discovery $endpointId (connection state unchanged)")
            discovered.remove(endpointId)
        }
    }

    // --- Connecting ------------------------------------------------------------------------

    private fun tryConnect(endpointId: String, reason: String) {
        if (connectionManager.isConnected(endpointId) || !dialing.add(endpointId)) return
        connectionManager.rotateOldestIdlePeerIfNeeded(endpointId)
        MeshDiag.log("requesting connection to $endpointId ($reason)")
        connectionsClient.requestConnection(
            connectionManager.encodeEndpointName(localNodeId, localDisplayName),
            endpointId,
            connectionLifecycleCallback
        ).addOnFailureListener { e ->
            dialing.remove(endpointId)
            val code = (e as? ApiException)?.statusCode
            if (code == STATUS_ALREADY_CONNECTED) {
                MeshDiag.log("requestConnection($endpointId): already connected")
            } else {
                MeshDiag.warn("requestConnection($endpointId) failed: ${describe(e)}")
                scheduleConnectRetry(endpointId)
            }
        }
    }

    private fun scheduleConnectRetry(endpointId: String) {
        val attempt = (connectAttempts[endpointId] ?: 0) + 1
        connectAttempts[endpointId] = attempt
        val delay = minOf(CONNECT_RETRY_MAX_MS, CONNECT_RETRY_BASE_MS shl minOf(attempt - 1, 4))
        MeshDiag.log("will retry connecting to $endpointId in ${delay}ms (attempt $attempt)")
        mainHandler.postDelayed({
            if (discovered.containsKey(endpointId) && !connectionManager.isConnected(endpointId)) {
                tryConnect(endpointId, "retry $attempt")
            }
        }, delay)
    }

    private fun describe(e: Exception): String {
        val code = (e as? ApiException)?.statusCode
        return if (code != null) "code=$code ${ConnectionsStatusCodes.getStatusCodeString(code)}" else "${e.javaClass.simpleName}: ${e.message}"
    }

    // --- Start / stop ----------------------------------------------------------------------

    /**
     * Starts the radio: foreground service, advertising AND discovery with the same service id and
     * P2P_CLUSTER. Safe to call repeatedly (already-running is treated as success). Resolves with
     * the real outcome of each half instead of throwing, so the app can show exactly what failed.
     */
    @PluginMethod
    fun start(call: PluginCall) {
        val missing = missingRequiredAliases()
        if (missing.isNotEmpty()) {
            MeshDiag.warn("start refused: missing permissions $missing")
            call.reject("Missing permissions: ${missing.joinToString()}", "MISSING_PERMISSION")
            return
        }
        localNodeId = call.getString("nodeId") ?: ""
        localDisplayName = call.getString("displayName") ?: localDisplayName
        serviceId = call.getString("serviceId") ?: serviceId
        powerMode = call.getString("mode") ?: powerMode
        relayCore.setPowerMode(powerMode)
        MeshDiag.log("start(): nodeId=$localNodeId name='$localDisplayName' mode=$powerMode service=$serviceId")

        startMeshForegroundService()
        startAdvertisingInternal { advError ->
            startDiscoveryInternal(
                onSuccess = {
                    if (powerMode != "active") scheduleDutyCycleScan()
                    call.resolve(startResult(advError))
                },
                onFailure = { call.resolve(startResult(advError)) }
            )
        }
    }

    private fun startResult(advError: MeshDiag.DiagError?): JSObject = JSObject().apply {
        put("advertising", MeshDiag.advertising)
        put("discovering", MeshDiag.discovering)
        MeshDiag.advertisingError?.let { put("advertisingError", errorJson(it)) }
        MeshDiag.discoveryError?.let { put("discoveryError", errorJson(it)) }
        put("foregroundService", MeshForegroundService.running)
        if (advError != null) put("advertisingFailed", true)
    }

    private fun errorJson(e: MeshDiag.DiagError) = JSObject().apply {
        put("code", e.code)
        put("message", e.message)
        put("at", e.atMs)
    }

    private fun startAdvertisingInternal(done: (MeshDiag.DiagError?) -> Unit) {
        val options = AdvertisingOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()
        connectionsClient.startAdvertising(
            connectionManager.encodeEndpointName(localNodeId, localDisplayName),
            serviceId,
            connectionLifecycleCallback,
            options
        ).addOnSuccessListener {
            MeshDiag.advertising = true
            MeshDiag.advertisingError = null
            MeshDiag.log("advertising STARTED")
            done(null)
        }.addOnFailureListener { e ->
            val code = (e as? ApiException)?.statusCode ?: -1
            if (code == STATUS_ALREADY_ADVERTISING) {
                MeshDiag.advertising = true
                MeshDiag.advertisingError = null
                MeshDiag.log("advertising already running")
                done(null)
            } else {
                val err = MeshDiag.DiagError(code, describe(e), System.currentTimeMillis())
                MeshDiag.advertising = false
                MeshDiag.advertisingError = err
                MeshDiag.warn("advertising FAILED: ${err.message}")
                done(err)
            }
        }
    }

    private fun startDiscoveryInternal(onSuccess: () -> Unit = {}, onFailure: (Exception) -> Unit = {}) {
        if (discoveryActive) {
            onSuccess()
            return
        }
        val options = DiscoveryOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()
        connectionsClient.startDiscovery(serviceId, endpointDiscoveryCallback, options)
            .addOnSuccessListener {
                discoveryActive = true
                MeshDiag.discovering = true
                MeshDiag.discoveryError = null
                MeshDiag.log("discovery STARTED")
                onSuccess()
            }.addOnFailureListener { e ->
                val code = (e as? ApiException)?.statusCode ?: -1
                if (code == STATUS_ALREADY_DISCOVERING) {
                    discoveryActive = true
                    MeshDiag.discovering = true
                    MeshDiag.discoveryError = null
                    MeshDiag.log("discovery already running")
                    onSuccess()
                } else {
                    MeshDiag.discovering = false
                    MeshDiag.discoveryError = MeshDiag.DiagError(code, describe(e), System.currentTimeMillis())
                    MeshDiag.warn("discovery FAILED: ${describe(e)}")
                    onFailure(e)
                }
            }
    }

    private fun stopDiscoveryInternal() {
        if (!discoveryActive) return
        connectionsClient.stopDiscovery()
        discoveryActive = false
        MeshDiag.discovering = false
        MeshDiag.log("discovery stopped (duty cycle)")
    }

    // Kept for compatibility with older JS; new code calls start().
    @PluginMethod
    fun startAdvertising(call: PluginCall) = start(call)

    @PluginMethod
    fun startDiscovery(call: PluginCall) = start(call)

    /**
     * Active = continuous discovery. Balanced/Saver = discovery duty-cycles on a timer (see the
     * BALANCED and SAVER window constants above), backing off up to MAX_SLEEP_MS after consecutive
     * empty scans and resetting as soon as a scan window ends with a connected peer. Advertising
     * stays on in every mode so other phones can always find us.
     */
    @PluginMethod
    fun setPowerMode(call: PluginCall) {
        val mode = call.getString("mode") ?: "active"
        powerMode = mode
        relayCore.setPowerMode(mode)
        consecutiveEmptyScans = 0
        dutyCycleRunnable?.let { powerHandler.removeCallbacks(it) }
        dutyCycleRunnable = null
        MeshDiag.log("power mode -> $mode")

        if (MeshDiag.advertising || discoveryActive) {
            if (mode == "active") startDiscoveryInternal() else scheduleDutyCycleScan()
        }
        call.resolve(JSObject().put("mode", powerMode))
    }

    private fun scheduleDutyCycleScan() {
        val scanMs = if (powerMode == "saver") SAVER_SCAN_MS else BALANCED_SCAN_MS
        startDiscoveryInternal()
        val endScanRunnable = Runnable {
            val foundPeerThisWindow = connectionManager.connectedPeers.isNotEmpty()
            consecutiveEmptyScans = if (foundPeerThisWindow) 0 else consecutiveEmptyScans + 1
            stopDiscoveryInternal()
            scheduleDutyCycleSleep()
        }
        dutyCycleRunnable = endScanRunnable
        powerHandler.postDelayed(endScanRunnable, scanMs)
    }

    private fun scheduleDutyCycleSleep() {
        val baseSleepMs = if (powerMode == "saver") SAVER_BASE_SLEEP_MS else BALANCED_BASE_SLEEP_MS
        val backoffShift = minOf(consecutiveEmptyScans, 2)
        val sleepMs = minOf(MAX_SLEEP_MS, baseSleepMs shl backoffShift)
        val resumeScanRunnable = Runnable { scheduleDutyCycleScan() }
        dutyCycleRunnable = resumeScanRunnable
        powerHandler.postDelayed(resumeScanRunnable, sleepMs)
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        dutyCycleRunnable?.let { powerHandler.removeCallbacks(it) }
        dutyCycleRunnable = null
        mainHandler.removeCallbacksAndMessages(null)
        connectionsClient.stopAdvertising()
        connectionsClient.stopDiscovery()
        connectionsClient.stopAllEndpoints()
        discoveryActive = false
        discovered.clear()
        dialing.clear()
        connectAttempts.clear()
        MeshDiag.reset()
        connectionManager.clear()
        pendingPayloadRing.clear()
        stopMeshForegroundService()
        MeshDiag.log("radio stopped")
        call.resolve()
    }

    // --- Sending ---------------------------------------------------------------------------

    /** Sends to one endpoint (`peerId`) or, when `peerId` is absent or "BROADCAST", to every connected one. */
    @PluginMethod
    fun sendPayload(call: PluginCall) {
        val peerId = call.getString("peerId")
        val b64 = call.getString("bytesBase64") ?: return call.reject("Missing bytesBase64")
        val bytes = try {
            Base64.decode(b64, Base64.NO_WRAP)
        } catch (e: IllegalArgumentException) {
            return call.reject("bytesBase64 is not valid base64")
        }

        val targets: Collection<String> =
            if (peerId.isNullOrEmpty() || peerId == "BROADCAST") connectionManager.connectedPeers.keys.toList()
            else listOf(peerId)
        if (targets.isEmpty()) {
            MeshDiag.warn("send ${bytes.size} B: no connected phones")
            call.resolve(JSObject().put("sent", false).put("reason", "no_peers"))
            return
        }
        for (t in targets) connectionManager.markActive(t)
        connectionsClient.sendPayload(targets.toList(), Payload.fromBytes(bytes))
            .addOnSuccessListener {
                MeshDiag.sentCount += 1
                val label = if (targets.size == 1) (connectionManager.nodeIdFor(targets.first()) ?: targets.first()) else "${targets.size} phones"
                MeshDiag.lastSent = MeshDiag.Transfer(System.currentTimeMillis(), bytes.size, label)
                MeshDiag.log("payload sent ${bytes.size} B to $label")
                call.resolve(JSObject().put("sent", true))
            }
            .addOnFailureListener { e ->
                MeshDiag.sendFailures += 1
                MeshDiag.warn("send ${bytes.size} B to $targets FAILED: ${describe(e)}")
                call.resolve(JSObject().put("sent", false).put("reason", describe(e)))
            }
    }

    @PluginMethod
    fun getPeers(call: PluginCall) {
        val array = JSArray()
        for ((id, name) in connectionManager.connectedPeers.entries) {
            array.put(
                JSObject().apply {
                    put("peerId", id)
                    connectionManager.nodeIdFor(id)?.let { put("nodeId", it) }
                    put("displayName", name)
                }
            )
        }
        call.resolve(JSObject().put("peers", array))
    }

    /** Resume-time backstop: returns payloads JS may have missed, oldest first. */
    @PluginMethod
    fun drainPendingPayloads(call: PluginCall) {
        val array = JSArray()
        var item = pendingPayloadRing.poll()
        while (item != null) {
            val (peerId, nodeId, bytes) = item
            array.put(
                JSObject().apply {
                    put("peerId", peerId)
                    if (nodeId != null) put("nodeId", nodeId)
                    put("bytesBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                }
            )
            item = pendingPayloadRing.poll()
        }
        call.resolve(JSObject().put("payloads", array))
    }

    // --- Diagnostics -----------------------------------------------------------------------

    @PluginMethod
    fun getDiagnostics(call: PluginCall) {
        val out = JSObject()
        out.put("permissions", permissionStateResult())
        out.put("sdkInt", Build.VERSION.SDK_INT)
        out.put("bluetoothEnabled", bluetoothEnabled())
        out.put("wifiEnabled", wifiEnabled())
        out.put("locationServicesEnabled", locationEnabled())
        out.put("foregroundService", MeshForegroundService.running)
        out.put("nodeId", localNodeId)
        out.put("serviceId", serviceId)
        out.put("powerMode", powerMode)
        out.put("advertising", JSObject().apply {
            put("active", MeshDiag.advertising)
            MeshDiag.advertisingError?.let { put("error", errorJson(it)) }
        })
        out.put("discovery", JSObject().apply {
            put("active", MeshDiag.discovering)
            MeshDiag.discoveryError?.let { put("error", errorJson(it)) }
        })
        val found = JSArray()
        for ((id, info) in discovered) {
            found.put(JSObject().apply {
                put("endpointId", id)
                put("name", info.endpointName)
                connectionManager.parseEndpointName(info.endpointName)?.let { put("nodeId", it.nodeId) }
            })
        }
        out.put("discovered", found)
        val conn = JSArray()
        for ((id, name) in connectionManager.connectedPeers) {
            conn.put(JSObject().apply {
                put("endpointId", id)
                put("name", name)
                connectionManager.nodeIdFor(id)?.let { put("nodeId", it) }
            })
        }
        out.put("connected", conn)
        out.put("sentCount", MeshDiag.sentCount)
        out.put("receivedCount", MeshDiag.receivedCount)
        out.put("sendFailures", MeshDiag.sendFailures)
        MeshDiag.lastSent?.let { out.put("lastSent", JSObject().put("at", it.atMs).put("bytes", it.bytes).put("peer", it.peer)) }
        MeshDiag.lastReceived?.let { out.put("lastReceived", JSObject().put("at", it.atMs).put("bytes", it.bytes).put("peer", it.peer)) }
        val log = JSArray()
        MeshDiag.snapshotLog().forEach { log.put(it) }
        out.put("log", log)
        call.resolve(out)
    }

    private fun bluetoothEnabled(): Boolean = try {
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter?.isEnabled == true
    } catch (e: SecurityException) {
        false
    }

    @Suppress("DEPRECATION")
    private fun wifiEnabled(): Boolean = try {
        (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager)?.isWifiEnabled == true
    } catch (e: Exception) {
        false
    }

    private fun locationEnabled(): Boolean = try {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) lm?.isLocationEnabled == true
        else lm?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true || lm?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true
    } catch (e: Exception) {
        false
    }

    // --- Runtime permissions ---------------------------------------------------------------
    //
    // What the RADIO needs depends on the Android version (Google's Nearby Connections guide):
    //   API <= 30 : location (Bluetooth permissions are install-time)
    //   API 31-32 : BLUETOOTH_SCAN / ADVERTISE / CONNECT, plus location
    //   API 33+   : BLUETOOTH_SCAN / ADVERTISE / CONNECT, NEARBY_WIFI_DEVICES
    // POST_NOTIFICATIONS (33+) is requested too but never blocks the radio. On 33+ location is
    // optional: it is only used if the user attaches a position to an SOS.

    private fun requiredAliases(): List<String> {
        val sdk = Build.VERSION.SDK_INT
        val aliases = mutableListOf<String>()
        if (sdk >= Build.VERSION_CODES.S) aliases += listOf("bluetoothScan", "bluetoothAdvertise", "bluetoothConnect")
        if (sdk >= Build.VERSION_CODES.TIRAMISU) aliases += "nearbyWifi"
        if (sdk <= Build.VERSION_CODES.S_V2) aliases += "fineLocation"
        return aliases
    }

    private fun optionalAliases(): List<String> {
        val aliases = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) aliases += listOf("notifications", "fineLocation")
        return aliases
    }

    private fun isGranted(alias: String) = getPermissionState(alias) == PermissionState.GRANTED

    private fun missingRequiredAliases(): List<String> = requiredAliases().filter { !isGranted(it) }

    private fun permissionStateResult(): JSObject {
        val result = JSObject()
        for (alias in requiredAliases() + optionalAliases()) result.put(alias, isGranted(alias))
        val missing = missingRequiredAliases()
        val missingArr = JSArray()
        missing.forEach { missingArr.put(it) }
        result.put("missing", missingArr)
        result.put("allGranted", missing.isEmpty())
        result.put("sdkInt", Build.VERSION.SDK_INT)
        return result
    }

    @PluginMethod
    fun checkMeshPermissions(call: PluginCall) {
        call.resolve(permissionStateResult())
    }

    @PluginMethod
    fun requestMeshPermissions(call: PluginCall) {
        val toAsk = (requiredAliases() + (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) listOf("notifications") else emptyList()))
            .filter { !isGranted(it) }
        if (toAsk.isEmpty()) {
            call.resolve(permissionStateResult())
            return
        }
        MeshDiag.log("requesting permissions: $toAsk")
        requestPermissionForAliases(toAsk.toTypedArray(), call, "onMeshPermissionsResult")
    }

    @PermissionCallback
    private fun onMeshPermissionsResult(call: PluginCall) {
        val result = permissionStateResult()
        MeshDiag.log("permission result: missing=${result.getJSONArray("missing")}")
        notifyListeners("permissionState", result)
        call.resolve(result)
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        call.resolve()
    }

    // --- Keystore (presence check only; nothing wraps the identity with it yet) ------------

    @PluginMethod
    fun ensureHardwareKeyBacked(call: PluginCall) {
        try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
                val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
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
            call.resolve(JSObject().put("hardwareBacked", true).put("alias", KEYSTORE_ALIAS))
        } catch (err: Exception) {
            call.resolve(JSObject().put("hardwareBacked", false).put("fallback", "PIN-XSalsa20-Poly1305"))
        }
    }

    private fun startMeshForegroundService() {
        try {
            val intent = Intent(context, MeshForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        } catch (e: Exception) {
            MeshDiag.warn("could not start foreground service: ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private fun stopMeshForegroundService() {
        context.stopService(Intent(context, MeshForegroundService::class.java))
    }
}
