package com.bitchat.android.ai.media

import org.junit.Assert.*
import org.junit.Test

class MediaCodecsTest {

    private val hash = ByteArray(32) { it.toByte() }

    @Test
    fun `offer round trips with thumbnail`() {
        val thumb = ByteArray(300) { (it % 251).toByte() }
        val bytes = MediaCodecs.encodeOffer(MediaOffer(hash, 70_000, MimeTag.JPEG, 384, thumb))
        val o = MediaCodecs.decodeOffer(bytes)
        assertArrayEquals(hash, o.blobHash)
        assertEquals(70_000L, o.totalSize)
        assertEquals(MimeTag.JPEG, o.mimeTag)
        assertEquals(384, o.chunkSize)
        assertArrayEquals(thumb, o.thumbnail)
        assertEquals(183, o.chunkCount) // ceil(70000 / 384)
    }

    @Test
    fun `offer wire size of the last chunk is the remainder`() {
        val o = MediaOffer(hash, 1000, MimeTag.OCTET, 384)
        assertEquals(3, o.chunkCount)
        assertEquals(384, o.wireSize(0))
        assertEquals(232, o.wireSize(2))
    }

    @Test
    fun `offer fixed header is exactly 39 bytes`() {
        assertEquals(39, MediaCodecs.encodeOffer(MediaOffer(hash, 10, 0, 384)).size)
    }

    @Test(expected = MediaCodecException::class)
    fun `offer with zero size is rejected`() {
        val bytes = MediaCodecs.encodeOffer(MediaOffer(hash, 10, 0, 384))
        bytes[32] = 0; bytes[33] = 0; bytes[34] = 0; bytes[35] = 0
        MediaCodecs.decodeOffer(bytes)
    }

    @Test(expected = MediaCodecException::class)
    fun `offer needing more than 65535 chunks is rejected`() {
        // 40 MB in 384-byte chunks is 109k chunks: cannot fit the u16 chunk count of a request
        MediaCodecs.decodeOffer(MediaCodecs.encodeOffer(MediaOffer(hash, 40_000_000, 0, 384)))
    }

    @Test(expected = MediaCodecException::class)
    fun `oversized thumbnail on the wire is rejected`() {
        val fixed = MediaCodecs.encodeOffer(MediaOffer(hash, 10, 0, 384))
        MediaCodecs.decodeOffer(fixed + ByteArray(MediaLimits.MAX_THUMBNAIL_BYTES + 1))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `oversized thumbnail cannot be encoded`() {
        MediaCodecs.encodeOffer(MediaOffer(hash, 10, 0, 384, ByteArray(MediaLimits.MAX_THUMBNAIL_BYTES + 1)))
    }

    @Test(expected = MediaCodecException::class)
    fun `truncated offer is rejected`() {
        MediaCodecs.decodeOffer(ByteArray(20))
    }

    @Test
    fun `request bitmap sets exactly the requested bits`() {
        val r = MediaCodecs.encodeRequest(MediaRequest(hash, 20, listOf(0, 7, 8, 19)))
        assertEquals(32 + 2 + 3, r.size)
        assertEquals(0x81.toByte(), r[34]) // bits 0 and 7
        assertEquals(0x01.toByte(), r[35]) // bit 8
        assertEquals(0x08.toByte(), r[36]) // bit 19
        val back = MediaCodecs.decodeRequest(r)
        assertEquals(listOf(0, 7, 8, 19), back.indexes)
        assertEquals(20, back.chunkCount)
        assertNull(back.lan)
    }

    @Test
    fun `request carries a lan endpoint`() {
        val ep = LanEndpoint(byteArrayOf(192.toByte(), 168.toByte(), 43, 7), 40123, ByteArray(8) { (it + 1).toByte() })
        val back = MediaCodecs.decodeRequest(MediaCodecs.encodeRequest(MediaRequest(hash, 9, listOf(1, 2), ep)))
        assertEquals("192.168.43.7", back.lan!!.host)
        assertEquals(40123, back.lan!!.port)
        assertArrayEquals(ep.token, back.lan!!.token)
        assertEquals(listOf(1, 2), back.indexes)
    }

    @Test(expected = MediaCodecException::class)
    fun `request with a truncated bitmap is rejected`() {
        val r = MediaCodecs.encodeRequest(MediaRequest(hash, 100, listOf(1)))
        MediaCodecs.decodeRequest(r.copyOf(r.size - 3))
    }

    @Test
    fun `chunk round trips and uses an unsigned index`() {
        val data = ByteArray(384) { 9 }
        val back = MediaCodecs.decodeChunk(MediaCodecs.encodeChunk(MediaChunk(hash, 0xFFFF_FFF0L, data)))
        assertEquals(0xFFFF_FFF0L, back.index)
        assertArrayEquals(data, back.data)
    }

    @Test
    fun `one full chunk packet stays under the BLE fragmentation threshold`() {
        // 13-byte v1 header + 8 sender + 8 recipient + 36 media header + 384 data
        assertTrue(13 + 8 + 8 + 36 + MediaLimits.BLE_CHUNK_SIZE < 512)
    }

    @Test
    fun `mime tags map both ways`() {
        assertEquals(MimeTag.JPEG, MimeTag.fromMime("image/jpeg"))
        assertEquals(MimeTag.M4A, MimeTag.fromMime("audio/mp4; codecs=mp4a"))
        assertEquals("video/mp4", MimeTag.toMime(MimeTag.MP4))
        assertEquals(MimeTag.OCTET, MimeTag.fromMime("application/pdf"))
    }
}
