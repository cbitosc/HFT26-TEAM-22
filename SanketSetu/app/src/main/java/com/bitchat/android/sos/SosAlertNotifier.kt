package com.bitchat.android.sos

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.bitchat.android.MainActivity
import com.bitchat.android.R
import com.bitchat.android.ai.sos.SosLanguage
import com.bitchat.android.ai.sos.SosPayload
import com.bitchat.android.ai.sos.SosText
import com.bitchat.android.ui.sos.SosHaptics

/**
 * Wakes the person nearby when someone sends an SOS: a heads-up notification on a high-importance channel
 * (sound + vibration, shown on the lock screen) and a direct strong vibration as a backup, so it works with the app
 * closed. Called from the mesh service, so no screen needs to be open.
 */
internal object SosAlertNotifier {
    const val CHANNEL_ID = "sos_incoming_v1"

    fun alert(context: Context, sos: SosPayload, senderName: String?, language: SosLanguage) {
        SosHaptics.incomingAlert(context)

        val nm = NotificationManagerCompat.from(context)
        if (!nm.areNotificationsEnabled()) return // vibration above still happened
        ensureChannel(context)

        val cat = sos.category
        val who = senderName?.takeIf { it.isNotBlank() }
        val body = buildString {
            if (who != null) append(who).append(": ")
            append(cat.detail(language))
            sos.latLon?.let { append("\n📍 ").append(it) }
        }
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("${cat.emoji} ${SosText.SOS_NEARBY.text(language)}: ${cat.title(language)}")
            .setContentText(body.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVibrate(longArrayOf(0, 400, 150, 400, 150, 900))
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        try {
            nm.notify(NOTIFICATION_BASE + (sos.id.hashCode() and 0xFFFF), n)
        } catch (_: SecurityException) {
            // notification permission revoked between the check and the post
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Incoming SOS", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Alerts when someone nearby sends an SOS"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 400, 150, 400, 150, 900)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
        )
    }

    private const val NOTIFICATION_BASE = 0x5050_0000
}
