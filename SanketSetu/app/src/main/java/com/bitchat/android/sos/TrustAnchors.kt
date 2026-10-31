package com.bitchat.android.sos

/**
 * Authority keys that responder certificates are checked against.
 *
 * [provisioned] is intentionally EMPTY: this repository does not contain a real NDRF / Civil Defense
 * signing key, and inventing one would be a fake trust claim. Until an authority's public key is
 * added here, no responder is shown as verified in a release build. Debug builds additionally trust
 * [DemoAuthority] (see src/debug) so the feature can be exercised end to end; certificates from it
 * are labelled "DEMO AUTHORITY" in the UI.
 */
object TrustAnchors {
    /** Key id used by the development-only authority. Never present in release builds. */
    const val DEMO_KEY_ID = 254

    /** authorityKeyId -> 32-byte Ed25519 public key. Add real authority keys here. */
    private val provisioned: Map<Int, ByteArray> = emptyMap()

    fun all(): Map<Int, ByteArray> = provisioned + DemoAuthority.anchors()

    /** Label to show next to a verified badge when the issuer is not a production authority. */
    fun issuerNote(authorityKeyId: Int): String? =
        if (authorityKeyId == DEMO_KEY_ID) "DEMO AUTHORITY" else null
}
