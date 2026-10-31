package com.bitchat.android.ai.media

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.security.MessageDigest

/**
 * Content-addressed blob store: a blob lives at `<dir>/<sha256-hex>`. Hash = identity, so a peer that
 * already holds a blob never downloads it again. Everything streams through small buffers, so memory
 * stays flat whatever the file size; total disk use is capped by [maxBytes] with oldest-first eviction.
 */
class BlobStore(val dir: File, private val maxBytes: Long = DEFAULT_MAX_BYTES) {
    init {
        dir.mkdirs()
    }

    data class BlobRef(val hashHex: String, val hash: ByteArray, val size: Long, val file: File)

    fun has(hashHex: String): Boolean = file(hashHex).isFile

    fun file(hashHex: String): File = File(dir, checked(hashHex))

    fun partFile(hashHex: String): File = File(dir, checked(hashHex) + ".part")

    fun mapFile(hashHex: String): File = File(dir, checked(hashHex) + ".map")

    fun tempDecryptedFile(hashHex: String): File = File(dir, checked(hashHex) + ".dec")

    /** Copies [src] in (streaming) and addresses it by the SHA-256 of its bytes. */
    fun putFile(src: File): BlobRef {
        val tmp = File.createTempFile(".incoming", ".tmp", dir)
        try {
            val md = MessageDigest.getInstance("SHA-256")
            copyHashing(src, tmp, md)
            return finish(tmp, md.digest())
        } finally {
            tmp.delete()
        }
    }

    /**
     * Seals [src] chunk by chunk for a private transfer and stores the ciphertext, addressed by the hash of
     * the ciphertext. [wireChunk] is the on-the-wire chunk size including the AEAD tag.
     */
    fun putEncrypted(src: File, key: ByteArray, wireChunk: Int): BlobRef {
        val plainChunk = wireChunk - MediaLimits.AEAD_TAG_BYTES
        require(plainChunk > 0) { "chunk too small for AEAD" }
        val tmp = File.createTempFile(".incoming", ".tmp", dir)
        try {
            val md = MessageDigest.getInstance("SHA-256")
            FileInputStream(src).use { input ->
                FileOutputStream(tmp).use { out ->
                    val buf = ByteArray(plainChunk)
                    var index = 0
                    while (true) {
                        val n = readFully(input, buf)
                        if (n <= 0) break
                        val sealed = MediaCipher.seal(key, index, if (n == buf.size) buf else buf.copyOf(n))
                        md.update(sealed)
                        out.write(sealed)
                        index++
                        if (n < buf.size) break
                    }
                }
            }
            return finish(tmp, md.digest())
        } finally {
            tmp.delete()
        }
    }

    /** Moves a verified, fully assembled file into the store. */
    fun adopt(verified: File, hashHex: String): File {
        val target = file(hashHex)
        if (target.exists()) {
            verified.delete()
        } else if (!verified.renameTo(target)) {
            verified.copyTo(target, overwrite = true)
            verified.delete()
        }
        target.setLastModified(System.currentTimeMillis())
        return target
    }

    fun delete(hashHex: String) {
        file(hashHex).delete()
        partFile(hashHex).delete()
        mapFile(hashHex).delete()
        tempDecryptedFile(hashHex).delete()
    }

    /** Reads wire chunk [index] of a stored blob. */
    fun readChunk(hashHex: String, index: Int, chunkSize: Int, totalSize: Long): ByteArray? {
        val f = file(hashHex)
        if (!f.isFile) return null
        val offset = index.toLong() * chunkSize
        if (offset >= totalSize) return null
        val len = minOf(chunkSize.toLong(), totalSize - offset).toInt()
        return RandomAccessFile(f, "r").use { raf ->
            raf.seek(offset)
            ByteArray(len).also { raf.readFully(it) }
        }
    }

    /** Evicts oldest blobs (never anything in [protect]) until the store fits under its cap. */
    fun trim(protect: Set<String> = emptySet(), incomingBytes: Long = 0L) {
        val files = dir.listFiles()?.filter { it.isFile && !it.name.startsWith(".") } ?: return
        var total = files.sumOf { it.length() } + incomingBytes
        if (total <= maxBytes) return
        for (f in files.sortedBy { it.lastModified() }) {
            if (total <= maxBytes) break
            if (protect.any { f.name.startsWith(it) }) continue
            total -= f.length()
            f.delete()
        }
    }

    private fun finish(tmp: File, digest: ByteArray): BlobRef {
        val hex = digest.toHex()
        val target = file(hex)
        if (!target.exists()) {
            if (!tmp.renameTo(target)) tmp.copyTo(target, overwrite = true)
        }
        target.setLastModified(System.currentTimeMillis())
        return BlobRef(hex, digest, target.length(), target)
    }

    private fun copyHashing(src: File, dst: File, md: MessageDigest) {
        FileInputStream(src).use { input ->
            FileOutputStream(dst).use { out ->
                val buf = ByteArray(32 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    md.update(buf, 0, n)
                    out.write(buf, 0, n)
                }
            }
        }
    }

    private fun readFully(input: FileInputStream, buf: ByteArray): Int {
        var off = 0
        while (off < buf.size) {
            val n = input.read(buf, off, buf.size - off)
            if (n < 0) break
            off += n
        }
        return off
    }

    private fun checked(hashHex: String): String {
        require(hashHex.length == 64 && hashHex.all { it in '0'..'9' || it in 'a'..'f' }) { "invalid blob hash" }
        return hashHex
    }

    companion object {
        const val DEFAULT_MAX_BYTES = 96L * 1024 * 1024

        fun sha256OfFile(f: File): ByteArray {
            val md = MessageDigest.getInstance("SHA-256")
            FileInputStream(f).use { input ->
                val buf = ByteArray(32 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    md.update(buf, 0, n)
                }
            }
            return md.digest()
        }
    }
}
