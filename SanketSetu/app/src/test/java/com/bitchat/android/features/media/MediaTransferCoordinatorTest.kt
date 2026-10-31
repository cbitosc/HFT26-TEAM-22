package com.bitchat.android.features.media

import android.content.Context
import android.content.ContextWrapper
import androidx.test.core.app.ApplicationProvider
import com.bitchat.android.model.BitchatMessage
import com.bitchat.android.model.BitchatMessageType
import com.bitchat.android.protocol.MessageType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.util.Random
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Drives two real coordinators (and the real engine, codecs, files and AEAD) over an in-memory "radio" that
 * can silently lose chunks. Proves the glue: a dropped link resumes mid-file, private media is sealed on the
 * air, and a finished blob shows up as an ordinary chat message.
 */
@RunWith(RobolectricTestRunner::class)
class MediaTransferCoordinatorTest {

    @get:Rule val tmp = TemporaryFolder()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var a: Phone
    private lateinit var b: Phone

    private inner class Phone(val id: String) : MediaMeshHost {
        val ctx: Context = object : ContextWrapper(ApplicationProvider.getApplicationContext()) {
            private val cache = tmp.newFolder("cache-$id")
            override fun getCacheDir(): File = cache
            override fun getApplicationContext(): Context = this
        }
        lateinit var peer: Phone
        val coordinator = MediaTransferCoordinator(ctx, this, scope)
        val delivered = CopyOnWriteArrayList<BitchatMessage>()
        val chunkIndexesOnAir = CopyOnWriteArrayList<Long>()
        val chunkPayloadsOnAir = CopyOnWriteArrayList<ByteArray>()
        val offerPayloads = CopyOnWriteArrayList<ByteArray>()
        @Volatile var loseChunksFrom: Long? = null

        override val myPeerId: String get() = id
        override fun peerNickname(peerId: String): String? = if (peerId == peer.id) "peer-${peer.id.take(1)}" else null
        override fun myNickname(): String? = "me-${id.take(1)}"
        override fun hasLinks(): Boolean = true
        override fun isDirectPeer(peerId: String): Boolean = true

        override fun sendBroadcastOffer(payload: ByteArray) {
            offerPayloads += payload
            peer.coordinator.onOfferPacket(id, payload)
        }

        override fun sendAddressed(type: MessageType, to: String, payload: ByteArray, direct: Boolean): Boolean {
            when (type) {
                MessageType.MEDIA_REQUEST -> peer.coordinator.onRequestPacket(id, payload)
                MessageType.MEDIA_CHUNK -> {
                    val index = com.bitchat.android.ai.media.MediaCodecs.decodeChunk(payload).index
                    chunkIndexesOnAir += index
                    chunkPayloadsOnAir += payload
                    if (loseChunksFrom?.let { index >= it } != true) peer.coordinator.onChunkPacket(id, payload)
                }
                else -> fail("unexpected packet type $type")
            }
            return true
        }

        override fun sendNoiseOffer(to: String, plaintext: ByteArray): Boolean {
            offerPayloads += plaintext
            peer.coordinator.onPrivateOffer(id, plaintext)
            return true
        }

        override fun deliver(message: BitchatMessage) { delivered += message }
    }

    @Before fun setUp() {
        a = Phone("aaaaaaaaaaaaaaaa")
        b = Phone("bbbbbbbbbbbbbbbb")
        a.peer = b; b.peer = a
        a.coordinator.start(); b.coordinator.start()
    }

    @After fun tearDown() {
        a.coordinator.stop(); b.coordinator.stop()
        scope.cancel()
    }

    private fun media(size: Int, seed: Long = 3): File =
        tmp.newFile().also { it.writeBytes(ByteArray(size).also { b -> Random(seed).nextBytes(b) }) }

