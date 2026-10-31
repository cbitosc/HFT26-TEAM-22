package com.bitchat.android.ai.media

import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.util.Random

class MediaTransferEngineTest {

    @get:Rule val tmp = TemporaryFolder()

    private var now = 1_000_000L
    private var nodeSeq = 0
    private lateinit var sender: Node
    private lateinit var receiver: Node

    /** One phone: engine + store + a link that hands packets straight to the other phone. */
    private inner class Node(
        val id: String,
        lan: LanLane? = null,
        val store: BlobStore = BlobStore(tmp.newFolder("store-$id-${nodeSeq++}"))
    ) : MediaLink, MediaEvents {
        val engine = MediaTransferEngine(store, this, this, lan) { now }
        var peer: Node? = null
        var linkUp = true

        /** Chunks the radio silently loses while the link is "dead". */
        var dropChunkIf: (MediaChunk) -> Boolean = { false }
        val chunksSent = ArrayList<Long>()
        val requests = ArrayList<MediaRequest>()
        val offersSent = ArrayList<MediaOffer>()
        val received = ArrayList<ReceivedMedia>()
        val failures = ArrayList<MediaFailure>()
        val laneOfProgress = HashSet<MediaLane>()
        var lastKey: ByteArray? = null

        override fun sendOffer(offer: MediaOffer, to: String?, key: ByteArray?) {
            offersSent += offer
            lastKey = key
            if (linkUp) peer?.engine?.onOffer(id, offer, key)
        }

        override fun sendRequest(to: String, request: MediaRequest) {
            requests += request
            if (linkUp) peer?.engine?.onRequest(id, request)
        }

        override fun sendChunk(to: String, chunk: MediaChunk): Boolean {
            chunksSent += chunk.index
            if (!linkUp || dropChunkIf(chunk)) return true // on air, never arrives
            peer?.engine?.onChunk(id, chunk)
            return true
        }

        override fun onReceived(media: ReceivedMedia) { received += media }
        override fun onFailed(hashHex: String, reason: MediaFailure) { failures += reason }
        override fun onProgress(hashHex: String, received: Int, total: Int, lane: MediaLane) { laneOfProgress += lane }

        fun drain() { while (engine.pump(8)) { /* keep sending */ } }
    }

    @Before fun setUp() {
        sender = Node("aaaaaaaaaaaaaaaa")
        receiver = Node("bbbbbbbbbbbbbbbb")
        sender.peer = receiver
        receiver.peer = sender
    }

    @After fun tearDown() {
        sender.engine.shutdown()
        receiver.engine.shutdown()
    }

    private fun sampleFile(size: Int, seed: Long = 7): File {
        val f = tmp.newFile()
        f.writeBytes(ByteArray(size).also { Random(seed).nextBytes(it) })
        return f
    }

    @Test
    fun `a blob moves across and is verified against its content address`() {
        val src = sampleFile(20_000)
        val offer = sender.engine.offer(src, MimeTag.JPEG, ByteArray(10), to = null)
        sender.drain()

        assertEquals(1, receiver.received.size)
        val got = receiver.received[0]
        assertArrayEquals(src.readBytes(), got.file.readBytes())
        assertEquals(offer.hashHex, got.hashHex)
        assertEquals(MimeTag.JPEG, got.mimeTag)
        assertFalse(got.private)
        assertEquals(offer.chunkCount, sender.chunksSent.size)
    }

