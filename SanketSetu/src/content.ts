/**
 * Centralized Content & Application Configuration (src/content.ts)
 * -----------------------------------------------------------------------------
 * Single source of truth for all copy, navigation items, screen titles,
 * emergency SOS categories, multilingual Quick-SOS pictograms (English, Hindi,
 * Telugu, Tamil), safety circles, hazard reports, permissions explainer,
 * power modes, simulator presets, and legacy scene compatibility exports.
 * Rebranded for SANKET SETU ("stay connected when everything goes dark.").
 */

export type AppScreenId =
  | 'home'
  | 'messages'
  | 'sos'
  | 'alerts'
  | 'circles'
  | 'map'
  | 'simulator'
  | 'ai'
  | 'settings'
  | 'onboarding';

export type StorySectionId =
  | 'home'
  | 'problem'
  | 'how-it-works'
  | 'intelligence'
  | 'technology'
  | 'use-cases'
  | 'live-demo';

export type AllSectionId = StorySectionId | 'outro';

export type ScenarioAccent = 'lime' | 'lilac' | 'blue' | 'coral' | 'peach';

export type SupportedPictogramLang = 'en' | 'hi' | 'te' | 'ta';

export type PictogramLanguage = 'English' | 'Hindi' | 'Telugu' | 'Tamil';

export interface PictogramTemplate {
  id: string;
  category: 'medical' | 'trapped' | 'fire' | 'flood' | 'supplies' | 'safe';
  glyph: string;
  iconName: 'heart-pulse' | 'building' | 'flame' | 'waves' | 'droplet' | 'shield-check';
  accent: ScenarioAccent;
  localized: Record<
    PictogramLanguage,
    {
      title: string;
      template: string;
    }
  >;
}

export interface HazardCategoryConfig {
  id: 'flood' | 'collapse' | 'fire' | 'blocked_road';
  glyph: string;
  label: string;
  shortTag: string;
  defaultTtlMinutes: number;
  accent: ScenarioAccent;
}

export interface SectionRegistryItem {
  id: AllSectionId;
  counterIndex: string;
  navLabel: string;
  sectionName: string;
  menuCaption: string;
  progressTarget: number;
  inTopNav: boolean;
  isAccentCoral?: boolean;
}

export interface NavItemConfig {
  id: StorySectionId;
  label: string;
  counterIndex: string;
  sectionName: string;
  isAccentCoral?: boolean;
}

export interface MobileTabConfig {
  id: AppScreenId;
  path: string;
  counterIndex: string;
  label: string;
  shortLabel: string;
  caption: string;
  isAccentCoral?: boolean;
}

export interface SOSCategoryConfig {
  id: 'medical' | 'trapped' | 'fire' | 'flood' | 'supplies' | 'safe';
  label: string;
  shortTag: string;
  defaultPriority: 0 | 1 | 2;
  accent: ScenarioAccent;
  templateText: string;
}

export interface PermissionItemConfig {
  id: string;
  androidPermission: string;
  title: string;
  purpose: string;
  requiredForCore: boolean;
}

export interface PowerModeContentConfig {
  id: 'active' | 'balanced' | 'saver';
  label: string;
  scanWindowLabel: string;
  autoTriggerLabel: string;
  orbPolicyLabel: string;
  relayPolicyLabel: string;
}

export interface ScenarioItem {
  id: string;
  index: string;
  title: string;
  domain: string;
  metricLabel: string;
  metricValue: string;
  summary: string;
  accent: ScenarioAccent;
  sampleInput: string;
  demoPreset?: string;
}

export interface HeroStoryBeat {
  id: 'problem' | 'idea' | 'how-it-works' | 'impact';
  step: string;
  tag: string;
  captionLine1: string;
  captionLine2: string;
  detail: string;
}

export interface StatItem {
  value: number;
  suffix: string;
  label: string;
  sublabel: string;
}

export interface MenuLink {
  label: string;
  sceneIndex: number;
  sectionId?: AllSectionId;
  progressTarget: number;
  caption: string;
}

/**
 * Primary Mobile Bottom-Pill Navigation Registry (Sanket Setu App)
 */
