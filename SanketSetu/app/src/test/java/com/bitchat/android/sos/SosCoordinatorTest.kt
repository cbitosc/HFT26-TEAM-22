package com.bitchat.android.sos

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.bitchat.android.ai.sos.AckKind
import com.bitchat.android.ai.sos.LocationOutcome
import com.bitchat.android.ai.sos.LocationTier
import com.bitchat.android.ai.sos.ResponderRole
import com.bitchat.android.ai.sos.SosAck
import com.bitchat.android.ai.sos.SosCategory
import com.bitchat.android.ai.sos.SosPayload
import com.bitchat.android.ai.sos.SosProtocol
import com.bitchat.android.ai.sos.SosStage
import kotlinx.coroutines.runBlocking
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.security.SecureRandom

/**
 * Drives the real [SosCoordinator] through a fake mesh. Real Ed25519 (BouncyCastle) is used for
 * certificate checks; only the radio is faked.
 */
@RunWith(RobolectricTestRunner::class)
class SosCoordinatorTest {

    private class Sent(val text: String, val priority: Int, val ttl: Int, val syncable: Boolean)

    private val myKey = Ed25519PrivateKeyParameters(SecureRandom())
    private val responderKey = Ed25519PrivateKeyParameters(SecureRandom())
    private val impostorKey = Ed25519PrivateKeyParameters(SecureRandom())

    private fun pub(k: Ed25519PrivateKeyParameters) = k.generatePublicKey().encoded

    private inner class FakeBridge(var directPeers: Int = 2) : SosMeshBridge {
        val sent = java.util.concurrent.CopyOnWriteArrayList<Sent>()
        override val myPeerId = "aaaaaaaaaaaaaaaa"
        override fun myNickname() = "victim"
        override fun connectedPeerCount() = directPeers
        override fun mySigningPublicKey() = pub(myKey)
        override fun peerSigningKey(peerId: String): ByteArray? = null
        override fun verifyEd25519(signature: ByteArray, data: ByteArray, publicKey: ByteArray): Boolean = try {
            Ed25519Signer().run { init(false, Ed25519PublicKeyParameters(publicKey, 0)); update(data, 0, data.size); verifySignature(signature) }
        } catch (_: Exception) { false }
        override fun broadcast(text: String, priority: Int, ttl: Int, syncable: Boolean) {
            sent += Sent(text, priority, ttl, syncable)
        }
    }

    private lateinit var bridge: FakeBridge
    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Before
    fun setUp() {
        SosCoordinator.resetForTesting()
        bridge = FakeBridge()
        SosCoordinator.attach(context, bridge)
        SosCoordinator.setTier(LocationTier.NONE) // no GPS in unit tests; chosen explicitly where it matters
    }

    private fun sendSos(cat: SosCategory = SosCategory.MEDICAL): String = runBlocking {
        assertEquals(SosCoordinator.SendOutcome.SENT, SosCoordinator.send(cat))
        SosCoordinator.state.value.tracker!!.sosId
    }

    private fun reply(id: String, kind: AckKind, from: String, cert: String? = null, signer: ByteArray? = null,
                      to: String = bridge.myPeerId, packetTtl: Int = 7, initialTtl: Int = 7) =
        SosCoordinator.onBroadcastText(
            SosProtocol.encodeAck(SosAck(id, to, kind, initialTtl, "cs-$from", cert, "ETA 10 min")),
            from, System.currentTimeMillis(), packetTtl, signer
        )

    private fun demoCert(role: ResponderRole = ResponderRole.NDRF, subject: Ed25519PrivateKeyParameters = responderKey) =
        DemoAuthority.issue(role, "NDRF-12", pub(subject), 30)

    // ---- ordinary chat must be untouched by the SOS layer -----------------------------------

    private fun chat(text: String) =
        SosCoordinator.onBroadcastText(text, "bbbbbbbbbbbbbbbb", System.currentTimeMillis(), 7, null)

