package com.bitchat.android.ai.media

import java.nio.ByteBuffer
import java.security.MessageDigest

/** Limits shared by sender, receiver and the wire codecs. */
object MediaLimits {
    const val HASH_BYTES = 32
    const val MAX_THUMBNAIL_BYTES = 16 * 1024

    /** Wire chunk that fits one BLE write unfragmented: 29-byte header + 36-byte media header + data < 512. */
    const val BLE_CHUNK_SIZE = 384
    const val LAN_CHUNK_SIZE = 2048

    /** Largest blob the Bluetooth lane will carry on its own. Bigger blobs need the Wi-Fi lane. */
    const val BLE_MAX_BYTES = 1L shl 20
    /** Files above this are worth spinning up the Wi-Fi socket for. */
    const val LAN_THRESHOLD_BYTES = 64L * 1024
    const val LAN_MAX_BYTES = 50L * 1024 * 1024

    const val MAX_CHUNKS = 65_535
    const val RESUME_TIMEOUT_MS = 8_000L
    const val GIVE_UP_AFTER_MS = 10L * 60 * 1000

    /** AES-GCM tag appended to every chunk of an end-to-end encrypted (private) blob. */
    const val AEAD_TAG_BYTES = 16

    fun chunkSizeFor(totalSize: Long): Int = if (totalSize <= BLE_MAX_BYTES) BLE_CHUNK_SIZE else LAN_CHUNK_SIZE
}

/** What the blob is, in one byte. Unknown tags decode as [OCTET]. */
object MimeTag {
    const val OCTET = 0
    const val JPEG = 1
    const val PNG = 2
    const val MP4 = 3
    const val M4A = 4
    const val WEBP = 5

    fun fromMime(mime: String): Int = when (mime.lowercase().substringBefore(';').trim()) {
        "image/jpeg", "image/jpg" -> JPEG
        "image/png" -> PNG
        "image/webp" -> WEBP
        "video/mp4" -> MP4
        "audio/mp4", "audio/m4a", "audio/aac", "audio/x-m4a" -> M4A
        else -> OCTET
    }

    fun toMime(tag: Int): String = when (tag) {
        JPEG -> "image/jpeg"
        PNG -> "image/png"
        WEBP -> "image/webp"
        MP4 -> "video/mp4"
        M4A -> "audio/mp4"
        else -> "application/octet-stream"
    }

    fun extension(tag: Int): String = when (tag) {
        JPEG -> ".jpg"
        PNG -> ".png"
        WEBP -> ".webp"
        MP4 -> ".mp4"
        M4A -> ".m4a"
        else -> ".bin"
    }
}

class MediaCodecException(message: String) : Exception(message)

fun ByteArray.toHex(): String {
    val sb = StringBuilder(size * 2)
    for (b in this) {
        val v = b.toInt() and 0xFF
        sb.append(HEX[v ushr 4]).append(HEX[v and 0x0F])
    }
    return sb.toString()
}

fun String.hexToBytes(): ByteArray {
    require(length % 2 == 0) { "odd hex length" }
    return ByteArray(length / 2) { ((Character.digit(this[it * 2], 16) shl 4) or Character.digit(this[it * 2 + 1], 16)).toByte() }
}

private const val HEX = "0123456789abcdef"

