package com.bitchat.android.ui.sos

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Vibration for the hold-to-send gesture: a pulse every half second that grows stronger, so the
 * user can feel the countdown without looking, then one long buzz when the SOS is committed.
 * Everything is best-effort — a device without a vibrator simply stays silent.
 */
object SosHaptics {
    // off/on pairs: pulse every 500 ms for 3 s, each stronger than the last
    private val timings = longArrayOf(0, 25, 475, 25, 475, 30, 470, 35, 465, 40, 460, 45)
    private val amplitudes = intArrayOf(0, 60, 0, 90, 0, 130, 0, 180, 0, 220, 0, 255)

    private fun vibrator(context: Context): Vibrator? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    } catch (_: Exception) {
        null
    }

    fun startHold(context: Context) {
        try {
            val v = vibrator(context)?.takeIf { it.hasVibrator() } ?: return
            val effect = if (v.hasAmplitudeControl()) {
                VibrationEffect.createWaveform(timings, amplitudes, -1)
            } else {
                VibrationEffect.createWaveform(timings, -1)
            }
            v.vibrate(effect)
        } catch (_: Exception) {
        }
    }

    /** Stops the countdown pulses (released early). */
    fun cancel(context: Context) {
        try { vibrator(context)?.cancel() } catch (_: Exception) { }
    }

    /** The commit buzz when the full hold completes. */
    fun committed(context: Context) {
        try {
            val v = vibrator(context)?.takeIf { it.hasVibrator() } ?: return
            v.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (_: Exception) {
        }
    }

    /** Strong attention pattern for an incoming SOS: three buzzes, the last one long. */
    fun incomingAlert(context: Context) {
        try {
            val v = vibrator(context)?.takeIf { it.hasVibrator() } ?: return
            v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 150, 400, 150, 900), -1))
        } catch (_: Exception) {
        }
    }
}
