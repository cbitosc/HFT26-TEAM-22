package com.bitchat.android.sos

import android.content.Context
import com.bitchat.android.ai.sos.LocationTier
import com.bitchat.android.ai.sos.SosLanguage

/**
 * Remembers language and location tier. Deliberately does NOT remember the last emergency type:
 * a stale "fire" silently sent during a flood would be worse than a generic call for help.
 */
internal class SosPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("sos_prefs", Context.MODE_PRIVATE)

    var language: SosLanguage
        get() = SosLanguage.fromCode(prefs.getString("language", null))
        set(v) { prefs.edit().putString("language", v.code).apply() }

    /** Defaults to coarse: useful to rescuers, but never a doorstep unless the user opts in. */
    var tier: LocationTier
        get() = prefs.getString("tier", null)?.let { LocationTier.fromCode(it) } ?: LocationTier.COARSE
        set(v) { prefs.edit().putString("tier", v.code).apply() }

    /** Responder certificate token (public information), or null for a civilian. */
    var responderCertificate: String?
        get() = prefs.getString("responder_cert", null)
        set(v) { prefs.edit().putString("responder_cert", v).apply() }
}
