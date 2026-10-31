package com.bitchat.android.ai.sos

/**
 * Pre-configured emergency situations, picked from a grid with zero typing.
 *
 * The wire carries only [code]; each receiving device renders the label in its own selected
 * language. [englishTitle]/[englishDetail] are also written into the human-readable body of the
 * broadcast so stock BitChat nodes (which do not understand the tag) still show something useful.
 *
 * Translations here were drafted without a native-speaker review — see docs/SOS_RESCUE_FEATURES.md.
 */
enum class SosCategory(
    val code: String,
    val emoji: String,
    /** True for situations that need help. [SAFE] is a shelter check-in and is not an SOS. */
    val isDistress: Boolean,
    private val titles: Map<SosLanguage, String>,
    private val details: Map<SosLanguage, String>
) {
    MEDICAL(
        "MED", "🩹", true,
        titles = mapOf(
            SosLanguage.EN to "Medical emergency",
            SosLanguage.HI to "चिकित्सा आपातकाल",
            SosLanguage.TE to "వైద్య అత్యవసరం",
            SosLanguage.TA to "மருத்துவ அவசரம்"
        ),
        details = mapOf(
            SosLanguage.EN to "Critical injury, bleeding",
            SosLanguage.HI to "गंभीर चोट, खून बह रहा है",
            SosLanguage.TE to "తీవ్ర గాయం, రక్తస్రావం",
            SosLanguage.TA to "கடுமையான காயம், இரத்தப்போக்கு"
        )
    ),
    TRAPPED(
        "TRP", "🏚️", true,
        titles = mapOf(
            SosLanguage.EN to "Trapped / collapse",
            SosLanguage.HI to "फँसे हैं / इमारत गिरी",
            SosLanguage.TE to "చిక్కుకున్నాం / కూలిపోయింది",
            SosLanguage.TA to "சிக்கிக்கொண்டோம் / இடிந்தது"
        ),
        details = mapOf(
            SosLanguage.EN to "Trapped under debris or rubble",
            SosLanguage.HI to "मलबे के नीचे फँसे हैं",
            SosLanguage.TE to "శిథిలాల కింద చిక్కుకున్నాం",
            SosLanguage.TA to "இடிபாடுகளுக்குள் சிக்கியுள்ளோம்"
        )
    ),
    FLOOD(
        "FLD", "🌊", true,
        titles = mapOf(
            SosLanguage.EN to "Rising flood",
            SosLanguage.HI to "बाढ़ बढ़ रही है",
            SosLanguage.TE to "వరద పెరుగుతోంది",
            SosLanguage.TA to "வெள்ளம் உயர்கிறது"
        ),
        details = mapOf(
            SosLanguage.EN to "Water rising, on a rooftop, need a boat",
            SosLanguage.HI to "पानी बढ़ रहा है, छत पर हैं, नाव चाहिए",
            SosLanguage.TE to "నీరు పెరుగుతోంది, పైకప్పుపై ఉన్నాం, పడవ కావాలి",
            SosLanguage.TA to "தண்ணீர் உயர்கிறது, கூரையில் இருக்கிறோம், படகு தேவை"
        )
    ),
    FIRE(
        "FIR", "🔥", true,
        titles = mapOf(
            SosLanguage.EN to "Fire / smoke",
            SosLanguage.HI to "आग / धुआँ",
            SosLanguage.TE to "మంటలు / పొగ",
            SosLanguage.TA to "தீ / புகை"
        ),
        details = mapOf(
            SosLanguage.EN to "Exit blocked by flames or smoke",
            SosLanguage.HI to "आग या धुएँ से निकास बंद है",
            SosLanguage.TE to "మంటలు లేదా పొగతో దారి మూసుకుపోయింది",
            SosLanguage.TA to "தீ அல்லது புகையால் வழி அடைபட்டுள்ளது"
        )
    ),
    SUPPLIES(
        "SUP", "💧", true,
        titles = mapOf(
            SosLanguage.EN to "Need supplies",
            SosLanguage.HI to "सामग्री चाहिए",
            SosLanguage.TE to "సరఫరాలు కావాలి",
            SosLanguage.TA to "பொருட்கள் தேவை"
        ),
        details = mapOf(
            SosLanguage.EN to "Drinking water, infant formula, insulin or essential medicine",
            SosLanguage.HI to "पीने का पानी, शिशु का दूध, इंसुलिन या ज़रूरी दवा",
            SosLanguage.TE to "తాగునీరు, శిశు ఆహారం, ఇన్సులిన్ లేదా అవసరమైన మందులు",
            SosLanguage.TA to "குடிநீர், குழந்தை உணவு, இன்சுலின் அல்லது அத்தியாவசிய மருந்து"
        )
    ),
    SAFE(
        "SAF", "✅", false,
        titles = mapOf(
            SosLanguage.EN to "I'm safe",
            SosLanguage.HI to "मैं सुरक्षित हूँ",
            SosLanguage.TE to "నేను సురక్షితంగా ఉన్నాను",
            SosLanguage.TA to "நான் பாதுகாப்பாக இருக்கிறேன்"
        ),
        details = mapOf(
            SosLanguage.EN to "Checking in at a relief shelter",
            SosLanguage.HI to "राहत शिविर में पहुँच गया हूँ",
            SosLanguage.TE to "సహాయ శిబిరంలో చేరాను",
            SosLanguage.TA to "நிவாரண முகாமில் இருக்கிறேன்"
        )
    ),

    /** Fallback used when the hold-to-send button is released into a send with nothing picked. */
    GENERAL(
        "GEN", "🆘", true,
        titles = mapOf(
            SosLanguage.EN to "Emergency — need help",
            SosLanguage.HI to "आपातकाल — मदद चाहिए",
            SosLanguage.TE to "అత్యవసరం — సహాయం కావాలి",
            SosLanguage.TA to "அவசரம் — உதவி தேவை"
        ),
        details = mapOf(
            SosLanguage.EN to "Please send help",
            SosLanguage.HI to "कृपया मदद भेजें",
            SosLanguage.TE to "దయచేసి సహాయం పంపండి",
            SosLanguage.TA to "தயவுசெய்து உதவி அனுப்புங்கள்"
        )
    );

    fun title(lang: SosLanguage): String = titles[lang] ?: titles.getValue(SosLanguage.EN)
    fun detail(lang: SosLanguage): String = details[lang] ?: details.getValue(SosLanguage.EN)

    val englishTitle: String get() = title(SosLanguage.EN)
    val englishDetail: String get() = detail(SosLanguage.EN)

    companion object {
        /** The six situations shown in the picker grid, in display order. */
        val picker: List<SosCategory> = listOf(MEDICAL, TRAPPED, FLOOD, FIRE, SUPPLIES, SAFE)

        /** Unknown codes decode to [GENERAL] so a newer app version never makes an SOS vanish. */
        fun fromCode(code: String?): SosCategory = values().firstOrNull { it.code == code } ?: GENERAL
    }
}