    @Test
    fun `ordinary chat text passes straight through and sends nothing`() {
        val samples = listOf(
            "hello everyone", "need help at the north gate!", "🆘 SOS (typed by hand, no tag)", "",
            "brackets [[like this]] are fine", "[[SOS1;id=zzzz;c=MED]]", "[[ACK1;broken]]", "SOS1 ACK1 ;;; ==="
        )
        for (t in samples) assertEquals("\"$t\" must be NOT_SOS", SosCoordinator.Intake.NOT_SOS, chat(t))
        Thread.sleep(200)
        assertTrue("chat must never trigger SOS traffic", bridge.sent.isEmpty())
        assertNull(SosCoordinator.state.value.tracker)
    }

    @Test
    fun `without an attached mesh every message is treated as ordinary chat`() {
        SosCoordinator.resetForTesting()
        assertEquals(
            SosCoordinator.Intake.NOT_SOS,
            chat(SosProtocol.encodeSos(SosPayload("a1b2c3d4", SosCategory.MEDICAL, LocationTier.NONE, null)))
        )
    }

    // ---- sending ----------------------------------------------------------------------------

    @Test
    fun `an sos goes out at priority zero with full ttl and starts the tracker`() {
        val id = sendSos(SosCategory.TRAPPED)
        val sent = bridge.sent.single()
        assertEquals(0, sent.priority)
        assertEquals(7, sent.ttl)
        assertTrue(sent.syncable)
        val parsed = SosProtocol.parseSos(sent.text)!!
        assertEquals(id, parsed.id)
        assertEquals(SosCategory.TRAPPED, parsed.category)
        val t = SosCoordinator.state.value.tracker!!
        assertEquals(SosStage.BROADCASTED, t.currentStage)
        assertEquals(2, t.handedToPeers)
    }

    @Test
    fun `no gps fix sends without coordinates and says so`() {
        SosCoordinator.setTier(LocationTier.PRECISE) // permission is not granted in the unit test, so no fix
        sendSos()
        val parsed = SosProtocol.parseSos(bridge.sent.single().text)!!
        assertNull(parsed.latLon)
        assertEquals(LocationOutcome.NO_FIX, SosCoordinator.state.value.tracker!!.locationOutcome)
    }

    @Test
    fun `no gps tier reports not shared`() {
        sendSos()
        assertEquals(LocationOutcome.NOT_SHARED, SosCoordinator.state.value.tracker!!.locationOutcome)
    }

    @Test
    fun `safe check in is lower priority and does not open a tracker`() {
        runBlocking { SosCoordinator.send(SosCategory.SAFE) }
        assertEquals(1, bridge.sent.single().priority)
        assertNull(SosCoordinator.state.value.tracker)
        assertNotNull(SosCoordinator.state.value.safeSentAtMs)
    }

    @Test
    fun `without a mesh nothing is sent`() {
        SosCoordinator.resetForTesting()
        assertEquals(SosCoordinator.SendOutcome.NO_MESH, runBlocking { SosCoordinator.send(SosCategory.FIRE) })
    }

    @Test
    fun `bare hold to send defaults to general help, never to a safe check in`() {
        assertEquals(SosCategory.GENERAL, SosCoordinator.defaultCategory())
        SosCoordinator.select(SosCategory.SAFE)
        assertEquals(SosCategory.GENERAL, SosCoordinator.defaultCategory())
        SosCoordinator.select(SosCategory.FLOOD)
        assertEquals(SosCategory.FLOOD, SosCoordinator.defaultCategory())
    }

    // ---- the closed loop --------------------------------------------------------------------

    @Test
    fun `receipts count distinct devices and are consumed not shown`() {
        val id = sendSos()
        assertEquals(SosCoordinator.Intake.CONSUMED, reply(id, AckKind.RECEIVED, "p1"))
        reply(id, AckKind.RECEIVED, "p2")
        reply(id, AckKind.RECEIVED, "p1")
        val t = SosCoordinator.state.value.tracker!!
        assertEquals(2, t.reachedCount)
        assertEquals(SosStage.REACHED, t.currentStage)
    }