    @Test
    fun `dropping the link at 50 percent resumes from 50 percent not from chunk 0`() {
        val src = sampleFile(60_000)
        val offer = sender.engine.offer(src, MimeTag.JPEG, ByteArray(0), to = null)
        val total = offer.chunkCount
        val half = total / 2
        assertTrue(total > 100)

        // The radio dies after chunk `half`: everything past it is sent into the void.
        sender.dropChunkIf = { it.index >= half }
        sender.drain()
        assertTrue("not delivered yet", receiver.received.isEmpty())
        assertEquals(half, receiver.engine.missingOf(offer.hashHex)!!.let { total - it.size })
        assertEquals(total, sender.chunksSent.size)

        // Link comes back. After the 8 s resume timeout the receiver re-requests ONLY what is missing.
        sender.dropChunkIf = { false }
        sender.chunksSent.clear()
        now += MediaLimits.RESUME_TIMEOUT_MS + 1
        receiver.engine.tick()

        val resume = receiver.requests.last()
        assertEquals((half until total).toList(), resume.indexes)
        sender.drain()

        assertEquals("only the missing second half was re-sent", total - half, sender.chunksSent.size)
        assertTrue("nothing from the first half was re-sent", sender.chunksSent.all { it >= half })
        assertEquals(1, receiver.received.size)
        assertArrayEquals(src.readBytes(), receiver.received[0].file.readBytes())
    }

    @Test
    fun `a silent link does not restart the file even after several resume rounds`() {
        val src = sampleFile(30_000)
        val offer = sender.engine.offer(src, MimeTag.OCTET, ByteArray(0), to = null)
        // Every second chunk is lost on the first pass, and the third attempt still loses chunk 5.
        sender.dropChunkIf = { it.index % 2L == 0L }
        sender.drain()
        val firstMissing = receiver.engine.missingOf(offer.hashHex)!!
        assertEquals((0 until offer.chunkCount).filter { it % 2 == 0 }, firstMissing)

        var rounds = 0
        sender.dropChunkIf = { it.index == 5L && rounds < 2 }
        while (receiver.received.isEmpty() && rounds < 5) {
            now += MediaLimits.RESUME_TIMEOUT_MS + 1
            receiver.engine.tick()
            sender.drain()
            rounds++
        }
        assertEquals(1, receiver.received.size)
        assertArrayEquals(src.readBytes(), receiver.received[0].file.readBytes())
        // Each request only ever named chunks that were genuinely missing.
        for (r in receiver.requests.drop(1)) assertTrue(r.indexes.size <= firstMissing.size)
    }

    @Test
    fun `reconnecting a neighbour re-requests immediately without waiting for the timer`() {
        val src = sampleFile(20_000)
        val offer = sender.engine.offer(src, MimeTag.OCTET, ByteArray(0), to = null)
        val half = offer.chunkCount / 2
        sender.dropChunkIf = { it.index >= half }
        sender.drain()
        sender.dropChunkIf = { false }
        sender.chunksSent.clear()

        receiver.engine.onPeerReconnected(sender.id) // no clock advance
        sender.drain()

        assertEquals(1, receiver.received.size)
        assertTrue(sender.chunksSent.all { it >= half })
    }

    @Test
    fun `a corrupted chunk makes the whole blob be discarded`() {
        val src = sampleFile(10_000)
        sender.dropChunkIf = { false }
        val offer = sender.engine.offer(src, MimeTag.OCTET, ByteArray(0), to = null)
        // Flip bytes in chunk 3 in flight: same size, wrong content.
        val evil = object : MediaLink by sender {
            override fun sendChunk(to: String, chunk: MediaChunk): Boolean {
                val data = if (chunk.index == 3L) chunk.data.copyOf().also { it[0] = (it[0] + 1).toByte() } else chunk.data
                receiver.engine.onChunk(sender.id, MediaChunk(chunk.blobHash, chunk.index, data))
                return true
            }
        }
        val dir = tmp.newFolder("evil")
        val evilEngine = MediaTransferEngine(BlobStore(dir), evil, sender, null) { now }
        evilEngine.offer(src, MimeTag.OCTET, ByteArray(0), to = null)
        // The receiver already asked sender (not evilEngine); route the request to the evil engine instead.
        receiver.received.clear(); receiver.failures.clear()
        evilEngine.onRequest(receiver.id, receiver.requests.last())
        while (evilEngine.pump(8)) { }

        assertTrue(receiver.received.isEmpty())
        assertEquals(listOf(MediaFailure.HASH_MISMATCH), receiver.failures)
        assertFalse(receiver.store.has(offer.hashHex))
        assertFalse(receiver.store.partFile(offer.hashHex).exists())
        evilEngine.shutdown()
    }

