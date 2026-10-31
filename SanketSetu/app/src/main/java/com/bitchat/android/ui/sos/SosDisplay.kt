package com.bitchat.android.ui.sos

import com.bitchat.android.ai.sos.SosLanguage
import com.bitchat.android.ai.sos.SosProtocol

/**
 * How an SOS beacon reads outside the SOS UI (alert feed): the situation in the reader's language plus any shared
 * location, or null when [content] is not an SOS beacon. Never exposes the machine tag.
 */
fun sosDisplayText(content: String, lang: SosLanguage): String? {
    val p = SosProtocol.parseSos(content) ?: return null
    val cat = p.category
    val where = p.latLon?.let { "\n📍 $it" }.orEmpty()
    return "${cat.title(lang)} — ${cat.detail(lang)}$where"
}
