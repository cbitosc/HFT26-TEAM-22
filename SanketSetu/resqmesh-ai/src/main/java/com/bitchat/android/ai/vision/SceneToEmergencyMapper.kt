package com.bitchat.android.ai.vision

/**
 * Maps ML Kit image label strings to the emergency category system used throughout the app.
 *
 * Pure Kotlin — zero Android or ML Kit dependencies.
 * Mirrors the category set in [com.bitchat.android.ai.classifier.KeywordMessageClassifier]
 * and [com.bitchat.android.ai.emergency.EmergencyClassification.categoryEmojiAndLabel].
 *
 * Categories supported: MEDICAL, FIRE, FLOOD, COLLAPSE, SECURITY,
 *                       WEATHER, INFRASTRUCTURE, RESOURCE_REQUEST, MISSING_PERSON
 */

/**
 * Result of analyzing an image scene.
 *
 * @param description Human-readable text ready to insert into the message TextField.
 *                    Empty when ML Kit returned no labels at all (hard failure).
 * @param emergencyType One of the 9 app category strings ("FIRE", "FLOOD", …) or ""
 *                      when labels were returned but none matched a known category.
 * @param confidence    Confidence of the top matching label in [0.0, 1.0].
 */
data class SceneAnalysisResult(
    val description: String,
    val emergencyType: String,
    val confidence: Float
)

object SceneToEmergencyMapper {

    /**
     * Maps a list of (labelText, confidence) pairs from ML Kit to a [SceneAnalysisResult].
     *
     * Decision logic:
     *  1. Iterate labels in descending confidence order.
     *  2. First label whose text contains a keyword from [LABEL_TO_CATEGORY] wins.
     *  3. If no label matches → generic scene description with empty emergencyType.
     *  4. If labels list is empty → empty result (signals ML Kit hard failure to caller).
     *
     * @param labels Pairs of (ML Kit label text, confidence), sorted descending by confidence.
     */
    /** Below this a label is a guess, and a wrong emergency tag on a photo is worse than none. */
    const val MIN_EMERGENCY_CONFIDENCE = 0.6f
    /** Below this a label is not even worth showing as a description. */
    const val MIN_DESCRIBE_CONFIDENCE = 0.7f

    /** Caption for a photo the models could not place with confidence. The sender is asked to describe it. */
    const val UNCLEAR_DESCRIPTION = "[📷] Photo attached. Add a short note so people know what it shows."

    fun mapLabels(labels: List<Pair<String, Float>>): SceneAnalysisResult {
        if (labels.isEmpty()) return SceneAnalysisResult("", "", 0f)

        for ((label, confidence) in labels) {
            if (confidence < MIN_EMERGENCY_CONFIDENCE) continue
            val emergencyType = LABEL_TO_CATEGORY.entries
                .firstOrNull { (keyword, _) -> containsWords(label, keyword) }
                ?.value

            if (emergencyType != null) {
                val emoji = CATEGORY_EMOJI[emergencyType] ?: "⚠️"
                val suffix = CATEGORY_SUFFIX[emergencyType] ?: "Requires attention."
                val topLabels = labels.take(3)
                    .joinToString(", ") { it.first.lowercase() }
                    .replaceFirstChar { it.uppercase() }
                val description = "[📷] $emoji $emergencyType: $topLabels. $suffix"
                return SceneAnalysisResult(description, emergencyType, confidence)
            }
        }

        // Nothing matched an emergency category. Describe the photo only with labels we are fairly sure of;
        // otherwise say so honestly instead of captioning it with something unrelated.
        val sure = labels.filter { it.second >= MIN_DESCRIBE_CONFIDENCE }.take(4)
        if (sure.isEmpty()) return SceneAnalysisResult(UNCLEAR_DESCRIPTION, "", labels.first().second)
        val topLabels = sure.joinToString(", ") { it.first.lowercase() }.replaceFirstChar { it.uppercase() }
        return SceneAnalysisResult("[📷]: $topLabels.", "", sure.first().second)
    }

    /** Whole-word containment, so "EMBER" never matches "member" and "FIRE" never matches "fireplace". */
    internal fun containsWords(label: String, keyword: String): Boolean {
        val l = " " + label.uppercase().replace(Regex("[^A-Z0-9]+"), " ").trim() + " "
        val k = " " + keyword.uppercase().replace(Regex("[^A-Z0-9]+"), " ").trim() + " "
        return l.contains(k)
    }

