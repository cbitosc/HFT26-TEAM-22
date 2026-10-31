package com.bitchat.android.ai.sos

/** The four stages of the closed-loop SOS pipeline, in order. */
enum class SosStage { BROADCASTED, REACHED, ACKNOWLEDGED, EN_ROUTE }

/** Why the location on an outgoing SOS is what it is — shown to the sender so nothing is implied. */
enum class LocationOutcome {
    /** The sender chose not to share a location. */
    NOT_SHARED,

    /** Coordinates (rounded for the chosen tier) went out with the SOS. */
    SHARED,

    /** A tier was chosen but the phone had no GPS fix, so the SOS went out without coordinates. */
    NO_FIX
}

/** What one other device has told us about our SOS. */
data class ResponderReply(
    val peerId: String,
    val kind: AckKind,
    val callsign: String,
    /** True only when a valid, unexpired certificate is bound to the key that signed the packet. */
    val verified: Boolean,
    /** "NDRF" / "Civil Defense" / "Medical Medic" when [verified], otherwise null. */
    val roleLabel: String?,
    /** Set when the certificate came from a development authority, so it can be labelled DEMO. */
    val issuerNote: String?,
    /** Relays between the replier and us (0 = heard directly). */
    val hops: Int,
    val note: String?,
    val receivedAtMs: Long
)

/**
 * State of the sender's own SOS. Immutable; every update returns a new value so it can sit in a
 * StateFlow. Nothing here is estimated: counts come only from replies actually received.
 */
data class SosTrackerState(
    val sosId: String,
    val category: SosCategory,
    val tier: LocationTier,
    val latLon: String?,
    val locationOutcome: LocationOutcome,
    val createdAtMs: Long,
    /** Devices directly connected when the SOS was handed to the radio. 0 = nobody in range yet. */
    val handedToPeers: Int,
    val replies: Map<String, ResponderReply> = emptyMap()
) {
    /** Distinct other devices known to have received the SOS (any reply proves receipt). */
    val reachedCount: Int get() = replies.size

    val acknowledgers: List<ResponderReply>
        get() = replies.values.filter { it.kind >= AckKind.ACKNOWLEDGED }
            .sortedWith(compareByDescending<ResponderReply> { it.verified }.thenByDescending { it.kind }.thenBy { it.hops })

    val verifiedEnRoute: List<ResponderReply>
        get() = replies.values.filter { it.kind == AckKind.EN_ROUTE && it.verified }.sortedBy { it.hops }

    fun isReached(stage: SosStage): Boolean = when (stage) {
        SosStage.BROADCASTED -> true
        SosStage.REACHED -> replies.isNotEmpty()
        SosStage.ACKNOWLEDGED -> replies.values.any { it.kind >= AckKind.ACKNOWLEDGED }
        // An unverified civilian saying "on my way" must not close the loop (forged-hope protection).
        SosStage.EN_ROUTE -> verifiedEnRoute.isNotEmpty()
    }

    val currentStage: SosStage
        get() = SosStage.values().last { isReached(it) }

    /** Folds in a reply, keeping the strongest kind seen per device. */
    fun withReply(reply: ResponderReply): SosTrackerState {
        val existing = replies[reply.peerId]
        if (existing != null && existing.kind > reply.kind) return this
        return copy(replies = replies + (reply.peerId to reply))
    }
}
