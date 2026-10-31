package com.bitchat.android.ai.sos

import org.junit.Assert.*
import org.junit.Test
import java.util.Locale
import kotlin.random.Random

/** JVM tests for the SOS wire format, location tiers and content tables. Run: ./gradlew :resqmesh-ai:testDebugUnitTest */
class SosProtocolTest {

    private fun sos(cat: SosCategory = SosCategory.MEDICAL, tier: LocationTier = LocationTier.COARSE, g: String? = "12.97,77.59") =
        SosPayload(id = "a1b2c3d4", category = cat, tier = tier, latLon = g)

    @Test
    fun `every category and tier round trips through the wire format`() {
        for (cat in SosCategory.values()) for (tier in LocationTier.values()) {
            val loc = if (tier == LocationTier.NONE) null else "12.97160,77.59460"
            val p = sos(cat, tier, loc)
            assertEquals(p, SosProtocol.parseSos(SosProtocol.encodeSos(p)))
        }
    }

    @Test
    fun `sos body is readable english for stock nodes and carries the tag on the last line`() {
        val text = SosProtocol.encodeSos(sos())
        assertTrue(text.startsWith("🆘 SOS — Medical emergency"))
        assertTrue(text.lines().last().startsWith("[[SOS1;id=a1b2c3d4;c=MED;l=C;g=12.97,77.59"))
    }

    @Test
    fun `safe check in is not worded as an SOS`() {
        val text = SosProtocol.encodeSos(sos(SosCategory.SAFE, LocationTier.NONE, null))
        assertFalse(text.contains("🆘"))
        assertFalse(SosCategory.SAFE.isDistress)
    }

    @Test
    fun `tier none never yields coordinates even if the tag carries them`() {
        val parsed = SosProtocol.parseSos("x\n[[SOS1;id=a1b2c3d4;c=FIR;l=N;g=12.5,77.5]]")!!
        assertNull(parsed.latLon)
        assertEquals(LocationTier.NONE, parsed.tier)
    }

    @Test
    fun `a tier without coordinates is reported as no location`() {
        val parsed = SosProtocol.parseSos("[[SOS1;id=a1b2c3d4;c=FIR;l=P]]")!!
        assertEquals(LocationTier.NONE, parsed.tier)
    }

    @Test
    fun `unknown category decodes to general instead of dropping the sos`() {
        assertEquals(SosCategory.GENERAL, SosProtocol.parseSos("[[SOS1;id=a1b2c3d4;c=ZZZ;l=N]]")!!.category)
    }

    @Test
    fun `malformed sos is rejected`() {
        assertNull(SosProtocol.parseSos("hello world"))
        assertNull(SosProtocol.parseSos("[[SOS1;id=XYZ;c=MED;l=N]]"))
        assertNull(SosProtocol.parseSos("[[SOS1;c=MED;l=N]]"))
        assertNull(SosProtocol.parseSos("[[SOS1;id=a1b2c3d4;c=MED;l=C;g=12.5"))
    }

    @Test
    fun `garbage coordinates are ignored`() {
        assertNull(SosProtocol.parseSos("[[SOS1;id=a1b2c3d4;c=MED;l=P;g=999.1,1.1xyz]]")!!.latLon)
    }

    // ---- replies ----------------------------------------------------------------------------

    private fun ack(kind: AckKind = AckKind.EN_ROUTE, cs: String = "NDRF-12", note: String? = "ETA 20 min", cert: String? = "abc_-123") =
        SosAck("a1b2c3d4", "00ff00ff00ff00ff", kind, 7, cs, cert, note)

    @Test
    fun `every ack kind round trips`() {
        for (k in AckKind.values()) {
            val a = ack(kind = k)
            assertEquals(a, SosProtocol.parseAck(SosProtocol.encodeAck(a)))
        }
    }

    @Test
    fun `ack with delimiters and non latin text survives escaping`() {
        val a = ack(cs = "తెలుగు-1", note = "a;b=c [x] 100% నీరు")
        assertEquals(a, SosProtocol.parseAck(SosProtocol.encodeAck(a)))
    }

    @Test
    fun `note cannot inject a second tag`() {
        val a = ack(note = "ok ]] [[SOS1;id=deadbeef;c=MED;l=N]] more")
        val text = SosProtocol.encodeAck(a)
        assertNull("encoded ack must not contain a SOS tag", SosProtocol.parseSos(text))
        assertEquals(1, Regex("""\[\[""").findAll(text).count())
    }

    @Test
    fun `callsign is cleaned and capped`() {
        val a = ack(cs = "A".repeat(40) + "\n")
        assertEquals(SosProtocol.MAX_CALLSIGN_CHARS, SosProtocol.parseAck(SosProtocol.encodeAck(a))!!.callsign.length)
    }

