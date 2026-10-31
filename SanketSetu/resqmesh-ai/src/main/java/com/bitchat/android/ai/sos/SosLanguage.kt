package com.bitchat.android.ai.sos

/**
 * Languages the SOS flow can be shown in. The choice is in-app (not tied to the system locale)
 * because a victim may be using a borrowed or foreign-language phone.
 */
enum class SosLanguage(val code: String, val nativeName: String) {
    EN("en", "English"),
    HI("hi", "हिन्दी"),
    TE("te", "తెలుగు"),
    TA("ta", "தமிழ்");

    companion object {
        fun fromCode(code: String?): SosLanguage = values().firstOrNull { it.code == code } ?: EN
    }
}