    @Test
    fun `a blob already in the store is never downloaded again`() {
        val src = sampleFile(8_000)
        sender.engine.offer(src, MimeTag.JPEG, ByteArray(0), to = null)
        sender.drain()
        assertEquals(1, receiver.received.size)

        val before = receiver.requests.size
        val second = sampleOffer(sender.offersSent.last())
        receiver.engine.onOffer(sender.id, second)

        assertEquals("no new request went out", before, receiver.requests.size)
        assertEquals(2, receiver.received.size)
        assertTrue(receiver.received[1].fromCache)
    }

    private fun sampleOffer(o: MediaOffer) = MediaOffer(o.blobHash, o.totalSize, o.mimeTag, o.chunkSize, o.thumbnail)

    @Test
    fun `the sender ignores its own offer coming back`() {
        val src = sampleFile(5_000)
        val offer = sender.engine.offer(src, MimeTag.OCTET, ByteArray(0), to = null)
        sender.engine.onOffer(receiver.id, offer)
        assertEquals(0, sender.engine.incomingCount())
    }

    @Test
    fun `private media is sealed on the wire and opened only with the key`() {
        val src = sampleFile(15_000)
        val key = ByteArray(32) { (it * 3).toByte() }
        val seen = ArrayList<ByteArray>()
        val spy = object : MediaLink by sender {
            override fun sendChunk(to: String, chunk: MediaChunk): Boolean { seen += chunk.data; return sender.sendChunk(to, chunk) }
        }
        val eng = MediaTransferEngine(sender.store, spy, sender, null) { now }
        eng.offer(src, MimeTag.M4A, ByteArray(0), to = receiver.id, key = key)
        sender.peer = null // we route manually below
        receiver.engine.onOffer(sender.id, sender.offersSent.last(), key)
        eng.onRequest(receiver.id, receiver.requests.last())
        sender.peer = receiver
        while (eng.pump(8)) { }

        assertEquals(1, receiver.received.size)
        val got = receiver.received[0]
        assertTrue(got.private && got.temporary)
        assertArrayEquals(src.readBytes(), got.file.readBytes())
        // No chunk on the air contains a recognisable run of the plaintext.
        val plain = src.readBytes()
        val probe = plain.copyOfRange(100, 140)
        assertTrue(seen.none { indexOf(it, probe) >= 0 })
        eng.shutdown()
    }

    @Test
    fun `forged chunks for a private blob are refused`() {
        val src = sampleFile(6_000)
        val key = ByteArray(32) { 5 }
        sender.engine.offer(src, MimeTag.OCTET, ByteArray(0), to = receiver.id, key = key)
        val offer = sender.offersSent.last()
        val t = IncomingTransfer(offer, key, tmp.newFile(), tmp.newFile(), "x", now)
        assertFalse(t.accept(0, ByteArray(offer.wireSize(0)), now)) // right size, no valid tag
        assertEquals(0, t.receivedCount())
    }

    @Test
    fun `only the intended recipient may pull a private blob`() {
        val src = sampleFile(6_000)
        val key = ByteArray(32) { 5 }
        val offer = sender.engine.offer(src, MimeTag.OCTET, ByteArray(0), to = "cccccccccccccccc", key = key)
        sender.engine.onRequest("dddddddddddddddd", MediaRequest(offer.blobHash, offer.chunkCount, (0 until offer.chunkCount).toList()))
        assertFalse(sender.engine.pump(8))
        assertTrue(sender.chunksSent.isEmpty())
    }

    @Test
    fun `an unanswered private offer is retried until the recipient asks`() {
        sender.linkUp = false
        val src = sampleFile(5_000)
        sender.engine.offer(src, MimeTag.OCTET, ByteArray(0), to = receiver.id, key = ByteArray(32) { 1 })
        assertEquals(1, sender.offersSent.size)
        now += MediaTransferEngine.OFFER_RETRY_MS
        sender.engine.tick()
        assertEquals(2, sender.offersSent.size)
        sender.linkUp = true
        now += MediaTransferEngine.OFFER_RETRY_MS
        sender.engine.tick()
        assertEquals(3, sender.offersSent.size)
        assertEquals(1, receiver.engine.incomingCount())
        now += MediaTransferEngine.OFFER_RETRY_MS
        sender.engine.tick()
        assertEquals("stops retrying once the recipient has asked", 3, sender.offersSent.size)
    }