    @Test
    fun `malformed ack is rejected`() {
        assertNull(SosProtocol.parseAck("[[ACK1;id=a1b2c3d4;to=;k=R;t=7;cs=x]]"))
        assertNull(SosProtocol.parseAck("[[ACK1;id=a1b2c3d4;to=00ff;k=Q;t=7;cs=x]]"))
        assertNull(SosProtocol.parseAck("[[ACK1;id=a1b2c3d4;to=00ff;k=R;t=99;cs=x]]"))
        assertNull(SosProtocol.parseAck("[[ACK1;id=a1b2c3d4;to=00ff;k=R;t=abc;cs=x]]"))
    }

    @Test
    fun `sos tag is not mistaken for an ack and vice versa`() {
        assertNull(SosProtocol.parseAck(SosProtocol.encodeSos(sos())))
        assertNull(SosProtocol.parseSos(SosProtocol.encodeAck(ack())))
        assertTrue(SosProtocol.looksLikeSosTraffic(SosProtocol.encodeAck(ack())))
        assertFalse(SosProtocol.looksLikeSosTraffic("just a chat message"))
    }

    @Test
    fun `humanReadable drops the machine tag but keeps the message and location`() {
        val text = SosProtocol.encodeSos(sos())
        val shown = SosProtocol.humanReadable(text)
        assertFalse(shown.contains("[["))
        assertTrue(shown.startsWith("🆘 SOS — Medical emergency"))
        assertTrue(shown.contains("📍 12.97,77.59"))
        assertEquals("just chatting", SosProtocol.humanReadable("just chatting"))
    }

    @Test
    fun `ids are eight lowercase hex characters`() {
        repeat(20) { assertTrue(Regex("^[0-9a-f]{8}$").matches(SosProtocol.newSosId(Random(it)))) }
    }

    @Test
    fun `freshness window rejects replayed history but tolerates small clock skew`() {
        val now = 1_000_000_000L
        assertTrue(SosProtocol.isFresh(now - 1_000, now))
        assertTrue(SosProtocol.isFresh(now + 30_000, now))
        assertFalse(SosProtocol.isFresh(now - SosProtocol.FRESH_WINDOW_MS - 1, now))
        assertFalse(SosProtocol.isFresh(now + 10 * 60_000, now))
    }

    // ---- location tiers ---------------------------------------------------------------------

    @Test
    fun `coarse location is rounded to two decimals and never leaks the precise fix`() {
        val s = SosLocation.format(LocationTier.COARSE, 12.971599, 77.594566)!!
        assertEquals("12.97,77.59", s)
    }

    @Test
    fun `precise location keeps five decimals`() {
        assertEquals("12.97160,77.59457", SosLocation.format(LocationTier.PRECISE, 12.971599, 77.594566))
    }

    @Test
    fun `no gps tier and missing or invalid fixes share nothing`() {
        assertNull(SosLocation.format(LocationTier.NONE, 12.9, 77.5))
        assertNull(SosLocation.format(LocationTier.PRECISE, null, 77.5))
        assertNull(SosLocation.format(LocationTier.PRECISE, 91.0, 77.5))
        assertNull(SosLocation.format(LocationTier.COARSE, Double.NaN, 77.5))
    }

    @Test
    fun `location formatting ignores the device locale`() {
        val saved = Locale.getDefault()
        try {
            Locale.setDefault(Locale.GERMANY)
            assertEquals("12.97,77.59", SosLocation.format(LocationTier.COARSE, 12.971, 77.594))
        } finally {
            Locale.setDefault(saved)
        }
    }

    // ---- content tables ---------------------------------------------------------------------

    @Test
    fun `picker has the six situations and every language is filled in`() {
        assertEquals(6, SosCategory.picker.size)
        for (c in SosCategory.values()) for (l in SosLanguage.values()) {
            assertTrue("${c.name}/${l.code} title", c.title(l).isNotBlank())
            assertTrue("${c.name}/${l.code} detail", c.detail(l).isNotBlank())
        }
        assertNotEquals(SosCategory.MEDICAL.title(SosLanguage.EN), SosCategory.MEDICAL.title(SosLanguage.HI))
    }

    @Test
    fun `every ui string exists in all four languages with matching placeholders`() {
        for (s in SosText.values()) {
            val en = s.text(SosLanguage.EN)
            val placeholders = Regex("%d").findAll(en).count()
            for (l in SosLanguage.values()) {
                val v = s.text(l)
                assertTrue("${s.name}/${l.code} blank", v.isNotBlank())
                assertEquals("${s.name}/${l.code} placeholders", placeholders, Regex("%d").findAll(v).count())
            }
        }
        assertEquals("Reached 3 nodes", SosText.STAGE_REACHED.format(SosLanguage.EN, 3))
    }

    @Test
    fun `language lookup falls back to english`() {
        assertEquals(SosLanguage.EN, SosLanguage.fromCode(null))
        assertEquals(SosLanguage.TE, SosLanguage.fromCode("te"))
    }
}
