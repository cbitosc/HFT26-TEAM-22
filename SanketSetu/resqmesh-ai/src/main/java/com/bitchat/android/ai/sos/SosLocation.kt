package com.bitchat.android.ai.sos

import java.util.Locale

/** How much location the victim chooses to reveal. Chosen before broadcasting, default is coarse. */
enum class LocationTier(val code: String) {
    /** Only that a node needs help — no coordinates leave the phone. */
    NONE("N"),

    /** Coordinates rounded to 2 decimals (about 1 km): a neighbourhood, not a doorstep. */
    COARSE("C"),

    /** 5 decimals (about 1 m) for search-and-rescue teams. */
    PRECISE("P");

    companion object {
        fun fromCode(code: String?): LocationTier = values().firstOrNull { it.code == code } ?: NONE
    }
}

object SosLocation {
    /**
     * The "lat,lon" text to put on the wire for [tier], or null when nothing should be shared
     * (tier NONE, or no fix available). Rounding happens here, before encoding, so a coarse SOS
     * never carries the precise fix on the wire.
     */
    fun format(tier: LocationTier, lat: Double?, lon: Double?): String? {
        if (lat == null || lon == null || lat.isNaN() || lon.isNaN()) return null
        if (lat !in -90.0..90.0 || lon !in -180.0..180.0) return null
        return when (tier) {
            LocationTier.NONE -> null
            LocationTier.COARSE -> String.format(Locale.US, "%.2f,%.2f", lat, lon)
            LocationTier.PRECISE -> String.format(Locale.US, "%.5f,%.5f", lat, lon)
        }
    }
}