    @Test
    fun `a partial download survives a restart and continues`() {
        val src = sampleFile(40_000)
        val offer = sender.engine.offer(src, MimeTag.OCTET, ByteArray(0), to = null)
        val half = offer.chunkCount / 2
        sender.dropChunkIf = { it.index >= half }
        sender.drain()
        now += MediaLimits.RESUME_TIMEOUT_MS + 1
        receiver.engine.tick() // persists the bitmap
        receiver.engine.shutdown()

        // "App restarted": a brand new engine over the same on-disk store, shown the same offer again.
        val reborn = Node("bbbbbbbbbbbbbbbb", store = receiver.store)
        reborn.peer = sender
        sender.peer = reborn
        sender.dropChunkIf = { false }
        sender.chunksSent.clear()
        reborn.engine.onOffer(sender.id, sender.offersSent.last())

        assertEquals((half until offer.chunkCount).toList(), reborn.requests.last().indexes)
        sender.drain()
        assertEquals(offer.chunkCount - half, sender.chunksSent.size)
        assertEquals(1, reborn.received.size)
        assertArrayEquals(src.readBytes(), reborn.received[0].file.readBytes())
        reborn.engine.shutdown()
    }

    @Test
    fun `offers beyond the active transfer cap are ignored`() {
        repeat(MediaTransferEngine.MAX_ACTIVE_INCOMING + 2) { i ->
            val o = MediaOffer(ByteArray(32) { (i + 1).toByte() }, 5_000, 0, 384)
            receiver.engine.onOffer("aaaaaaaaaaaaaaaa", o)
        }
        assertEquals(MediaTransferEngine.MAX_ACTIVE_INCOMING, receiver.engine.incomingCount())
    }

    @Test
    fun `a stalled transfer gives up after ten minutes but keeps its partial`() {
        val src = sampleFile(10_000)
        val offer = sender.engine.offer(src, MimeTag.OCTET, ByteArray(0), to = null)
        sender.dropChunkIf = { it.index > 3 }
        sender.drain()
        sender.linkUp = false
        now += MediaLimits.GIVE_UP_AFTER_MS + 1
        receiver.engine.tick()
        assertEquals(listOf(MediaFailure.STALLED), receiver.failures)
        assertTrue(receiver.store.partFile(offer.hashHex).exists())
    }

    @Test
    fun `blob store trims oldest blobs but protects active ones`() {
        val store = BlobStore(tmp.newFolder("cap"), maxBytes = 25_000)
        val a = store.putFile(sampleFile(10_000, 1)); a.file.setLastModified(1_000)
        val b = store.putFile(sampleFile(10_000, 2)); b.file.setLastModified(2_000)
        val c = store.putFile(sampleFile(10_000, 3)); c.file.setLastModified(3_000)
        store.trim(protect = setOf(a.hashHex))
        assertTrue(store.has(a.hashHex))
        assertFalse(store.has(b.hashHex))
        assertTrue(store.has(c.hashHex))
    }

    @Test
    fun `blob store dedups identical content`() {
        val store = BlobStore(tmp.newFolder("dd"))
        val one = store.putFile(sampleFile(3_000, 9))
        val two = store.putFile(sampleFile(3_000, 9))
        assertEquals(one.hashHex, two.hashHex)
        assertEquals(1, store.dir.listFiles()!!.count { it.name == one.hashHex })
    }

    @Test(expected = IllegalArgumentException::class)
    fun `blob store rejects path-like hashes`() {
        BlobStore(tmp.newFolder("bad")).file("../../etc/passwd")
    }

    // ------------------------------------------------------------- Wi-Fi bulk lane

    private val loopback = LanEnvironment { byteArrayOf(127, 0, 0, 1) }