    private fun await(ms: Long = 15_000, cond: () -> Boolean): Boolean {
        val end = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < end) { if (cond()) return true; Thread.sleep(25) }
        return cond()
    }

    @Test
    fun `a public photo arrives as a normal image message`() {
        val src = media(30_000)
        a.coordinator.send(src, "image/jpeg", null, ByteArray(0)) { assertNotNull(it) }
        assertTrue(await { b.delivered.isNotEmpty() })

        val m = b.delivered[0]
        assertEquals(BitchatMessageType.Image, m.type)
        assertFalse(m.isPrivate)
        assertEquals("peer-a", m.sender)
        assertEquals(a.id, m.senderPeerID)
        assertArrayEquals(src.readBytes(), File(m.content).readBytes())
        assertTrue(File(m.content).name.endsWith(".jpg"))
    }

    @Test
    fun `a voice note arrives as an audio message`() {
        val src = media(40_000, 9)
        a.coordinator.send(src, "audio/mp4", null, ByteArray(0)) { }
        assertTrue(await { b.delivered.isNotEmpty() })
        assertEquals(BitchatMessageType.Audio, b.delivered[0].type)
        assertTrue(File(b.delivered[0].content).name.endsWith(".m4a"))
    }

    @Test
    fun `a link that dies at 50 percent resumes from the second half only`() {
        val src = media(60_000)
        a.loseChunksFrom = 80 // 60000 / 384 = 157 chunks; the radio dies a little past halfway
        a.coordinator.send(src, "image/jpeg", null, ByteArray(0)) { }
        assertTrue("first pass finished sending", await { a.chunkIndexesOnAir.size >= 157 })
        Thread.sleep(300)
        assertTrue("nothing delivered on a dead link", b.delivered.isEmpty())
        assertEquals("first pass sent every chunk exactly once", 157, a.chunkIndexesOnAir.size)

        a.loseChunksFrom = null
        a.chunkIndexesOnAir.clear()
        b.coordinator.onPeerReconnected(a.id) // the neighbour is back

        assertTrue(await { b.delivered.isNotEmpty() })
        assertEquals("only the lost tail was re-sent", 157 - 80, a.chunkIndexesOnAir.size)
        assertTrue("no chunk before the drop point was re-sent", a.chunkIndexesOnAir.all { it >= 80 })
        assertArrayEquals(src.readBytes(), File(b.delivered[0].content).readBytes())
    }

    @Test
    fun `private media is sealed on the air and shows up as a private message`() {
        val src = media(30_000, 5)
        a.coordinator.send(src, "image/jpeg", b.id, ByteArray(0)) { assertNotNull(it) }
        assertTrue(await { b.delivered.isNotEmpty() })

        val m = b.delivered[0]
        assertTrue(m.isPrivate)
        assertEquals("me-b", m.recipientNickname)
        assertArrayEquals(src.readBytes(), File(m.content).readBytes())

        val plain = src.readBytes()
        val probe = plain.copyOfRange(1000, 1032)
        assertTrue("no chunk on the air carries plaintext", a.chunkPayloadsOnAir.none { containsRun(it, probe) })
    }

    @Test
    fun `a duplicate offer for media already received does not produce a second message`() {
        val src = media(30_000, 7)
        a.coordinator.send(src, "image/jpeg", null, ByteArray(0)) { }
        assertTrue(await { b.delivered.isNotEmpty() })
        val offer = a.offerPayloads.first()
        b.coordinator.onOfferPacket(a.id, offer)
        Thread.sleep(300)
        assertEquals(1, b.delivered.size)
    }

    @Test
    fun `garbage packets are ignored without crashing`() {
        b.coordinator.onOfferPacket(a.id, ByteArray(5))
        b.coordinator.onRequestPacket(a.id, ByteArray(3))
        b.coordinator.onChunkPacket(a.id, ByteArray(10))
        b.coordinator.onPrivateOffer(a.id, ByteArray(8))
        assertTrue(b.delivered.isEmpty())
    }

    private fun containsRun(hay: ByteArray, needle: ByteArray): Boolean {
        outer@ for (i in 0..hay.size - needle.size) {
            for (j in needle.indices) if (hay[i + j] != needle[j]) continue@outer
            return true
        }
        return false
    }
}