export const MOBILE_TABS: readonly MobileTabConfig[] = [
  {
    id: 'home',
    path: '/',
    counterIndex: '01',
    label: 'HOME',
    shortLabel: 'home',
    caption: '01 / 08 — mesh status & sos',
  },
  {
    id: 'messages',
    path: '/messages',
    counterIndex: '02',
    label: 'MESSAGES',
    shortLabel: 'chat',
    caption: '02 / 08 — e2e encrypted threads',
  },
  {
    id: 'sos',
    path: '/sos',
    counterIndex: '03',
    label: 'SOS & TRACKER',
    shortLabel: 'sos',
    caption: '03 / 08 — closed-loop sos & pictograms',
    isAccentCoral: true,
  },
  {
    id: 'alerts',
    path: '/alerts',
    counterIndex: '04',
    label: 'RESPONDER FEED',
    shortLabel: 'alerts',
    caption: '04 / 08 — verified responder alerts',
  },
  {
    id: 'circles',
    path: '/circles',
    counterIndex: '05',
    label: 'SAFE & HAZARDS',
    shortLabel: 'safe',
    caption: '05 / 08 — circles safety check & hazards',
  },
  {
    id: 'map',
    path: '/map',
    counterIndex: '06',
    label: 'MESH MAP',
    shortLabel: 'map',
    caption: '06 / 08 — 3d/2d topology & dead-zones',
  },
  {
    id: 'simulator',
    path: '/simulator',
    counterIndex: '07',
    label: 'SIMULATOR',
    shortLabel: 'sim',
    caption: '07 / 08 — virtual mesh testbed',
  },
  {
    id: 'ai',
    path: '/ai',
    counterIndex: '08',
    label: 'AI TRIAGE',
    shortLabel: 'ai',
    caption: '08 / 08 — optional online assistant',
  },
] as const;

/**
 * Offline Quick-SOS Pictogram Templates in English, Hindi, Telugu, Tamil (§8.8 & §9.4)
 */
