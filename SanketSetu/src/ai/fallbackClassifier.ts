/**
 * Offline Rule-Based Emergency Urgency Classifier (src/ai/fallbackClassifier.ts)
 * Per §9:
 * Works 100% offline with zero network calls.
 * Scans emergency text for life-safety, medical, structural collapse, fire, and hazard keywords.
 * Always clearly labeled "basic offline hint (rule-based)".
 */

export interface OfflineUrgencyClassification {
  level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  matchedKeywords: string[];
  reason: string;
  confidence: number;
  isOfflineRuleBased: true;
}

const CRITICAL_KEYWORDS = [
  'bleeding',
  'unconscious',
  'trapped',
  'collapse',
  'collapsed',
  'fire',
  'smoke',
  'drowning',
  'cardiac',
  'heart attack',
  'not breathing',
  'crush',
  'buried',
  'infant',
  'child trapped',
  'hypothermia',
  'hemorrhage',
];

const HIGH_KEYWORDS = [
  'injured',
  'fracture',
  'insulin',
  'oxygen',
  'flood',
  'rising water',
  'rooftop',
  'evacuate',
  'evacuation',
  'elderly',
  'pregnant',
  'dehydration',
  'medical',
  'tourniquet',
  'defibrillator',
];

const MEDIUM_KEYWORDS = [
  'water',
  'food',
  'supplies',
  'blankets',
  'battery',
  'generator',
  'shelter',
  'road blocked',
  'power outage',
  'medicine',
];

export function classifyEmergencyOffline(
  text: string
): OfflineUrgencyClassification {
  const lower = text.toLowerCase();

  const matchedCritical = CRITICAL_KEYWORDS.filter((kw) => lower.includes(kw));
  const matchedHigh = HIGH_KEYWORDS.filter((kw) => lower.includes(kw));
  const matchedMedium = MEDIUM_KEYWORDS.filter((kw) => lower.includes(kw));

  if (matchedCritical.length > 0) {
    return {
      level: 'CRITICAL',
      matchedKeywords: [...matchedCritical, ...matchedHigh.slice(0, 2)],
      reason: `Matched life-threat indicators (${matchedCritical.join(', ')}) requiring immediate P0 dispatch.`,
      confidence: Math.min(0.95, 0.78 + matchedCritical.length * 0.06),
      isOfflineRuleBased: true,
    };
  }

  if (matchedHigh.length > 0) {
    return {
      level: 'HIGH',
      matchedKeywords: [...matchedHigh, ...matchedMedium.slice(0, 2)],
      reason: `Matched acute medical/evacuation hazards (${matchedHigh.join(', ')}).`,
      confidence: Math.min(0.9, 0.72 + matchedHigh.length * 0.05),
      isOfflineRuleBased: true,
    };
  }

  if (matchedMedium.length > 0) {
    return {
      level: 'MEDIUM',
      matchedKeywords: matchedMedium,
      reason: `Matched resource/logistics needs (${matchedMedium.join(', ')}).`,
      confidence: 0.68,
      isOfflineRuleBased: true,
    };
  }

  return {
    level: 'LOW',
    matchedKeywords: [],
    reason: 'No immediate life-safety hazard keywords detected; classified as welfare check / status update.',
    confidence: 0.6,
    isOfflineRuleBased: true,
  };
}
