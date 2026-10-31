package com.bitchat.android.sos

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/** One-shot device location for an outgoing SOS. Returns null rather than guessing. */
internal object SosLocationSource {
    private const val FRESH_FIX_TIMEOUT_MS = 4_000L
    private const val MAX_STALE_FIX_AGE_MS = 10 * 60 * 1000L

    @SuppressLint("MissingPermission")
    suspend fun lastKnown(context: Context): Pair<Double, Double>? {
        val granted = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            .any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
        if (!granted) return null

        val client = LocationServices.getFusedLocationProviderClient(context)

        val fresh = withTimeoutOrNull(FRESH_FIX_TIMEOUT_MS) {
            suspendCancellableCoroutine<Pair<Double, Double>?> { cont ->
                val cancel = CancellationTokenSource()
                cont.invokeOnCancellation { cancel.cancel() }
                try {
                    client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancel.token)
                        .addOnSuccessListener { loc -> cont.resume(loc?.let { it.latitude to it.longitude }) }
                        .addOnFailureListener { cont.resume(null) }
                } catch (_: Exception) {
                    cont.resume(null)
                }
            }
        }
        if (fresh != null) return fresh

        // No fresh fix (indoors, rubble): fall back to a recent cached one, never an old one.
        return suspendCancellableCoroutine { cont ->
            try {
                client.lastLocation
                    .addOnSuccessListener { loc ->
                        val recent = loc != null && System.currentTimeMillis() - loc.time <= MAX_STALE_FIX_AGE_MS
                        cont.resume(if (recent) loc.latitude to loc.longitude else null)
                    }
                    .addOnFailureListener { cont.resume(null) }
            } catch (_: Exception) {
                cont.resume(null)
            }
        }
    }
}
