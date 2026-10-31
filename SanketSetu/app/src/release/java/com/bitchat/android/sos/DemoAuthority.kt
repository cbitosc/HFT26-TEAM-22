package com.bitchat.android.sos

import com.bitchat.android.ai.sos.ResponderRole

/** Release builds ship no demo authority: nothing is trusted unless added to [TrustAnchors]. */
object DemoAuthority {
    val enabled: Boolean = false
    fun anchors(): Map<Int, ByteArray> = emptyMap()
    @Suppress("UNUSED_PARAMETER")
    fun issue(role: ResponderRole, callsign: String, subjectKey: ByteArray, validDays: Int): String? = null
}