export const QUICK_SOS_PICTOGRAMS: readonly PictogramTemplate[] = [
  {
    id: 'medical_trauma',
    category: 'medical',
    glyph: '✚',
    iconName: 'heart-pulse',
    accent: 'coral',
    localized: {
      English: {
        title: 'Severe Injury / Medic',
        template:
          'MEDICAL SOS: Critical injury / bleeding on site. Need trauma medic and first-aid kit immediately.',
      },
      Hindi: {
        title: 'गंभीर चोट / डॉक्टर चाहिए',
        template:
          'मेडिकल SOS: गंभीर चोट और रक्तस्राव। तुरंत डॉक्टर और प्राथमिक उपचार किट की आवश्यकता है।',
      },
      Telugu: {
        title: 'తీవ్ర గాయం / వైద్య సహాయం',
        template:
          'మెడికల్ SOS: తీవ్రమైన గాయం / రక్తస్రావం. తక్షణమే వైద్య సహాయం మరియు ఫస్ట్ ఎయిడ్ కిట్ కావాలి.',
      },
      Tamil: {
        title: 'கடுமையான காயம் / மருத்துவ உதவி',
        template:
          'மருத்துவ SOS: கடுமையான காயம் / இரத்தப்போக்கு. உடனடியாக மருத்துவர் மற்றும் முதலுதவி பெட்டி தேவை.',
      },
    },
  },
  {
    id: 'trapped_collapse',
    category: 'trapped',
    glyph: '⚠',
    iconName: 'building',
    accent: 'coral',
    localized: {
      English: {
        title: 'Trapped in Debris',
        template:
          'TRAPPED SOS: Structure collapsed, exit blocked. Survivors trapped inside, need search & rescue extraction.',
      },
      Hindi: {
        title: 'मलवे में फंसे हैं',
        template:
          'बचाव SOS: इमारत गिरने से रास्ता बंद है। लोग अंदर फंसे हैं, तुरंत बचाव दल (NDRF) भेजें।',
      },
      Telugu: {
        title: 'శిథిలాలలో చిక్కుకున్నాము',
        template:
          'రెస్క్యూ SOS: భవనం కూలిపోయింది, బయటకు వచ్చే దారి మూసుకుపోయింది. తక్షణమే రెస్క్యూ బృందాన్ని పంపండి.',
      },
      Tamil: {
        title: 'இடிபாடுகளில் சிக்கியுள்ளோம்',
        template:
          'மீட்பு SOS: கட்டிடம் இடிந்து வெளியேறும் வழி அடைக்கப்பட்டுள்ளது. உடனடியாக மீட்புப் படை தேவை.',
      },
    },
  },
  {
    id: 'trapped_flood',
    category: 'flood',
    glyph: '≈',
    iconName: 'waves',
    accent: 'blue',
    localized: {
      English: {
        title: 'Rising Flood / Rooftop',
        template:
          'FLOOD SOS: Water rising rapidly on ground floor. Stranded on rooftop, need rescue boat evacuation.',
      },
      Hindi: {
        title: 'बाढ़ का पानी / छत पर फंसे',
        template:
          'बाढ़ SOS: पानी तेजी से बढ़ रहा है। हम छत पर फंसे हैं, तुरंत नाव से निकासी की जरूरत है।',
      },
      Telugu: {
        title: 'వరద నీరు / పైకప్పుపై ఉన్నాము',
        template:
          'వరద SOS: వరద నీరు వేగంగా పెరుగుతోంది. భవనం పైకప్పుపై చిక్కుకున్నాము, బోటు సహాయం కావాలి.',
      },
      Tamil: {
        title: 'வெள்ள நீர் / மாடியில் உள்ளோம்',
        template:
          'வெள்ள SOS: வெள்ள நீர் வேகமாக உயர்கிறது. மொட்டை மாடியில் சிக்கியுள்ளோம், படகு மீட்பு தேவை.',
      },
    },
  },
  {
    id: 'fire_hazard',
    category: 'fire',
    glyph: '▲',
    iconName: 'flame',
    accent: 'coral',
    localized: {
      English: {
        title: 'Fire & Heavy Smoke',
        template:
          'FIRE SOS: Active fire and heavy smoke blocking evacuation route. Immediate fire-rescue needed.',
      },
      Hindi: {
        title: 'आग और घना धुआं',
        template:
          'आग SOS: भीषण आग और धुआं फैला है, बाहर निकलने का रास्ता बंद है। तुरंत फायर ब्रिगेड भेजें।',
      },
      Telugu: {
        title: 'మంటలు మరియు దట్టమైన పొగ',
        template:
          'అగ్ని ప్రమాదం SOS: మంటలు మరియు దట్టమైన పొగ వ్యాపిస్తున్నాయి. తక్షణమే అగ్నిమాపక సహాయం కావాలి.',
      },
      Tamil: {
        title: 'தீ மற்றும் அடர்ந்த புகை',
        template:
          'தீ விபத்து SOS: தீ மற்றும் அடர்ந்த புகை பரவுகிறது. உடனடியாக தீயணைப்பு மீட்பு தேவை.',
      },
    },
  },
  {
    id: 'need_supplies',
    category: 'supplies',
    glyph: '◈',
    iconName: 'droplet',
    accent: 'lilac',
    localized: {
      English: {
        title: 'Need Water & Medicine',
        template:
          'SUPPLIES NEEDED: Out of clean drinking water, infant formula, and essential medicines (insulin).',
      },
      Hindi: {
        title: 'पानी और दवाइयां चाहिए',
        template:
          'राहत सामग्री: पीने का साफ पानी, बच्चों का दूध और जरूरी दवाइयां (इंसुलिन) खत्म हो गई हैं।',
      },
      Telugu: {
        title: 'మంచినీరు మరియు మందులు కావాలి',
        template:
          'సరఫరాలు కావాలి: తాగునీరు, పిల్లల పాలు మరియు అత్యవసర మందులు (ఇన్సులిన్) నిండుకున్నాయి.',
      },
      Tamil: {
        title: 'குடிநீர் மற்றும் மருந்துகள் தேவை',
        template:
          'பொருட்கள் தேவை: குடிநீர், குழந்தை உணவு மற்றும் அத்தியாவசிய மருந்துகள் (இன்సుலின்) தீர்ந்துவிட்டன.',
      },
    },
  },
  {
    id: 'marked_safe',
    category: 'safe',
    glyph: '✔',
    iconName: 'shield-check',
    accent: 'lime',
    localized: {
      English: {
        title: 'I Am Safe at Shelter',
        template:
          'SAFE CHECK: I am uninjured at the relief shelter and keeping my phone on to relay mesh packets.',
      },
      Hindi: {
        title: 'मैं सुरक्षित हूं',
        template:
          'सुरक्षित: मैं राहत शिविर में सुरक्षित हूं और मेश नेटवर्क रिले के लिए फोन चालू रख रहा हूं।',
      },
      Telugu: {
        title: 'నేను సురక్షితంగా ఉన్నాను',
        template:
          'సురక్షితం: నేను సహాయక శిబిరంలో సురక్షితంగా ఉన్నాను మరియు మెష్ రిలే కోసం ఫోన్ ఆన్‌లో ఉంచాను.',
      },
      Tamil: {
        title: 'நான் பாதுகாப்பாக இருக்கிறேன்',
        template:
          'பாதுகாப்பு: நான் நிவாரண முகாமில் பாதுகாப்பாக உள்ளேன், மெஷ் ரிலேவிற்காக தொலைபேசியை இயக்கி வைத்துள்ளேன்.',
      },
    },
  },
] as const;

