package com.bitchat.android.ai.sos

import org.junit.Assert.*
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec

/** Real Ed25519 (JDK built-in) — no mocked crypto. */
class ResponderCertificateTest {

    private class Key(val priv: java.security.PrivateKey, val raw: ByteArray)

    private fun newKey(): Key {
        val kp = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()
        return Key(kp.private, kp.public.encoded.takeLast(32).toByteArray())
    }

    private val x509Prefix = byteArrayOf(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00)

    private val verifier = Ed25519Verifier { sig, data, pub ->
        val key = KeyFactory.getInstance("Ed25519").generatePublic(X509EncodedKeySpec(x509Prefix + pub))
        Signature.getInstance("Ed25519").run { initVerify(key); update(data); verify(sig) }
    }

    private fun issue(
        authority: Key, subject: ByteArray, kid: Int = 1, role: ResponderRole = ResponderRole.NDRF,
        cs: String = "NDRF-12", exp: Long = 2_000_000_000L
    ): String {
        val body = ResponderCertificateCodec.signedBytes(role, kid, exp, cs, subject)
        val sig = Signature.getInstance("Ed25519").run { initSign(authority.priv); update(body); sign() }
        return ResponderCertificateCodec.encode(ResponderCertificate(role, kid, exp, cs, subject, sig))
    }

    private val authority = newKey()
    private val responder = newKey()
    private val anchors = mapOf(1 to authority.raw)
    private val now = 1_900_000_000L

    private fun verify(token: String?, signer: ByteArray? = responder.raw, anchorMap: Map<Int, ByteArray> = anchors, at: Long = now) =
        ResponderVerifier.verify(token, signer, at, anchorMap, verifier)

    @Test
    fun `a valid certificate bound to the packet signer is verified`() {
        val v = verify(issue(authority, responder.raw))
        assertTrue(v is ResponderVerdict.Verified)
        val cert = (v as ResponderVerdict.Verified).certificate
        assertEquals(ResponderRole.NDRF, cert.role)
        assertEquals("NDRF-12", cert.callsign)
    }

    @Test
    fun `all three roles verify`() {
        for (r in ResponderRole.values()) assertTrue(verify(issue(authority, responder.raw, role = r)).isVerified)
    }

    @Test
    fun `a civilian without a certificate is unverified`() {
        assertReason(UnverifiedReason.NO_CERTIFICATE, verify(null))
        assertReason(UnverifiedReason.NO_CERTIFICATE, verify("  "))
    }

    @Test
    fun `garbage is malformed and never throws`() {
        assertReason(UnverifiedReason.MALFORMED, verify("not-a-cert"))
        assertReason(UnverifiedReason.MALFORMED, verify("AAAA"))
        assertReason(UnverifiedReason.MALFORMED, verify("%%%%"))
    }

    @Test
    fun `a certificate from an untrusted authority is rejected`() {
        val rogue = newKey()
        assertReason(UnverifiedReason.BAD_SIGNATURE, verify(issue(rogue, responder.raw, kid = 1)))
        assertReason(UnverifiedReason.UNKNOWN_AUTHORITY, verify(issue(rogue, responder.raw, kid = 9)))
    }

    @Test
    fun `with no trust anchors nobody is verified`() {
        assertReason(UnverifiedReason.UNKNOWN_AUTHORITY, verify(issue(authority, responder.raw), anchorMap = emptyMap()))
    }

    @Test
    fun `a tampered certificate fails the signature`() {
        val token = issue(authority, responder.raw)
        val raw = java.util.Base64.getUrlDecoder().decode(token)
        raw[16] = (raw[16].toInt() xor 0x01).toByte() // flip a bit inside the callsign
        val tampered = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(raw)
        assertReason(UnverifiedReason.BAD_SIGNATURE, verify(tampered))
    }

    @Test
    fun `an expired certificate is rejected`() {
        assertReason(UnverifiedReason.EXPIRED, verify(issue(authority, responder.raw, exp = now - 1)))
    }

    @Test
    fun `a certificate copied by another phone is useless to it`() {
        val token = issue(authority, responder.raw)
        val impostor = newKey()
        assertReason(UnverifiedReason.KEY_MISMATCH, verify(token, signer = impostor.raw))
        assertReason(UnverifiedReason.KEY_MISMATCH, verify(token, signer = null))
    }

    @Test
    fun `codec round trips`() {
        val token = issue(authority, responder.raw, cs = "తెలుగు")
        val cert = ResponderCertificateCodec.decode(token)!!
        assertEquals("తెలుగు", cert.callsign)
        assertEquals(token, ResponderCertificateCodec.encode(cert))
    }

    @Test
    fun `a sixteen character non latin callsign fits and an oversized one is refused`() {
        val long = "తెలుగుతెలుగుతెలుగుతె" // 20 characters
        assertTrue(verify(issue(authority, responder.raw, cs = "తెలుగుతెలుగుతెలుగుతె".take(16))).isVerified)
        try {
            issue(authority, responder.raw, cs = long)
            fail("expected the oversized callsign to be refused")
        } catch (_: IllegalArgumentException) {
        }
    }

    @Test
    fun `certificate token is small enough to ride inside one reply`() {
        assertTrue(issue(authority, responder.raw, cs = "A".repeat(16)).length < 220)
    }

    private fun assertReason(expected: UnverifiedReason, v: ResponderVerdict) {
        assertTrue("expected Unverified($expected) but was verified", v is ResponderVerdict.Unverified)
        assertEquals(expected, (v as ResponderVerdict.Unverified).reason)
    }
}
