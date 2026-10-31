package com.bitchat.android.ai.sos

import kotlin.random.Random

/** Kind of reply a device can send for somebody else's SOS. Ordered weakest to strongest. */
enum class AckKind(val code: String) {
    /** Automatic: "my phone received your SOS". Counts toward "Reached N nodes". */
    RECEIVED("R"),

    /** A person acknowledged it ("someone is looking at your SOS"). */
    ACKNOWLEDGED("A"),

    /** A person committed to going. Only a certificate-verified sender completes the last stage. */
    EN_ROUTE("E");

    companion object {
        fun fromCode(code: String?): AckKind? = values().firstOrNull { it.code == code }
    }
}

/** The structured part of an SOS broadcast. */
data class SosPayload(
    val id: String,
    val category: SosCategory,
    val tier: LocationTier,
    /** "lat,lon" already rounded for [tier]; null when no location is shared. */
    val latLon: String?
)

/**
 * A reply to an SOS.
 *
 * @property originPeerId peer id of the device that sent the SOS (so unrelated devices ignore it)
 * @property initialTtl TTL the replier put on its packet, letting the receiver compute hop count
 *   as `initialTtl - packet.ttl` without trusting anything the relays can change
 * @property certificate base64url responder certificate, or null for a civilian
 */
data class SosAck(
    val sosId: String,
    val originPeerId: String,
    val kind: AckKind,
    val initialTtl: Int,
    val callsign: String,
    val certificate: String?,
    val note: String?
)

/**
 * Text wire format for SOS traffic.
 *
 * SOS and replies travel as ordinary signed BitChat MESSAGE broadcasts, so relaying, signature
 * checking, deduplication and gossip sync of the existing mesh all apply unchanged and the binary
 * packet format is untouched. A message is a short human-readable body (readable on a stock
 * BitChat node) followed by one machine-readable tag line:
 *
 *     [[SOS1;id=a1b2c3d4;c=MED;l=C;g=12.97,77.59]]
 *     [[ACK1;id=a1b2c3d4;to=<peerId>;k=E;t=7;cs=NDRF-12;n=ETA%2020%20min;cert=<base64url>]]
 *
 * Values are percent-escaped so `;`, `=`, `[`, `]` and non-ASCII text cannot break the tag.
 */
object SosProtocol {
    private const val SOS_TAG = "SOS1"
    private const val ACK_TAG = "ACK1"
    const val MAX_CALLSIGN_CHARS = 16
    const val MAX_NOTE_CHARS = 80

    private val TAG_REGEX = Regex("""\[\[(SOS1|ACK1);([^\[\]]*)\]\]""")
    private val ID_REGEX = Regex("^[0-9a-f]{8}$")
    private val PEER_REGEX = Regex("^[0-9a-fA-F]{1,32}$")
    private val LATLON_REGEX = Regex("^-?\\d{1,3}\\.\\d{1,6},-?\\d{1,3}\\.\\d{1,6}$")

    fun newSosId(random: Random = Random.Default): String =
        random.nextBytes(4).joinToString("") { "%02x".format(it) }

    // ---- SOS ---------------------------------------------------------------------------------

    fun encodeSos(p: SosPayload): String {
        val body = if (p.category.isDistress) {
            "🆘 SOS — ${p.category.englishTitle}: ${p.category.englishDetail}"
        } else {
            "${p.category.emoji} ${p.category.englishTitle} — ${p.category.englishDetail}"
        }
        val fields = buildList {
            add("id=${p.id}")
            add("c=${p.category.code}")
            add("l=${p.tier.code}")
            if (p.latLon != null) add("g=${p.latLon}")
        }
        val location = if (p.latLon != null) "\n📍 ${p.latLon}" else ""
        return "$body$location\n[[$SOS_TAG;${fields.joinToString(";")}]]"
    }

    fun parseSos(text: String): SosPayload? {
        val fields = lastTag(text, SOS_TAG) ?: return null
        val id = fields["id"]?.takeIf { ID_REGEX.matches(it) } ?: return null
        val latLon = fields["g"]?.takeIf { LATLON_REGEX.matches(it) }
        val tier = LocationTier.fromCode(fields["l"])
        return SosPayload(
            id = id,
            category = SosCategory.fromCode(fields["c"]),
            // Never claim a tier that carries no coordinates, or a location the tier forbids.
            tier = if (latLon == null) LocationTier.NONE else tier,
            latLon = if (tier == LocationTier.NONE) null else latLon
        )
    }

    // ---- Replies -----------------------------------------------------------------------------