fun sha256(data: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(data)

/** `MEDIA_OFFER`: `blobHash(32) | totalSize(u32) | mimeTag(u8) | chunkSize(u16) | thumbnail(<=16 KiB)`. */
class MediaOffer(
    val blobHash: ByteArray,
    val totalSize: Long,
    val mimeTag: Int,
    val chunkSize: Int,
    val thumbnail: ByteArray = ByteArray(0)
) {
    val hashHex: String get() = blobHash.toHex()
    val chunkCount: Int get() = ((totalSize + chunkSize - 1) / chunkSize).toInt()

    /** Size of chunk [index] on the wire. */
    fun wireSize(index: Int): Int =
        if (index == chunkCount - 1) (totalSize - index.toLong() * chunkSize).toInt() else chunkSize
}

/** `MEDIA_REQUEST`: `blobHash(32) | chunkCount(u16) | bitmap(ceil(n/8))`, optionally followed by a Wi-Fi endpoint. */
class MediaRequest(
    val blobHash: ByteArray,
    val chunkCount: Int,
    val indexes: List<Int>,
    val lan: LanEndpoint? = null
) {
    val hashHex: String get() = blobHash.toHex()
}

/** Where the requester is listening for the bulk lane. [token] is the one-time secret the sender must present. */
class LanEndpoint(val ipv4: ByteArray, val port: Int, val token: ByteArray) {
    val host: String get() = ipv4.joinToString(".") { (it.toInt() and 0xFF).toString() }
}

/** `MEDIA_CHUNK`: `blobHash(32) | chunkIndex(u32) | data`. */
class MediaChunk(val blobHash: ByteArray, val index: Long, val data: ByteArray) {
    val hashHex: String get() = blobHash.toHex()
}

object MediaCodecs {
    private const val OFFER_FIXED = 32 + 4 + 1 + 2
    private const val LAN_EXT_TAG = 0x4C
    private const val LAN_EXT_SIZE = 1 + 4 + 2 + 8

    fun encodeOffer(o: MediaOffer): ByteArray {
        require(o.blobHash.size == MediaLimits.HASH_BYTES) { "hash must be 32 bytes" }
        require(o.thumbnail.size <= MediaLimits.MAX_THUMBNAIL_BYTES) { "thumbnail too large" }
        require(o.totalSize in 1..0xFFFF_FFFFL) { "size out of range" }
        require(o.chunkSize in 1..0xFFFF) { "chunk size out of range" }
        return ByteBuffer.allocate(OFFER_FIXED + o.thumbnail.size)
            .put(o.blobHash)
            .putInt(o.totalSize.toInt())
            .put(o.mimeTag.toByte())
            .putShort(o.chunkSize.toShort())
            .put(o.thumbnail)
            .array()
    }

    fun decodeOffer(bytes: ByteArray): MediaOffer {
        if (bytes.size < OFFER_FIXED) throw MediaCodecException("offer truncated")
        val buf = ByteBuffer.wrap(bytes)
        val hash = ByteArray(32).also { buf.get(it) }
        val total = buf.int.toLong() and 0xFFFF_FFFFL
        val mime = buf.get().toInt() and 0xFF
        val chunk = buf.short.toInt() and 0xFFFF
        if (total == 0L) throw MediaCodecException("empty blob")
        if (chunk == 0) throw MediaCodecException("zero chunk size")
        val thumbLen = buf.remaining()
        if (thumbLen > MediaLimits.MAX_THUMBNAIL_BYTES) throw MediaCodecException("thumbnail too large")
        val count = (total + chunk - 1) / chunk
        if (count > MediaLimits.MAX_CHUNKS) throw MediaCodecException("too many chunks")
        val thumb = ByteArray(thumbLen).also { buf.get(it) }
        return MediaOffer(hash, total, mime, chunk, thumb)
    }

    fun encodeRequest(r: MediaRequest): ByteArray {
        require(r.blobHash.size == MediaLimits.HASH_BYTES) { "hash must be 32 bytes" }
        require(r.chunkCount in 1..MediaLimits.MAX_CHUNKS) { "chunk count out of range" }
        val bitmap = ByteArray((r.chunkCount + 7) / 8)
        for (i in r.indexes) {
            if (i in 0 until r.chunkCount) bitmap[i / 8] = (bitmap[i / 8].toInt() or (1 shl (i % 8))).toByte()
        }
        val ext = r.lan?.let { LAN_EXT_SIZE } ?: 0
        val buf = ByteBuffer.allocate(32 + 2 + bitmap.size + ext)
            .put(r.blobHash).putShort(r.chunkCount.toShort()).put(bitmap)
        r.lan?.let {
            require(it.ipv4.size == 4 && it.token.size == 8) { "bad lan endpoint" }
            buf.put(LAN_EXT_TAG.toByte()).put(it.ipv4).putShort(it.port.toShort()).put(it.token)
        }
        return buf.array()
    }

    fun decodeRequest(bytes: ByteArray): MediaRequest {
        if (bytes.size < 34) throw MediaCodecException("request truncated")
        val buf = ByteBuffer.wrap(bytes)
        val hash = ByteArray(32).also { buf.get(it) }
        val count = buf.short.toInt() and 0xFFFF
        if (count == 0) throw MediaCodecException("zero chunk count")
        val bitmapLen = (count + 7) / 8
        if (buf.remaining() < bitmapLen) throw MediaCodecException("bitmap truncated")
        val bitmap = ByteArray(bitmapLen).also { buf.get(it) }
        val indexes = (0 until count).filter { (bitmap[it / 8].toInt() shr (it % 8)) and 1 == 1 }
        var lan: LanEndpoint? = null
        if (buf.remaining() >= LAN_EXT_SIZE && (buf.get(buf.position()).toInt() and 0xFF) == LAN_EXT_TAG) {
            buf.get()
            val ip = ByteArray(4).also { buf.get(it) }
            val port = buf.short.toInt() and 0xFFFF
            val token = ByteArray(8).also { buf.get(it) }
            if (port != 0) lan = LanEndpoint(ip, port, token)
        }
        return MediaRequest(hash, count, indexes, lan)
    }

    fun encodeChunk(c: MediaChunk): ByteArray {
        require(c.blobHash.size == MediaLimits.HASH_BYTES) { "hash must be 32 bytes" }
        require(c.index in 0..0xFFFF_FFFFL) { "index out of range" }
        return ByteBuffer.allocate(32 + 4 + c.data.size).put(c.blobHash).putInt(c.index.toInt()).put(c.data).array()
    }

    fun decodeChunk(bytes: ByteArray): MediaChunk {
        if (bytes.size < 36) throw MediaCodecException("chunk truncated")
        val buf = ByteBuffer.wrap(bytes)
        val hash = ByteArray(32).also { buf.get(it) }
        val index = buf.int.toLong() and 0xFFFF_FFFFL
        val data = ByteArray(buf.remaining()).also { buf.get(it) }
        return MediaChunk(hash, index, data)
    }
}