    private fun awaitUntil(ms: Long = 5_000, cond: () -> Boolean): Boolean {
        val end = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < end) { if (cond()) return true; Thread.sleep(20) }
        return cond()
    }

    @Test
    fun `a large blob rides the Wi-Fi lane and sends no chunk over Bluetooth`() {
        val s = Node("aaaaaaaaaaaaaaaa", TcpLanLane(loopback))
        val r = Node("bbbbbbbbbbbbbbbb", TcpLanLane(loopback))
        s.peer = r; r.peer = s
        val src = sampleFile(300_000)
        val offer = s.engine.offer(src, MimeTag.MP4, ByteArray(0), to = null)
        assertTrue("request advertised a Wi-Fi endpoint", r.requests.first().lan != null)

        assertTrue("delivered", awaitUntil { r.received.isNotEmpty() })
        assertArrayEquals(src.readBytes(), r.received[0].file.readBytes())
        assertEquals(offer.hashHex, r.received[0].hashHex)
        assertTrue("no chunk touched Bluetooth", s.chunksSent.isEmpty())
        assertEquals(setOf(MediaLane.WIFI), r.laneOfProgress)
        s.engine.shutdown(); r.engine.shutdown()
    }

    @Test
    fun `small blobs never open a Wi-Fi socket`() {
        val s = Node("aaaaaaaaaaaaaaaa", TcpLanLane(loopback))
        val r = Node("bbbbbbbbbbbbbbbb", TcpLanLane(loopback))
        s.peer = r; r.peer = s
        s.engine.offer(sampleFile(MediaLimits.LAN_THRESHOLD_BYTES.toInt() - 1), MimeTag.JPEG, ByteArray(0), to = null)
        assertNull(r.requests.first().lan)
        s.drain()
        assertEquals(1, r.received.size)
        s.engine.shutdown(); r.engine.shutdown()
    }

    @Test
    fun `a socket with the wrong token is turned away`() {
        val lane = TcpLanLane(loopback)
        val hash = ByteArray(32) { 3 }
        var got = 0
        val ep = lane.listen(hash.toHex()) { got++ }!!
        val wrong = LanEndpoint(ep.ipv4, ep.port, ByteArray(8) { 9 })
        try {
            lane.stream(wrong, hash, listOf(MediaChunk(hash, 0, ByteArray(100))).iterator())
        } catch (_: Exception) { /* a reset is also a refusal */ }
        Thread.sleep(200)
        assertEquals(0, got)
        lane.stopListening(hash.toHex())
    }

    @Test
    fun `if the Wi-Fi lane fails the transfer falls back to Bluetooth and still completes`() {
        val broken = object : LanLane {
            override fun listen(hashHex: String, onChunk: (MediaChunk) -> Unit) =
                LanEndpoint(byteArrayOf(10, 0, 0, 2), 9, ByteArray(8))
            override fun stopListening(hashHex: String) {}
            override fun stream(endpoint: LanEndpoint, blobHash: ByteArray, chunks: Iterator<MediaChunk>) {
                throw java.io.IOException("network unreachable")
            }
        }
        val s = Node("aaaaaaaaaaaaaaaa", broken)
        val r = Node("bbbbbbbbbbbbbbbb", broken)
        s.peer = r; r.peer = s
        val src = sampleFile(90_000)
        s.engine.offer(src, MimeTag.JPEG, ByteArray(0), to = null)
        Thread.sleep(300) // let the failed stream attempt finish
        assertTrue(r.received.isEmpty())

        now += MediaLimits.RESUME_TIMEOUT_MS + 1
        r.engine.tick() // re-requests; sender now knows Wi-Fi is down and queues over Bluetooth
        s.drain()

        assertEquals(1, r.received.size)
        assertArrayEquals(src.readBytes(), r.received[0].file.readBytes())
        assertEquals(setOf(MediaLane.BLUETOOTH), r.laneOfProgress)
        s.engine.shutdown(); r.engine.shutdown()
    }

    private fun indexOf(hay: ByteArray, needle: ByteArray): Int {
        outer@ for (i in 0..hay.size - needle.size) {
            for (j in needle.indices) if (hay[i + j] != needle[j]) continue@outer
            return i
        }
        return -1
    }
}
