package com.bitchat.android.ai.sos

import java.util.Locale

/**
 * User-visible strings of the SOS flow in the four supported languages. Kept in code (not Android
 * resources) so the in-app language switch applies instantly, without recreating the activity.
 *
 * Hindi, Telugu and Tamil were drafted without a native-speaker review — see
 * docs/SOS_RESCUE_FEATURES.md. Strings containing `%d` are formatted with [SosText.format].
 */
enum class SosText(private val by: Map<SosLanguage, String>) {
    TITLE(t("Emergency SOS", "आपातकालीन SOS", "అత్యవసర SOS", "அவசர SOS")),
    HOLD_TO_SEND(t("Hold for 3 seconds to send SOS", "SOS भेजने के लिए 3 सेकंड दबाए रखें", "SOS పంపడానికి 3 సెకన్లు నొక్కి ఉంచండి", "SOS அனுப்ப 3 விநாடிகள் அழுத்திப் பிடிக்கவும்")),
    WORKS_OFFLINE(t("Works with no internet", "बिना इंटरनेट के काम करता है", "ఇంటర్నెట్ లేకుండా పనిచేస్తుంది", "இணையம் இல்லாமல் செயல்படும்")),
    NEARBY_COUNT(t("%d nearby", "%d पास में", "%d సమీపంలో", "அருகில் %d")),
    NOBODY_NEARBY(t("No one nearby yet", "अभी कोई पास नहीं", "ఇంకా ఎవరూ సమీపంలో లేరు", "இன்னும் யாரும் அருகில் இல்லை")),
    SOS_NEARBY(t("SOS nearby", "पास में SOS", "సమీపంలో SOS", "அருகில் SOS")),
    HOLD_BUTTON(t("HOLD 3 s", "3 सेकंड दबाएँ", "3 సెకన్లు నొక్కండి", "3 விநாடி அழுத்தவும்")),
    KEEP_HOLDING(t("Keep holding…", "दबाए रखें…", "నొక్కి ఉంచండి…", "பிடித்திருங்கள்…")),
    RELEASED_EARLY(t("Released early. Nothing was sent.", "जल्दी छोड़ दिया। कुछ नहीं भेजा गया।", "ముందే వదిలేశారు. ఏదీ పంపలేదు.", "சீக்கிரம் விட்டுவிட்டீர்கள். எதுவும் அனுப்பப்படவில்லை.")),
    CHOOSE_SITUATION(t("What is happening?", "क्या हो रहा है?", "ఏమి జరుగుతోంది?", "என்ன நடக்கிறது?")),
    SHARE_LOCATION(t("Share my location", "मेरी लोकेशन साझा करें", "నా లొకేషన్ పంచుకోండి", "என் இருப்பிடத்தைப் பகிர்")),
    LOC_NONE(t("No GPS", "GPS नहीं", "GPS వద్దు", "GPS வேண்டாம்")),
    LOC_NONE_HELP(t("Only that you need help", "सिर्फ़ यह कि मदद चाहिए", "సహాయం కావాలని మాత్రమే", "உதவி தேவை என்பது மட்டும்")),
    LOC_COARSE(t("Coarse (~1 km)", "मोटा (~1 किमी)", "సుమారు (~1 కి.మీ)", "தோராயமானது (~1 கி.மீ)")),
    LOC_COARSE_HELP(t("Your neighbourhood only", "सिर्फ़ आपका इलाका", "మీ ప్రాంతం మాత్రమే", "உங்கள் பகுதி மட்டும்")),
    LOC_PRECISE(t("Precise GPS", "सटीक GPS", "ఖచ్చితమైన GPS", "துல்லிய GPS")),
    LOC_PRECISE_HELP(t("Exact spot for rescue teams", "बचाव दल के लिए सही जगह", "రక్షణ బృందాలకు సరైన స్థలం", "மீட்புக் குழுவுக்கு சரியான இடம்")),
    SEND_SAFE(t("Send “I'm safe”", "“मैं सुरक्षित हूँ” भेजें", "“నేను సురక్షితంగా ఉన్నాను” పంపండి", "“நான் பாதுகாப்பாக இருக்கிறேன்” அனுப்பு")),
    SAFE_SENT(t("“I'm safe” sent", "“मैं सुरक्षित हूँ” भेज दिया", "“నేను సురక్షితంగా ఉన్నాను” పంపబడింది", "“நான் பாதுகாப்பாக இருக்கிறேன்” அனுப்பப்பட்டது")),
    YOUR_SOS(t("Your SOS", "आपका SOS", "మీ SOS", "உங்கள் SOS")),
    STAGE_BROADCASTED(t("Broadcasted", "प्रसारित किया गया", "ప్రసారం చేయబడింది", "ஒளிபரப்பப்பட்டது")),
    BROADCAST_DETAIL(t("Sent to %d nearby devices", "%d पास के डिवाइस को भेजा गया", "%d సమీప పరికరాలకు పంపబడింది", "அருகிலுள்ள %d சாதனங்களுக்கு அனுப்பப்பட்டது")),
    BROADCAST_NO_PEERS(t(
        "No device in range yet. It will spread when one connects.",
        "अभी कोई डिवाइस पास नहीं। कोई जुड़ते ही यह फैल जाएगा।",
        "ఇంకా ఏ పరికరం పరిధిలో లేదు. ఒకటి కనెక్ట్ అయ్యాక వ్యాపిస్తుంది.",
        "இன்னும் எந்த சாதனமும் அருகில் இல்லை. ஒன்று இணைந்ததும் பரவும்."
    )),
    STAGE_REACHED(t("Reached %d nodes", "%d नोड तक पहुँचा", "%d నోడ్‌లకు చేరింది", "%d நோட்களை அடைந்தது")),
    STAGE_ACKNOWLEDGED(t("Acknowledged", "पावती मिली", "అంగీకరించబడింది", "ஏற்றுக்கொள்ளப்பட்டது")),
    STAGE_EN_ROUTE(t("Responder en route", "बचावकर्ता रास्ते में", "రక్షకులు వస్తున్నారు", "மீட்பாளர் வருகிறார்")),
    WAITING(t("Waiting…", "प्रतीक्षा…", "వేచి ఉంది…", "காத்திருக்கிறது…")),
    VERIFIED(t("✔ VERIFIED RESPONDENT", "✔ सत्यापित बचावकर्ता", "✔ ధృవీకరించిన రక్షకుడు", "✔ சரிபார்க்கப்பட்ட மீட்பாளர்")),
    UNVERIFIED(t("Unverified Civilian Relay", "असत्यापित नागरिक रिले", "ధృవీకరించని పౌర రిలే", "சரிபார்க்கப்படாத பொது ரிலே")),
    HOPS_DIRECT(t("Heard directly", "सीधे सुना गया", "నేరుగా అందింది", "நேரடியாகக் கேட்டது")),
    HOP_ONE(t("1 hop away", "1 हॉप दूर", "1 హాప్ దూరం", "1 ஹாப் தொலைவில்")),
    HOPS_N(t("%d hops away", "%d हॉप दूर", "%d హాప్‌ల దూరం", "%d ஹாப் தொலைவில்")),
    CLOSE(t("Close", "बंद करें", "మూసివేయి", "மூடு")),
    SEND_ANOTHER(t("Send another", "एक और भेजें", "మరొకటి పంపండి", "மற்றொன்று அனுப்பு")),
    ACKNOWLEDGE(t("Acknowledge", "पावती दें", "అంగీకరించు", "ஏற்றுக்கொள்")),
    ON_MY_WAY(t("I'm on my way", "मैं आ रहा हूँ", "నేను వస్తున్నాను", "நான் வருகிறேன்")),
    YOU_ACKNOWLEDGED(t("You acknowledged this", "आपने पावती दी", "మీరు దీన్ని అంగీకరించారు", "நீங்கள் இதை ஏற்றுக்கொண்டீர்கள்")),
    YOU_ON_YOUR_WAY(t("You said you are on your way", "आपने कहा कि आप आ रहे हैं", "మీరు వస్తున్నారని చెప్పారు", "நீங்கள் வருவதாகச் சொன்னீர்கள்")),
    NO_GPS_FIX(t(
        "No GPS fix. Sent without location.",
        "GPS लोकेशन नहीं मिली। बिना लोकेशन के भेजा गया।",
        "GPS లభించలేదు. లొకేషన్ లేకుండా పంపబడింది.",
        "GPS கிடைக்கவில்லை. இருப்பிடம் இல்லாமல் அனுப்பப்பட்டது."
    )),
    HOME_HINT(t("Emergency SOS: hold 3 s", "आपातकालीन SOS: 3 सेकंड दबाएँ", "అత్యవసర SOS: 3 సెకన్లు నొక్కండి", "அவசர SOS: 3 விநாடி அழுத்தவும்")),
    SOS_ACTIVE(t("SOS active", "SOS सक्रिय", "SOS చురుకుగా ఉంది", "SOS செயலில் உள்ளது")),
    CHOOSE_TYPE(t("Choose situation", "स्थिति चुनें", "పరిస్థితిని ఎంచుకోండి", "நிலையைத் தேர்ந்தெடுக்கவும்")),
    NO_PEERS_NOTE(t(
        "No nearby devices right now. Your SOS is stored and spreads when a device connects.",
        "अभी पास में कोई डिवाइस नहीं। आपका SOS सहेजा गया है और डिवाइस जुड़ते ही फैलेगा।",
        "ప్రస్తుతం సమీపంలో పరికరాలు లేవు. మీ SOS నిల్వ చేయబడింది, పరికరం కనెక్ట్ అయ్యాక వ్యాపిస్తుంది.",
        "இப்போது அருகில் சாதனங்கள் இல்லை. உங்கள் SOS சேமிக்கப்பட்டது, சாதனம் இணைந்ததும் பரவும்."
    ));

    fun text(lang: SosLanguage): String = by[lang] ?: by.getValue(SosLanguage.EN)

    /** Formats a `%d` template, always with ASCII digits so numbers read the same in every language. */
    fun format(lang: SosLanguage, vararg args: Any): String =
        String.format(Locale.ROOT, text(lang), *args)
}

private fun t(en: String, hi: String, te: String, ta: String): Map<SosLanguage, String> = mapOf(
    SosLanguage.EN to en,
    SosLanguage.HI to hi,
    SosLanguage.TE to te,
    SosLanguage.TA to ta
)