    fun encodeAck(a: SosAck): String {
        val callsign = clean(a.callsign, MAX_CALLSIGN_CHARS)
        val body = when (a.kind) {
            AckKind.RECEIVED -> "✓ SOS received"
            AckKind.ACKNOWLEDGED -> "✓ SOS acknowledged by $callsign"
            AckKind.EN_ROUTE -> "🚑 $callsign is on the way"
        }
        val fields = buildList {
            add("id=${a.sosId}")
            add("to=${a.originPeerId}")
            add("k=${a.kind.code}")
            add("t=${a.initialTtl}")
            add("cs=${escape(callsign)}")
            a.note?.let { clean(it, MAX_NOTE_CHARS) }?.takeIf { it.isNotEmpty() }?.let { add("n=${escape(it)}") }
            a.certificate?.takeIf { it.isNotEmpty() }?.let { add("cert=$it") }
        }
        return "$body\n[[$ACK_TAG;${fields.joinToString(";")}]]"
    }

    fun parseAck(text: String): SosAck? {
        val fields = lastTag(text, ACK_TAG) ?: return null
        val id = fields["id"]?.takeIf { ID_REGEX.matches(it) } ?: return null
        val to = fields["to"]?.takeIf { PEER_REGEX.matches(it) } ?: return null
        val kind = AckKind.fromCode(fields["k"]) ?: return null
        val ttl = fields["t"]?.toIntOrNull()?.takeIf { it in 0..32 } ?: return null
        return SosAck(
            sosId = id,
            originPeerId = to,
            kind = kind,
            initialTtl = ttl,
            callsign = clean(unescape(fields["cs"].orEmpty()), MAX_CALLSIGN_CHARS),
            certificate = fields["cert"]?.takeIf { it.isNotEmpty() && it.length <= 512 },
            note = fields["n"]?.let { clean(unescape(it), MAX_NOTE_CHARS) }?.takeIf { it.isNotEmpty() }
        )
    }

    /**
     * The human-readable part of an SOS/reply message: the text with its machine tag removed. Use this wherever
     * a message is shown or exported outside the SOS UI (alert feed, ICS-213 report) so raw `[[SOS1;…]]` never leaks.
     */
    fun humanReadable(text: String): String = TAG_REGEX.replace(text, "").trim()

    /** True when [text] carries any SOS tag; lets the receive path decide cheaply what to parse. */
    fun looksLikeSosTraffic(text: String): Boolean = text.contains("[[SOS1;") || text.contains("[[ACK1;")

    /** An SOS older than this is history (e.g. replayed by gossip sync) and must not trigger replies. */
    const val FRESH_WINDOW_MS: Long = 10 * 60 * 1000L

    fun isFresh(packetTimestampMs: Long, nowMs: Long): Boolean =
        nowMs - packetTimestampMs in -60_000L..FRESH_WINDOW_MS

    // ---- helpers -----------------------------------------------------------------------------

    private fun lastTag(text: String, tag: String): Map<String, String>? {
        val match = TAG_REGEX.findAll(text).lastOrNull { it.groupValues[1] == tag } ?: return null
        val out = HashMap<String, String>()
        for (part in match.groupValues[2].split(';')) {
            val eq = part.indexOf('=')
            if (eq <= 0) continue
            out.putIfAbsent(part.substring(0, eq), part.substring(eq + 1))
        }
        return out
    }

    /** Strips control characters and tag delimiters, collapses whitespace, caps the length. */
    private fun clean(s: String, max: Int): String =
        s.filter { !it.isISOControl() }.replace("[[", "").replace("]]", "").trim().take(max)

    internal fun escape(s: String): String {
        val sb = StringBuilder()
        for (b in s.toByteArray(Charsets.UTF_8)) {
            val c = b.toInt() and 0xFF
            val plain = c in 0x20..0x7E && c.toChar() !in "%;=[]"
            if (plain) sb.append(c.toChar()) else sb.append('%').append("%02X".format(c))
        }
        return sb.toString()
    }

    internal fun unescape(s: String): String {
        val out = java.io.ByteArrayOutputStream()
        var i = 0
        while (i < s.length) {
            val ch = s[i]
            if (ch == '%' && i + 2 < s.length) {
                val v = s.substring(i + 1, i + 3).toIntOrNull(16)
                if (v != null) { out.write(v); i += 3; continue }
            }
            out.write(ch.toString().toByteArray(Charsets.UTF_8))
            i++
        }
        return out.toString(Charsets.UTF_8.name())
    }
}