export const HAZARD_CATEGORIES: readonly HazardCategoryConfig[] = [
  {
    id: 'flood',
    glyph: '≈',
    label: 'submerged road / flood',
    shortTag: 'FLOOD HAZARD',
    defaultTtlMinutes: 120,
    accent: 'blue',
  },
  {
    id: 'collapse',
    glyph: '⚠',
    label: 'unstable structure / debris',
    shortTag: 'COLLAPSE HAZARD',
    defaultTtlMinutes: 240,
    accent: 'coral',
  },
  {
    id: 'fire',
    glyph: '▲',
    label: 'active fire / power line',
    shortTag: 'FIRE / ELEC HAZARD',
    defaultTtlMinutes: 90,
    accent: 'coral',
  },
  {
    id: 'blocked_road',
    glyph: '⛔',
    label: 'bridge / route blocked',
    shortTag: 'ROUTE BLOCKED',
    defaultTtlMinutes: 180,
    accent: 'lilac',
  },
] as const;

export const SOS_CATEGORIES: readonly SOSCategoryConfig[] = [
  {
    id: 'medical',
    label: 'medical emergency',
    shortTag: 'MED · P0',
    defaultPriority: 0,
    accent: 'coral',
    templateText:
      'Urgent medical assistance needed. Severe injury / bleeding on site. Requesting first responder or medic with trauma kit.',
  },
  {
    id: 'trapped',
    label: 'trapped / structural collapse',
    shortTag: 'TRAP · P0',
    defaultPriority: 0,
    accent: 'coral',
    templateText:
      'Trapped inside structure after collapse. Stairwell blocked, audible tapping from ground floor east wing.',
  },
  {
    id: 'fire',
    label: 'active fire / smoke hazard',
    shortTag: 'FIRE · P0',
    defaultPriority: 0,
    accent: 'coral',
    templateText:
      'Active fire spreading near residential block. Thick smoke obstructing evacuation route, immediate extraction required.',
  },
  {
    id: 'flood',
    label: 'flooding / rising water',
    shortTag: 'FLOOD · P0',
    defaultPriority: 0,
    accent: 'blue',
    templateText:
      'Water level rising rapidly on street level. Relocated to rooftop, need boat evacuation and dry blankets.',
  },
  {
    id: 'supplies',
    label: 'water / power / supplies',
    shortTag: 'SUPPLIES · P1',
    defaultPriority: 1,
    accent: 'lilac',
    templateText:
      'Shelter intact but running critically low on potable water, insulin cooling packs, and battery banks.',
  },
  {
    id: 'safe',
    label: 'marked safe / welfare check',
    shortTag: 'SAFE · P2',
    defaultPriority: 2,
    accent: 'lime',
    templateText:
      'Accounted for and safe at neighborhood assembly point. Available to relay messages and assist nearby nodes.',
  },
] as const;

