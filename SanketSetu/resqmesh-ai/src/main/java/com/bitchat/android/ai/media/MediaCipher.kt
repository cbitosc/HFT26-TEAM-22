package com.bitchat.android.ai.media

import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Per-chunk AES-256-GCM for private media. The key is random per transfer and travels only inside the
 * Noise-encrypted offer, so relays carry opaque chunks. Nonce = chunk index, which is safe because a
 * key is never reused across blobs and each index is sealed exactly once.
 */
object MediaCipher {
    private const val KEY_BYTES = 32

    fun isValidKey(key: ByteArray?): Boolean = key != null && key.size == KEY_BYTES

    fun seal(key: ByteArray, index: Int, plain: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce(index)))
        c.updateAAD(aad(index))
        return c.doFinal(plain)
    }

    /** Returns the plaintext, or null when the tag does not verify (forged, corrupt or wrong key). */
    fun open(key: ByteArray, index: Int, sealed: ByteArray): ByteArray? = try {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce(index)))
        c.updateAAD(aad(index))
        c.doFinal(sealed)
    } catch (_: Exception) {
        null
    }

    private fun nonce(index: Int): ByteArray = ByteBuffer.allocate(12).putInt(8, index).array()
    private fun aad(index: Int): ByteArray = ByteBuffer.allocate(4).putInt(index).array()
}
