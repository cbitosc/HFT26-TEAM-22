package com.bitchat.android.ai.sos

import org.junit.Assert.*
import org.junit.Test

/** Tests the four-stage closed-loop pipeline, including the forged "help is coming" cases. */
class SosTrackerTest {

    private fun start(peers: Int = 2) = SosTrackerState(
        sosId = "a1b2c3d4", category = SosCategory.MEDICAL, tier = LocationTier.COARSE, latLon = "12.97,77.59",
        locationOutcome = LocationOutcome.SHARED, createdAtMs = 0L, handedToPeers = peers
    )

    private fun reply(peer: String, kind: AckKind, verified: Boolean = false, hops: Int = 0) = ResponderReply(
        peerId = peer, kind = kind, callsign = "cs-$peer", verified = verified,
        roleLabel = if (verified) "NDRF" else null, issuerNote = null, hops = hops, note = null, receivedAtMs = 1L
    )

    @Test
    fun `a fresh sos is only broadcasted`() {
        val s = start()
        assertEquals(SosStage.BROADCASTED, s.currentStage)
        assertTrue(s.isReached(SosStage.BROADCASTED))
        assertFalse(s.isReached(SosStage.REACHED))
        assertEquals(0, s.reachedCount)
    }

    @Test
    fun `an automatic receipt moves to reached and counts distinct devices`() {
        val s = start().withReply(reply("p1", AckKind.RECEIVED)).withReply(reply("p2", AckKind.RECEIVED)).withReply(reply("p1", AckKind.RECEIVED))
        assertEquals(SosStage.REACHED, s.currentStage)
        assertEquals(2, s.reachedCount)
    }

    @Test
    fun `a human acknowledgement from anyone reaches the acknowledged stage`() {
        val s = start().withReply(reply("p1", AckKind.ACKNOWLEDGED))
        assertEquals(SosStage.ACKNOWLEDGED, s.currentStage)
        assertFalse(s.isReached(SosStage.EN_ROUTE))
    }

    @Test
    fun `an unverified on my way never closes the loop`() {
        val s = start().withReply(reply("civilian", AckKind.EN_ROUTE, verified = false))
        assertEquals(SosStage.ACKNOWLEDGED, s.currentStage)
        assertTrue(s.verifiedEnRoute.isEmpty())
    }

    @Test
    fun `a verified responder on the way completes the pipeline`() {
        val s = start().withReply(reply("medic", AckKind.EN_ROUTE, verified = true, hops = 2))
        assertEquals(SosStage.EN_ROUTE, s.currentStage)
        assertEquals(2, s.verifiedEnRoute.single().hops)
    }

    @Test
    fun `a weaker later reply never downgrades a device`() {
        val s = start().withReply(reply("p1", AckKind.EN_ROUTE, verified = true)).withReply(reply("p1", AckKind.RECEIVED))
        assertEquals(AckKind.EN_ROUTE, s.replies.getValue("p1").kind)
        assertEquals(SosStage.EN_ROUTE, s.currentStage)
    }

    @Test
    fun `verified responders are listed before civilians`() {
        val s = start()
            .withReply(reply("civ", AckKind.EN_ROUTE, verified = false, hops = 0))
            .withReply(reply("medic", AckKind.ACKNOWLEDGED, verified = true, hops = 3))
        assertEquals("medic", s.acknowledgers.first().peerId)
    }
}