export const ANDROID_PERMISSIONS_LIST: readonly PermissionItemConfig[] = [
  {
    id: 'bt-scan',
    androidPermission: 'android.permission.BLUETOOTH_SCAN',
    title: 'bluetooth low energy scan',
    purpose: 'Discovers nearby Sanket Setu phones in airplane mode without internet or cell towers.',
    requiredForCore: true,
  },
  {
    id: 'bt-advertise',
    androidPermission: 'android.permission.BLUETOOTH_ADVERTISE',
    title: 'bluetooth beacon advertising',
    purpose: 'Broadcasts your ephemeral node presence so nearby responders can route through your phone.',
    requiredForCore: true,
  },
  {
    id: 'bt-connect',
    androidPermission: 'android.permission.BLUETOOTH_CONNECT',
    title: 'peer-to-peer radio link',
    purpose: 'Establishes encrypted P2P_CLUSTER sockets to exchange signed mesh packets.',
    requiredForCore: true,
  },
  {
    id: 'nearby-wifi',
    androidPermission: 'android.permission.NEARBY_WIFI_DEVICES',
    title: 'wi-fi direct high-speed relay',
    purpose: 'Upgrades bandwidth automatically via Google Nearby Connections when transferring sync inventories.',
    requiredForCore: true,
  },
  {
    id: 'fine-location',
    androidPermission: 'android.permission.ACCESS_FINE_LOCATION',
    title: 'gps coordinates (strictly opt-in & responder-sealed)',
    purpose: 'Used ONLY when you enable location on an SOS. Exact coordinates are sealed to the Responder Group key.',
    requiredForCore: false,
  },
  {
    id: 'camera-qr',
    androidPermission: 'android.permission.CAMERA',
    title: 'camera for offline qr verification',
    purpose: 'Scans peer TOFU keys, Family Circle keys, and Authority Responder Certificates offline.',
    requiredForCore: false,
  },
  {
    id: 'fg-service',
    androidPermission: 'android.permission.FOREGROUND_SERVICE',
    title: 'background mesh relay service',
    purpose: 'Keeps "Sanket Setu mesh active" notification running so your phone relays SOS while screen is off.',
    requiredForCore: true,
  },
] as const;

export const POWER_MODES_CONTENT: readonly PowerModeContentConfig[] = [
  {
    id: 'active',
    label: 'active mode',
    scanWindowLabel: 'continuous discovery (100% duty)',
    autoTriggerLabel: 'battery ≥ 30% or charger connected',
    orbPolicyLabel: '60fps webgl glass orb (adaptive dpr)',
    relayPolicyLabel: 'relays all priorities (P0 SOS → P3 receipts)',
  },
  {
    id: 'balanced',
    label: 'balanced mode',
    scanWindowLabel: 'duty-cycled: 10s scan / 20s sleep (33% duty)',
    autoTriggerLabel: 'auto-switches below 30% battery',
    orbPolicyLabel: 'throttled 30fps / reduced dpr webgl',
    relayPolicyLabel: 'relays all messages with adaptive batching',
  },
  {
    id: 'saver',
    label: 'emergency saver',
    scanWindowLabel: '5s scan / 45s sleep (10% duty) + wake on sos',
    autoTriggerLabel: 'auto-switches below 15% battery (last-gasp at ≤5%)',
    orbPolicyLabel: 'webgl paused — zero-gpu static css orb',
    relayPolicyLabel: 'relays ONLY P0 SOS & P1 Emergency packets',
  },
] as const;

export const SECTION_REGISTRY: readonly SectionRegistryItem[] = [
  {
    id: 'home',
    counterIndex: '01',
    navLabel: 'HOME',
    sectionName: 'home',
    menuCaption: '01 — live mesh status & sos',
    progressTarget: 0.0,
    inTopNav: true,
  },
  {
    id: 'problem',
    counterIndex: '02',
    navLabel: 'MESSAGES',
    sectionName: 'messages',
    menuCaption: '02 — e2e encrypted threads',
    progressTarget: 0.16,
    inTopNav: true,
  },
  {
    id: 'how-it-works',
    counterIndex: '03',
    navLabel: 'SOS',
    sectionName: 'sos composer',
    menuCaption: '03 — closed-loop sos & pictograms',
    progressTarget: 0.32,
    inTopNav: true,
    isAccentCoral: true,
  },
  {
    id: 'intelligence',
    counterIndex: '04',
    navLabel: 'ALERTS',
    sectionName: 'alerts feed',
    menuCaption: '04 — verified responder feed',
    progressTarget: 0.48,
    inTopNav: true,
  },
  {
    id: 'technology',
    counterIndex: '05',
    navLabel: 'MESH MAP',
    sectionName: 'mesh map',
    menuCaption: '05 — 3d & 2d topology',
    progressTarget: 0.64,
    inTopNav: true,
  },
  {
    id: 'use-cases',
    counterIndex: '06',
    navLabel: 'SIMULATOR',
    sectionName: 'simulator',
    menuCaption: '06 — multi-hop testbed',
    progressTarget: 0.8,
    inTopNav: true,
  },
  {
    id: 'live-demo',
    counterIndex: '07',
    navLabel: 'AI TRIAGE',
    sectionName: 'ai assistant',
    menuCaption: '07 — optional online triage',
    progressTarget: 0.92,
    inTopNav: true,
  },
  {
    id: 'outro',
    counterIndex: '08',
    navLabel: 'SETTINGS',
    sectionName: 'settings',
    menuCaption: '08 — keys, responder cert & power',
    progressTarget: 1.0,
    inTopNav: false,
  },
] as const;