    // ── Label keyword → emergency category ────────────────────────────────────
    //
    // Keys are matched against the UPPERCASED ML Kit label text via `contains`.
    // Order matters: more specific / higher-priority categories come first so
    // a label like "Fire department" maps to FIRE before any weaker match.
    //
    // ML Kit Image Labeling returns English Title Case strings, e.g.
    // "Smoke", "Flood", "Ambulance", "Police car". Uppercasing both sides
    // makes matching reliable without regex.
    private val LABEL_TO_CATEGORY: LinkedHashMap<String, String> = linkedMapOf(

        // ── MEDICAL (life threat) ──────────────────────────────────────────
        "AMBULANCE"          to "MEDICAL",
        "EMERGENCY MEDICAL"  to "MEDICAL",
        "FIRST AID"          to "MEDICAL",
        "STRETCHER"          to "MEDICAL",
        "GURNEY"             to "MEDICAL",
        "PARAMEDIC"          to "MEDICAL",
        "HOSPITAL"           to "MEDICAL",
        "PATIENT"            to "MEDICAL",
        "INJURY"             to "MEDICAL",
        "INJURED"            to "MEDICAL",
        "BLOOD"              to "MEDICAL",
        "WOUND"              to "MEDICAL",

        // ── FIRE ───────────────────────────────────────────────────────────
        "WILDFIRE"           to "FIRE",
        "FIREFIGHTER"        to "FIRE",
        "FIRE TRUCK"         to "FIRE",
        "FIRE DEPARTMENT"    to "FIRE",
        "CONFLAGRATION"      to "FIRE",
        "BLAZE"              to "FIRE",
        "EMBER"              to "FIRE",
        "FLAME"              to "FIRE",
        "FIRE"               to "FIRE",   // broad — placed after specific phrases
        "SMOKE"              to "FIRE",
        "BURNING"            to "FIRE",

        // ── FLOOD ──────────────────────────────────────────────────────────
        "FLOODWATER"         to "FLOOD",
        "FLOOD"              to "FLOOD",
        "INUNDATION"         to "FLOOD",
        "HIGH WATER"         to "FLOOD",
        "SUBMERGED"          to "FLOOD",
        "OVERFLOW"           to "FLOOD",
        "FLASH FLOOD"        to "FLOOD",

        // ── COLLAPSE / structural ──────────────────────────────────────────
        "EARTHQUAKE"         to "COLLAPSE",
        "RUBBLE"             to "COLLAPSE",
        "DEBRIS"             to "COLLAPSE",
        "WRECKAGE"           to "COLLAPSE",
        "COLLAPSED"          to "COLLAPSE",
        "DEMOLITION"         to "COLLAPSE",
        "RUIN"               to "COLLAPSE",

        // ── SECURITY ───────────────────────────────────────────────────────
        "POLICE CAR"         to "SECURITY",
        "POLICE"             to "SECURITY",
        "WEAPON"             to "SECURITY",
        "GUN"                to "SECURITY",
        "EXPLOSIVE"          to "SECURITY",
        "RIOT"               to "SECURITY",

        // ── WEATHER ────────────────────────────────────────────────────────
        "TORNADO"            to "WEATHER",
        "HURRICANE"          to "WEATHER",
        "CYCLONE"            to "WEATHER",
        "TYPHOON"            to "WEATHER",
        "BLIZZARD"           to "WEATHER",
        "HAILSTORM"          to "WEATHER",
        "LIGHTNING"          to "WEATHER",
        "STORM"              to "WEATHER",
        "HAIL"               to "WEATHER",

        // ── INFRASTRUCTURE ─────────────────────────────────────────────────
        "POWER LINE"         to "INFRASTRUCTURE",
        "POWER OUTAGE"       to "INFRASTRUCTURE",
        "PIPELINE"           to "INFRASTRUCTURE",
        "GAS LEAK"           to "INFRASTRUCTURE",
        "ROAD DAMAGE"        to "INFRASTRUCTURE",
        "BRIDGE DAMAGE"      to "INFRASTRUCTURE",

        // ── RESOURCE_REQUEST ───────────────────────────────────────────────
        "REFUGEE"            to "RESOURCE_REQUEST",
        "TENT CAMP"          to "RESOURCE_REQUEST",
        "FOOD DISTRIBUTION"  to "RESOURCE_REQUEST",
        "RELIEF CAMP"        to "RESOURCE_REQUEST",

        // ── MISSING_PERSON ─────────────────────────────────────────────────
        "SEARCH AND RESCUE"  to "MISSING_PERSON",
        "RESCUE TEAM"        to "MISSING_PERSON"
    )

    // ── Display emoji per category (mirrors categoryEmojiAndLabel in EmergencyClassification) ──
    private val CATEGORY_EMOJI = mapOf(
        "MEDICAL"          to "🏥",
        "FIRE"             to "🔥",
        "FLOOD"            to "🌊",
        "COLLAPSE"         to "🏚",
        "SECURITY"         to "🚨",
        "WEATHER"          to "⛈",
        "INFRASTRUCTURE"   to "🔧",
        "RESOURCE_REQUEST" to "📦",
        "MISSING_PERSON"   to "🔍"
    )

    // ── Appended sentence per category ────────────────────────────────────────
    private val CATEGORY_SUFFIX = mapOf(
        "MEDICAL"          to "Medical assistance required.",
        "FIRE"             to "Requires immediate response.",
        "FLOOD"            to "Rising water detected.",
        "COLLAPSE"         to "Structural damage visible.",
        "SECURITY"         to "Possible security threat.",
        "WEATHER"          to "Severe weather conditions.",
        "INFRASTRUCTURE"   to "Infrastructure damage observed.",
        "RESOURCE_REQUEST" to "Resource assistance needed.",
        "MISSING_PERSON"   to "Search and rescue may be required."
    )
}
