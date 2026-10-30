package org.sanket.mesh

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * High-priority emergency notifications (plugins/nearby-mesh/.../AlertNotifier.kt).
 *
 * Posted from native code so an incoming SOS can wake the user even when the WebView is throttled
 * or the app is in the background (the foreground service keeps the radio and this process alive).
 * Two callers share one notification id per packet, so the second call UPDATES the first:
 * 1. [notifyHeaderOnly]: native, header-only fallback ("Emergency alert nearby"); it cannot read
 *    the encrypted payload, so it has no sender or category.
 * 2. [notify]: called from JavaScript with the decoded alert once the engine verified it.
 * It never makes a trust decision: a forged packet could at worst show the generic fallback text,
 * and the app itself shows nothing until the engine verified the signature.
 */
object AlertNotifier {
    private const val CHANNEL_ID = "sanket_emergency_alerts"
    private const val MAX_REMEMBERED = 256
    private val posted = LinkedHashSet<String>()

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, "Emergency alerts", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "SOS and hazard alerts from phones near you"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 600, 200, 600, 200, 900)
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                    ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(channel)
    }

    /** True once a notification for this packet id has been posted by this process. */
    @Synchronized
    fun alreadyPosted(packetId: String): Boolean = posted.contains(packetId)

    fun notifyHeaderOnly(context: Context, packetId: String) {
        synchronized(this) {
            if (!posted.add(packetId)) return
            while (posted.size > MAX_REMEMBERED) posted.remove(posted.first())
        }
        post(context, packetId, "Emergency alert nearby", "Someone near you sent an SOS. Open Sanket Setu.")
    }

    fun notify(context: Context, packetId: String, title: String, body: String) {
        synchronized(this) { posted.add(packetId) }
        post(context, packetId, title, body)
    }

    private fun post(context: Context, packetId: String, title: String, body: String) {
        try {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) !=
                android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                MeshDiag.warn("alert notification skipped: POST_NOTIFICATIONS not granted")
                return
            }
            ensureChannel(context)
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            val pending = launch?.let {
                PendingIntent.getActivity(
                    context, packetId.hashCode(), it,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            }
            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(context.applicationInfo.icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
            if (pending != null) {
                builder.setContentIntent(pending)
                builder.setFullScreenIntent(pending, true)
            }
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(packetId.hashCode(), builder.build())
            MeshDiag.log("alert notification posted for $packetId")
        } catch (e: Exception) {
            MeshDiag.warn("alert notification failed: ${e.message}")
        }
    }
}