export const PRODUCT_SCENARIOS: readonly ScenarioItem[] = [
  {
    id: 'multihop-chain',
    index: '01',
    title: '4-node chain relay (A→B→C→D)',
    domain: 'store-and-forward',
    metricLabel: 'topology',
    metricValue: 'SIMULATED',
    summary:
      'Node A cannot reach Node D directly. Messages hop through B and C with Ed25519 verification at every hop.',
    accent: 'lilac',
    sampleInput:
      'Medical team at North Shelter needs 12 units of O-negative blood and portable defibrillator pads via Relay C.',
    demoPreset: 'multihop-chain',
  },
  {
    id: 'link-break-recovery',
    index: '02',
    title: 'mid-flight link break & epidemic sync',
    domain: 'anti-entropy sync',
    metricLabel: 'recovery',
    metricValue: 'SIMULATED',
    summary:
      'Sever link B↔C before sending; packet queues in persistent outbox and auto-delivers via SYNC_INV upon reconnect.',
    accent: 'blue',
    sampleInput:
      'Bridge collapse at Sector 4 crossing. Rerouting evacuation convoy through high-ground service road.',
    demoPreset: 'link-break-recovery',
  },
] as const;

export const sanketContent = {
  appName: 'sanket setu',
  appTagline: 'stay connected when everything goes dark.',
  productThesis:
    'Other apps send messages when the network dies. Sanket Setu makes sure help actually arrives: encrypted, acknowledged by verified responders, and bridged back online when any phone finds signal.',
  versionLabel: 'sanket setu v1.0 · offline-first mesh',
  simulatedBadge: 'SIMULATED',
  plannedBadge: 'PLANNED',
  demoAuthorityBadge: 'DEMO AUTHORITY',
  demoGatewayBadge: 'DEMO',
  experimentalBadge: 'EXPERIMENTAL',
  aiDisclaimer: 'AI suggestion, use your judgment.',
  offlineHintBadge: 'basic offline hint (rule-based)',
  privacyNotice:
    'Privacy Notice: When using the optional online AI assistant, only the selected message text is sent to Featherless.ai. Private keys and GPS coordinates never leave your device unless you explicitly include them.',
  threatModelLimits: [
    'Cipher Suite Consistency: All authenticated encryption uses TweetNaCl XSalsa20-Poly1305 (X25519 nacl.box for direct messages & responder-sealed GPS, nacl.secretbox for shared emergency channel broadcasts) and Ed25519 (nacl.sign) for packet signatures.',
    'Bundled Emergency Channel Key: The default emergency broadcast key only prevents casual snooping; use a custom QR Circle key for private group broadcasts.',
    'Responder Device Compromise: A compromised responder device holding the Responder Group secret key can unseal precise SOS coordinates until the responder group key is rotated.',
    'Adversary Scope: Designed for disaster-zone resilience and anti-spoofing; does not defend against state-level RF traffic analysis or physical hardware extraction.',
  ],

  home: {
    sectionIndex: '01 / 08',
    kicker: '01 — sanket setu · offline emergency mesh',
    headlineLine1: 'stay connected',
    headlineLine2: 'when everything',
    headlineLine3: 'goes dark.',
    subtitle:
      'Encrypted offline mesh with closed-loop SOS tracking, responder-sealed GPS coordinates, verified responder certificates, and Setu cloud gateway bridging.',
    sosHoldPrompt: 'hold 3 seconds to broadcast sos',
    sosHoldingPrompt: 'keep holding to confirm sos beacon...',
    sosActivePrompt: 'sos beacon active — closed-loop tracker live',
    sosCancelLabel: 'cancel sos',
    sendMsgCta: 'send message',
    safeCheckInCta: "one-tap “i'm safe” family circle check-in",
    imSafeCta: "i'm safe (circle check)",
    openSimCta: 'open 4-node simulator',
    orbStates: {
      idle: 'mesh idle · listening on local radio',
      scanning: 'scanning p2p_cluster beacons...',
      connected: 'mesh locked · active peer relay',
      sos: 'priority 0 sos broadcast active',
    },
  },

  onboarding: {
    kicker: '00 — zero-internet field setup',
    title: 'initialize your sanket setu node',
    subtitle:
      'Your cryptographic identity is generated locally on this device using Ed25519 + X25519. No phone number, SIM card, or server required.',
    nameLabel: 'responder / callsign display name',
    namePlaceholder: 'e.g. ASTRA-01 / Medic Priya',
    pinLabel: 'optional 4-digit local keystore pin',
    pinPlaceholder: '0000 (encrypts private key at rest)',
    languageLabel: 'preferred interface & pictogram language',
    powerModeLabel: 'initial radio duty-cycle mode',
    completeCta: 'activate sanket setu node',
  },

  inspectorTabs: {
    route: 'route (hop path)',
    packet: 'packet (header & ttl)',
    crypto: 'crypto (ed25519 & x25519)',
  },
} as const;

