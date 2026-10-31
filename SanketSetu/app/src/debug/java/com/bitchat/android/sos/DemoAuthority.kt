package com.bitchat.android.sos

import com.bitchat.android.ai.sos.ResponderCertificate
import com.bitchat.android.ai.sos.ResponderCertificateCodec
import com.bitchat.android.ai.sos.ResponderRole
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer

/**
 * DEVELOPMENT-ONLY certificate authority, compiled into debug builds only (the release source set
 * has an inert stub). Its private seed is public in this repository, so anyone can mint a
 * "verified" certificate for a debug build — that is the point: it lets testers exercise the
 * verified-responder path on two phones without a real authority. UI labels these "DEMO AUTHORITY".
 */
object DemoAuthority {
    val enabled: Boolean = true

    // Deliberately not secret. Do not reuse anywhere.
    private val seed = ByteArray(32) { (it * 7 + 3).toByte() }
    private val privateKey get() = Ed25519PrivateKeyParameters(seed, 0)

    fun anchors(): Map<Int, ByteArray> =
        mapOf(TrustAnchors.DEMO_KEY_ID to privateKey.generatePublicKey().encoded)

    fun issue(role: ResponderRole, callsign: String, subjectKey: ByteArray, validDays: Int): String? = try {
        val expires = System.currentTimeMillis() / 1000 + validDays * 86_400L
        val body = ResponderCertificateCodec.signedBytes(role, TrustAnchors.DEMO_KEY_ID, expires, callsign, subjectKey)
        val signer = Ed25519Signer().apply { init(true, privateKey); update(body, 0, body.size) }
        val cert = ResponderCertificate(role, TrustAnchors.DEMO_KEY_ID, expires, callsign, subjectKey, signer.generateSignature())
        ResponderCertificateCodec.encode(cert)
    } catch (_: Exception) {
        null
    }
}
