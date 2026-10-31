package com.bitchat.android.ai.media

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.BitSet

/**
 * One blob being fetched. Chunks are written straight to a sparse `.part` file at their final offset and
 * tracked in a bitmap, so a dropped link never restarts the file: [missing] says exactly what is left, and
 * the bitmap is persisted so even an app restart resumes. A blob is only accepted when its full SHA-256
 * equals the content address in the offer.
 */
class IncomingTransfer(
    val offer: MediaOffer,
    val key: ByteArray?,
    private val part: File,
    private val map: File,
    firstSource: String,
    now: Long
) {
    private val have = BitSet(offer.chunkCount)
    private var raf: RandomAccessFile? = null
    private val sources = mutableListOf(firstSource)
    private var sourceIndex = 0

    val startedMs: Long = now
    @Volatile var lastActivityMs: Long = now
    @Volatile var lastProgressMs: Long = now
    var stalledResumes: Int = 0

    init {
        restore()
    }

    val currentSource: String get() = sources[sourceIndex % sources.size]

    @Synchronized
    fun addSource(peer: String) {
        if (peer !in sources) sources += peer
    }

    @Synchronized
    fun hasSource(peer: String): Boolean = peer in sources

    @Synchronized
    fun useSource(peer: String): Boolean {
        val i = sources.indexOf(peer)
        if (i < 0) return false
        sourceIndex = i
        return true
    }

    @Synchronized
    fun rotateSource() {
        if (sources.size > 1) sourceIndex = (sourceIndex + 1) % sources.size
    }

    @Synchronized
    fun receivedCount(): Int = have.cardinality()

    @Synchronized
    fun isComplete(): Boolean = have.cardinality() == offer.chunkCount

    @Synchronized
    fun missing(): List<Int> {
        val out = ArrayList<Int>(offer.chunkCount - have.cardinality())
        var i = have.nextClearBit(0)
        while (i in 0 until offer.chunkCount) {
            out += i
            i = have.nextClearBit(i + 1)
        }
        return out
    }

    /** Stores chunk [index]; false if it is out of range, the wrong size, a duplicate, or fails AEAD. */
    @Synchronized
    fun accept(index: Long, data: ByteArray, now: Long): Boolean {
        if (index < 0 || index >= offer.chunkCount) return false
        val i = index.toInt()
        if (have.get(i)) return false
        if (data.size != offer.wireSize(i)) return false
        if (key != null && MediaCipher.open(key, i, data) == null) return false
        val f = raf ?: RandomAccessFile(part, "rw").also {
            if (it.length() != offer.totalSize) it.setLength(offer.totalSize)
            raf = it
        }
        f.seek(i.toLong() * offer.chunkSize)
        f.write(data)
        have.set(i)
        lastActivityMs = now
        lastProgressMs = now
        stalledResumes = 0
        if (have.cardinality() % PERSIST_EVERY == 0) persist()
        return true
    }

    @Synchronized
    fun persist() {
        try {
            FileOutputStream(map).use { out ->
                out.write(MAGIC)
                out.write(offer.blobHash)
                val bytes = have.toByteArray()
                out.write(bytes)
            }
        } catch (_: Exception) {
        }
    }

    /** True if the assembled `.part` file hashes to the offered content address. */
    @Synchronized
    fun verifyHash(): Boolean {
        if (part.length() != offer.totalSize) return false
        return BlobStore.sha256OfFile(part).contentEquals(offer.blobHash)
    }

    /** Opens each sealed chunk of the verified ciphertext into [out]. Null key means nothing to do. */
    @Synchronized
    fun decryptTo(out: File): Boolean {
        val k = key ?: return false
        return try {
            FileInputStream(part).use { input ->
                FileOutputStream(out).use { sink ->
                    for (i in 0 until offer.chunkCount) {
                        val buf = ByteArray(offer.wireSize(i))
                        var off = 0
                        while (off < buf.size) {
                            val n = input.read(buf, off, buf.size - off)
                            if (n < 0) return false
                            off += n
                        }
                        sink.write(MediaCipher.open(k, i, buf) ?: return false)
                    }
                }
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    @Synchronized
    fun partFile(): File = part

    @Synchronized
    fun close() {
        try { raf?.close() } catch (_: Exception) { }
        raf = null
    }

    @Synchronized
    fun discard() {
        close()
        part.delete()
        map.delete()
    }

    private fun restore() {
        try {
            if (!part.isFile || !map.isFile || part.length() != offer.totalSize) return
            val bytes = map.readBytes()
            if (bytes.size < MAGIC.size + 32) return
            if (!bytes.copyOfRange(0, MAGIC.size).contentEquals(MAGIC)) return
            if (!bytes.copyOfRange(MAGIC.size, MAGIC.size + 32).contentEquals(offer.blobHash)) return
            val restored = BitSet.valueOf(bytes.copyOfRange(MAGIC.size + 32, bytes.size))
            var i = restored.nextSetBit(0)
            while (i in 0 until offer.chunkCount) {
                have.set(i)
                i = restored.nextSetBit(i + 1)
            }
        } catch (_: Exception) {
            have.clear()
        }
    }

    companion object {
        private val MAGIC = byteArrayOf('S'.code.toByte(), 'M'.code.toByte(), 'T'.code.toByte(), '1'.code.toByte())
        private const val PERSIST_EVERY = 16
    }
}