export const siteContent = {
  brand: {
    name: 'sanket setu',
    monogram: 's',
    year: '2025',
    tagline: 'stay connected when everything goes dark.',
  },

  sectionRegistry: SECTION_REGISTRY,

  chrome: {
    menuOpenLabel: 'menu',
    menuCloseLabel: 'close',
    launchCtaLabel: 'sos beacon',
    viewToggleSpiral: '3d mesh',
    viewToggleList: 'node list',
    viewToggleSeparator: '|',
    muteAriaLabel: 'toggle sound',
    soundOnLabel: 'sound on',
    soundOffLabel: 'muted',
    scrollPrompt: 'offline mesh active · zero internet required',
    circularText: 'sanket setu • offline mesh • ',
    cursorInspectLabel: 'inspect',
    cursorReturnLabel: 'close',
    cursorToggleLabel: 'switch',
    cursorDragLabel: 'drag',
    detailCloseHint: 'tap anywhere or press esc to close',
    themeToggleAriaLabel: 'toggle color theme',
    themeLightLabel: 'light',
    themeDarkLabel: 'dark',
    totalSectionsCount: '08',
  },

  nav: {
    items: SECTION_REGISTRY.filter((s) => s.inTopNav).map((s) => ({
      id: s.id as StorySectionId,
      label: s.navLabel,
      counterIndex: s.counterIndex,
      sectionName: s.sectionName,
      isAccentCoral: s.isAccentCoral,
    })) as NavItemConfig[],
  },

  preloader: {
    caption: "i'm sanket setu",
    skipLabel: 'skip',
  },

  scene1Orb: {
    indexLabel: '01 — offline emergency mesh',
    line1: 'stay connected',
    line2: 'when everything goes dark',
    serifCaption:
      'encrypted offline mesh with verified responder acknowledgments and setu gateway bridging',
  },

  useCasesSection: {
    indexLabel: '06 — simulator presets',
    headline: 'verify multi-hop',
    headlineOutlineWord: 'resilience',
    headlineTail: 'live',
    serifSubline: 'run deterministic mesh scenarios in the built-in multi-node simulator.',
    runInDemoLabel: 'load in simulator',
    nextScenarioLabel: 'next preset',
    scenarios: PRODUCT_SCENARIOS,
  },

  scene3HeroObject: {
    sectionKicker: 'sanket setu protocol / store-and-forward',
    beats: [] as HeroStoryBeat[],
  },

  scene4Stats: {
    sectionKicker: 'mesh telemetry',
    items: [] as StatItem[],
    marqueeKeywords: [
      'ed25519 signatures',
      'x25519 e2e encryption',
      'responder-sealed gps',
      'verified responder certs',
      'store-and-forward outbox',
      'anti-entropy sync_inv',
      'priority 0 sos beacon',
      'setu gateway bridge',
    ],
  },

  scene5Outro: {
    kicker: '08 — sanket setu offline emergency mesh',
    headline: 'stay connected when everything goes dark',
    ctaButtonLabel: 'broadcast sos test',
    ctaHref: '#sos',
    serifSignoff: 'built by team astra for disaster resilience — offline-first mesh.',
    socials: [
      { label: 'simulator', href: '#/simulator' },
      { label: 'mesh map', href: '#/map' },
      { label: 'settings', href: '#/settings' },
    ],
  },

  menu: {
    links: SECTION_REGISTRY.map((s, idx) => ({
      label: s.sectionName,
      sceneIndex: Math.min(5, idx + 1),
      sectionId: s.id,
      progressTarget: s.progressTarget,
      caption: s.menuCaption,
    })) as MenuLink[],
    footerNote: 'sanket setu offline emergency mesh · p2p_cluster · zero internet dependency',
  },
} as const;