    @Test
    fun `replies to someone else's sos or for another id are ignored`() {
        val id = sendSos()
        reply(id, AckKind.ACKNOWLEDGED, "p1", to = "bbbbbbbbbbbbbbbb")
        reply("deadbeef", AckKind.ACKNOWLEDGED, "p1")
        assertEquals(0, SosCoordinator.state.value.tracker!!.reachedCount)
    }

    @Test
    fun `hop count comes from the ttl the replier used minus the ttl received`() {
        val id = sendSos()
        reply(id, AckKind.ACKNOWLEDGED, "p1", packetTtl = 4, initialTtl = 7)
        assertEquals(3, SosCoordinator.state.value.tracker!!.replies.getValue("p1").hops)
    }

    @Test
    fun `a civilian saying on my way is acknowledged but never completes the loop`() {
        val id = sendSos()
        reply(id, AckKind.EN_ROUTE, "civ")
        val t = SosCoordinator.state.value.tracker!!
        assertEquals(SosStage.ACKNOWLEDGED, t.currentStage)
        assertFalse(t.replies.getValue("civ").verified)
    }

    @Test
    fun `a fabricated certificate is not accepted`() {
        val id = sendSos()
        reply(id, AckKind.EN_ROUTE, "fake", cert = "RVJST1I", signer = pub(impostorKey))
        val t = SosCoordinator.state.value.tracker!!
        assertEquals(SosStage.ACKNOWLEDGED, t.currentStage)
        assertTrue(t.verifiedEnRoute.isEmpty())
    }

    @Test
    fun `a real certificate replayed by a different phone does not verify`() {
        assumeTrue(DemoAuthority.enabled)
        val id = sendSos()
        // The impostor copies a genuine responder's certificate but must sign packets with its own key.
        reply(id, AckKind.EN_ROUTE, "impostor", cert = demoCert(), signer = pub(impostorKey))
        val t = SosCoordinator.state.value.tracker!!
        assertEquals(SosStage.ACKNOWLEDGED, t.currentStage)
        assertTrue(t.verifiedEnRoute.isEmpty())
    }

    @Test
    fun `a verified responder on the way completes the loop with callsign role and hops`() {
        assumeTrue(DemoAuthority.enabled)
        val id = sendSos()
        reply(id, AckKind.EN_ROUTE, "medic", cert = demoCert(ResponderRole.MEDICAL), signer = pub(responderKey),
            packetTtl = 5, initialTtl = 7)
        val t = SosCoordinator.state.value.tracker!!
        assertEquals(SosStage.EN_ROUTE, t.currentStage)
        val r = t.verifiedEnRoute.single()
        assertEquals("NDRF-12", r.callsign)
        assertEquals("Medical Medic", r.roleLabel)
        assertEquals("DEMO AUTHORITY", r.issuerNote)
        assertEquals(2, r.hops)
        assertEquals("ETA 10 min", r.note)
    }

    // ---- automatic receipts for other people's SOS ------------------------------------------

    private fun incoming(cat: SosCategory = SosCategory.FIRE, id: String = "0badc0de", ageMs: Long = 1_000, from: String = "bbbbbbbbbbbbbbbb", ttl: Int = 6) =
        SosCoordinator.onBroadcastText(
            SosProtocol.encodeSos(SosPayload(id, cat, LocationTier.NONE, null)),
            from, System.currentTimeMillis() - ageMs, ttl, null
        )

    private fun waitForSent(n: Int, timeoutMs: Long = 6_000) {
        val end = System.currentTimeMillis() + timeoutMs
        while (bridge.sent.size < n && System.currentTimeMillis() < end) Thread.sleep(25)
    }

