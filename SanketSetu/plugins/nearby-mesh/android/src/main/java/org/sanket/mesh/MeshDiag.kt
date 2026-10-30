package org.sanket.mesh

import android.util.Log
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale

/**
 * Live radio diagnostics (plugins/nearby-mesh/.../MeshDiag.kt). Every Nearby callback is logged
 * with tag "SanketMesh" (adb logcat | grep SanketMesh) and mirrored into a bounded in-memory ring
 * that the app's "Radio diagnostics" screen can read and copy. Holds no packet contents.
 */
object MeshDiag {
    const val TAG = "SanketMesh"
    private const val RING_SIZE = 80

    data class DiagError(val code: Int, val message: String, val atMs: Long)
    data class Transfer(val atMs: Long, val bytes: Int, val peer: String)

    private val ring = ArrayDeque<String>()
    private val fmt = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    @Volatile var advertising = false
    @Volatile var discovering = false
    @Volatile var advertisingError: DiagError? = null
    @Volatile var discoveryError: DiagError? = null
    @Volatile var lastSent: Transfer? = null
    @Volatile var lastReceived: Transfer? = null
    @Volatile var sentCount = 0
    @Volatile var receivedCount = 0
    @Volatile var sendFailures = 0

    fun log(message: String) {
        Log.i(TAG, message)
        synchronized(ring) {
            ring.addLast("${fmt.format(Date())} $message")
            while (ring.size > RING_SIZE) ring.removeFirst()
        }
    }

    fun warn(message: String) {
        Log.w(TAG, message)
        synchronized(ring) {
            ring.addLast("${fmt.format(Date())} WARN $message")
            while (ring.size > RING_SIZE) ring.removeFirst()
        }
    }

    fun snapshotLog(): List<String> = synchronized(ring) { ring.toList() }

    fun reset() {
        advertising = false
        discovering = false
    }
}
