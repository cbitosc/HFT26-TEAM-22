package com.bitchat.android.ai.sos

import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.Base64

enum class ResponderRole(val code: Int, val label: String) {
    NDRF(1, "NDRF"),
    CIVIL_DEFENSE(2, "Civil Defense"),
    MEDICAL(3, "Medical Medic");

    companion object {
        fun fromCode(code: Int): ResponderRole? = values().firstOrNull { it.code == code }
    }
}

/**
 * An authority-signed statement "the holder of signing key K is a [role] with this [callsign]
 * until [expiresAtEpochSec]". It is what separates a verified rescuer from a civilian relay.
 *
 * Why this resists forged "rescue is coming" messages: every mesh packet is already signed with the
 * sender's own Ed25519 key, so a civilian cannot impersonate another phone. The certificate then
 * binds a role to *that same key* with a signature only a trusted authority can produce — see
 * [ResponderVerifier], which also requires [subjectKey] to equal the key that signed the packet.
 * A certificate copied from a real responder is useless to anyone who does not hold that key.
 */
class ResponderCertificate(
    val role: ResponderRole,
    val authorityKeyId: Int,
    val expiresAtEpochSec: Long,
    val callsign: String,
    val subjectKey: ByteArray,
    val signature: ByteArray
) {
    fun signedBytes(): ByteArray =
        ResponderCertificateCodec.signedBytes(role, authorityKeyId, expiresAtEpochSec, callsign, subjectKey)
}

object ResponderCertificateCodec {
    private val MAGIC = "RQC1".toByteArray(Charsets.US_ASCII)
    const val KEY_BYTES = 32
    const val SIGNATURE_BYTES = 64

    /** UTF-8 byte cap for the callsign field; the human-facing limit is [SosProtocol.MAX_CALLSIGN_CHARS] characters. */
    const val MAX_CALLSIGN_BYTES = 64

    fun signedBytes(
        role: ResponderRole,
        authorityKeyId: Int,
        expiresAtEpochSec: Long,
        callsign: String,
        subjectKey: ByteArray
    ): ByteArray {
        require(subjectKey.size == KEY_BYTES) { "subject key must be $KEY_BYTES bytes" }
        require(authorityKeyId in 0..255) { "authority key id must fit one byte" }
        val cs = callsign.toByteArray(Charsets.UTF_8)
        require(callsign.length in 1..SosProtocol.MAX_CALLSIGN_CHARS && cs.size <= MAX_CALLSIGN_BYTES) {
            "callsign must be 1..${SosProtocol.MAX_CALLSIGN_CHARS} characters"
        }
        return ByteBuffer.allocate(MAGIC.size + 1 + 1 + 8 + 1 + cs.size + KEY_BYTES)
            .put(MAGIC)
            .put(role.code.toByte())
            .put(authorityKeyId.toByte())
            .putLong(expiresAtEpochSec)
            .put(cs.size.toByte())
            .put(cs)
            .put(subjectKey)
            .array()
    }

    fun encode(cert: ResponderCertificate): String {
        val all = cert.signedBytes() + cert.signature
        return Base64.getUrlEncoder().withoutPadding().encodeToString(all)
    }

    /** Returns null for anything that is not a well-formed certificate; never throws. */
    fun decode(token: String): ResponderCertificate? = try {
        val raw = Base64.getUrlDecoder().decode(token.trim())
        val buf = ByteBuffer.wrap(raw)
        val magic = ByteArray(MAGIC.size).also { buf.get(it) }
        if (!magic.contentEquals(MAGIC)) {
            null
        } else {
            val role = ResponderRole.fromCode(buf.get().toInt() and 0xFF)
            val kid = buf.get().toInt() and 0xFF
            val exp = buf.long
            val csLen = buf.get().toInt() and 0xFF
            if (role == null || csLen !in 1..MAX_CALLSIGN_BYTES ||
                buf.remaining() != csLen + KEY_BYTES + SIGNATURE_BYTES
            ) {
                null
            } else {
                val cs = String(ByteArray(csLen).also { buf.get(it) }, Charsets.UTF_8)
                val subject = ByteArray(KEY_BYTES).also { buf.get(it) }
                val sig = ByteArray(SIGNATURE_BYTES).also { buf.get(it) }
                if (cs.length !in 1..SosProtocol.MAX_CALLSIGN_CHARS) null
                else ResponderCertificate(role, kid, exp, cs, subject, sig)
            }
        }
    } catch (_: Exception) {
        null
    }
}

/** Ed25519 verification, injected so this module stays free of crypto dependencies. */
fun interface Ed25519Verifier {
    fun verify(signature: ByteArray, data: ByteArray, publicKey: ByteArray): Boolean
}

enum class UnverifiedReason { NO_CERTIFICATE, MALFORMED, UNKNOWN_AUTHORITY, BAD_SIGNATURE, EXPIRED, KEY_MISMATCH }

sealed class ResponderVerdict {
    class Verified(val certificate: ResponderCertificate) : ResponderVerdict()
    class Unverified(val reason: UnverifiedReason) : ResponderVerdict()

    val isVerified: Boolean get() = this is Verified
}

object ResponderVerifier {
    /**
     * @param token the certificate string from the reply, or null for a civilian
     * @param packetSignerKey Ed25519 key that signed the *packet* carrying the reply, as learned
     *   from the sender's authenticated announce; null when unknown
     * @param anchors trusted authority keys by key id. Empty means nobody can be verified.
     */
    fun verify(
        token: String?,
        packetSignerKey: ByteArray?,
        nowEpochSec: Long,
        anchors: Map<Int, ByteArray>,
        verifier: Ed25519Verifier
    ): ResponderVerdict {
        if (token.isNullOrBlank()) return ResponderVerdict.Unverified(UnverifiedReason.NO_CERTIFICATE)
        val cert = ResponderCertificateCodec.decode(token)
            ?: return ResponderVerdict.Unverified(UnverifiedReason.MALFORMED)
        val authorityKey = anchors[cert.authorityKeyId]
            ?: return ResponderVerdict.Unverified(UnverifiedReason.UNKNOWN_AUTHORITY)
        val signatureOk = try {
            verifier.verify(cert.signature, cert.signedBytes(), authorityKey)
        } catch (_: Exception) {
            false
        }
        if (!signatureOk) return ResponderVerdict.Unverified(UnverifiedReason.BAD_SIGNATURE)
        if (nowEpochSec > cert.expiresAtEpochSec) return ResponderVerdict.Unverified(UnverifiedReason.EXPIRED)
        if (packetSignerKey == null || !MessageDigest.isEqual(packetSignerKey, cert.subjectKey)) {
            return ResponderVerdict.Unverified(UnverifiedReason.KEY_MISMATCH)
        }
        return ResponderVerdict.Verified(cert)
    }
}