    @Test
    fun `a fresh sos is shown and answered once with a bounded unsynced receipt`() {
        assertEquals(SosCoordinator.Intake.SHOW, incoming())
        incoming() // duplicate delivery from another path
        waitForSent(1)
        Thread.sleep(300)
        val r = bridge.sent.single()
        assertEquals(1, r.priority)
        assertFalse("receipts must not consume gossip-sync capacity", r.syncable)
        assertTrue(r.ttl in 4..7)
        val ack = SosProtocol.parseAck(r.text)!!
        assertEquals(AckKind.RECEIVED, ack.kind)
        assertEquals("bbbbbbbbbbbbbbbb", ack.originPeerId)
        assertEquals("0badc0de", ack.sosId)
    }

    private fun postedSosNotifications() =
        org.robolectric.Shadows.shadowOf(context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager)
            .allNotifications

    @Test
    fun `a fresh sos from someone else raises one high priority notification, duplicates and non-sos do not`() {
        incoming(cat = SosCategory.MEDICAL, id = "00000010")
        incoming(cat = SosCategory.MEDICAL, id = "00000010") // same SOS arriving again via another path
        val posted = postedSosNotifications()
        assertEquals(1, posted.size)
        val n = posted.single()
        assertTrue(n.extras.getString(android.app.Notification.EXTRA_TITLE)!!.contains("SOS nearby"))
        assertEquals(android.app.Notification.CATEGORY_ALARM, n.category)
    }

    @Test
    fun `no notification for safe check ins, stale history or our own sos`() {
        incoming(cat = SosCategory.SAFE, id = "00000011")
        incoming(ageMs = 3_600_000, id = "00000012")
        incoming(from = bridge.myPeerId, id = "00000013")
        assertTrue(postedSosNotifications().isEmpty())
    }

    @Test
    fun `old safe and own sos get no receipt`() {
        incoming(ageMs = 3_600_000, id = "00000001")      // replayed history
        incoming(cat = SosCategory.SAFE, id = "00000002") // not a distress call
        incoming(from = bridge.myPeerId, id = "00000003") // our own
        Thread.sleep(3_200)
        assertTrue(bridge.sent.isEmpty())
    }

    // ---- responder side ---------------------------------------------------------------------

    @Test
    fun `a civilian reply carries no certificate`() {
        assertTrue(SosCoordinator.respond("0badc0de", "bbbbbbbbbbbbbbbb", AckKind.ACKNOWLEDGED))
        val ack = SosProtocol.parseAck(bridge.sent.single().text)!!
        assertNull(ack.certificate)
        assertEquals("victim", ack.callsign)
        assertEquals(0, bridge.sent.single().priority)
        assertEquals(AckKind.ACKNOWLEDGED, SosCoordinator.state.value.respondedTo["0badc0de"])
    }

    @Test
    fun `automatic receipts cannot be sent through the responder api`() {
        assertFalse(SosCoordinator.respond("0badc0de", "bbbbbbbbbbbbbbbb", AckKind.RECEIVED))
        assertTrue(bridge.sent.isEmpty())
    }

    @Test
    fun `an installed certificate rides along on replies`() {
        assumeTrue(DemoAuthority.enabled)
        val r = SosCoordinator.issueDemoCertificate(ResponderRole.NDRF, "NDRF-12")
        assertTrue(r.message, r.ok)
        assertEquals("NDRF", SosCoordinator.state.value.responder!!.roleLabel)
        SosCoordinator.respond("0badc0de", "bbbbbbbbbbbbbbbb", AckKind.EN_ROUTE, "ETA 20 min")
        val ack = SosProtocol.parseAck(bridge.sent.single().text)!!
        assertNotNull(ack.certificate)
        assertEquals("NDRF-12", ack.callsign)
        assertEquals("ETA 20 min", ack.note)
    }

    @Test
    fun `a certificate issued for another phone is refused`() {
        assumeTrue(DemoAuthority.enabled)
        val foreign = demoCert(subject = impostorKey)!!
        val r = SosCoordinator.installCertificate(foreign)
        assertFalse(r.ok)
        assertNull(SosCoordinator.state.value.responder)
    }

    @Test
    fun `garbage is refused as a certificate`() {
        assertFalse(SosCoordinator.installCertificate("hello").ok)
    }
}
