package org.sanket.mesh

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Android Foreground Service ("Sanket mesh active") per §2:
 * Ensures store-and-forward relaying and SOS beacon reception continue when the screen is off.
 */
class MeshForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "sanket_mesh_relay_channel"
        private const val NOTIFICATION_ID = 4102

        /** True while the foreground service is up; read by the radio diagnostics screen. */
        @Volatile
        var running = false
            private set
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        MeshDiag.log("foreground service created")
    }

    override fun onDestroy() {
        running = false
        MeshDiag.log("foreground service destroyed")
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        val notification = builder
            .setContentTitle("Sanket mesh active")
            .setContentText("Keeping the phone-to-phone link open")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .build()

        try {
            startForeground(NOTIFICATION_ID, notification)
            running = true
            MeshDiag.log("foreground service running (startForeground ok)")
        } catch (e: Exception) {
            // e.g. a missing runtime permission for the connectedDevice type on Android 14+.
            running = false
            MeshDiag.warn("startForeground failed: ${e.javaClass.simpleName}: ${e.message}")
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Sanket Offline Mesh Relay",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps peer-to-peer emergency relay active in background"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }
}
