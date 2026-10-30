/**
 * Optional Online Featherless.ai Service (src/ai/featherless.ts)
 * Per §1.2, §2, §9:
 * - Uses OpenAI-compatible endpoint `https://api.featherless.ai/v1/chat/completions`.
 * - Strictly optional & online-only. Auto-disables when offline; queues nothing AI-related.
 * - Forces structured JSON output validated with Zod; retries once on parse failure, then falls back
 *   gracefully to the offline rule-based classifier (`classifyEmergencyOffline`).
 * - Never sends private keys or GPS coordinates unless explicitly opted in.
 */

import { z } from 'zod';
import {
  AlertRankingResult,
  AlertRankingSchema,
  SummaryResult,
  SummaryResultSchema,
  TranslationResult,
  TranslationResultSchema,
  UrgencyClassificationResult,
  UrgencyClassificationSchema,
} from './schemas';
import { classifyEmergencyOffline } from './fallbackClassifier';
import { StoredSOSAlert } from '../mesh/types';

export const FEATHERLESS_ENDPOINT =
  'https://api.featherless.ai/v1/chat/completions';
export const DEFAULT_FEATHERLESS_MODEL =
  'meta-llama/Meta-Llama-3.1-8B-Instruct';

export interface FeatherlessConfig {
  apiKey: string;
  model: string;
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return Boolean(navigator.onLine);
}

function extractJsonBlock(rawContent: string): unknown {
  const trimmed = rawContent.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  }
  return JSON.parse(candidate);
}

async function callFeatherlessStructured<T>(
  config: FeatherlessConfig,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>
): Promise<T> {
  if (!isBrowserOnline()) {
    throw new Error('Device is offline. AI assistant is disabled while offline.');
  }
  if (!config.apiKey.trim()) {
    throw new Error(
      'No Featherless.ai API key configured in Settings. Using offline rule-based hint.'
    );
  }

  let lastError: Error | null = null;

  // Try up to 2 times (initial + 1 retry on parse/validation failure per §9)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(FEATHERLESS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: config.model.trim() || DEFAULT_FEATHERLESS_MODEL,
          temperature: 0.1,
          max_tokens: 450,
          messages: [
            {
              role: 'system',
              content: `${systemPrompt}\nRespond ONLY with valid JSON matching the requested schema. Do not include markdown commentary.`,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Featherless API returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = data.choices?.[0]?.message?.content ?? '';
      const parsedJson = extractJsonBlock(rawText);
      return schema.parse(parsedJson);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Featherless structured generation failed');
}

export async function summarizeEmergencyText(
  text: string,
  config: FeatherlessConfig
): Promise<{ result: SummaryResult; source: 'featherless' | 'offline-fallback' }> {
  try {
    const res = await callFeatherlessStructured(
      config,
      'You are an emergency disaster triage assistant. Summarize incoming field messages concisely into JSON: {"summary": string, "keyFacts": string[], "headcountMentioned": number | null}.',
      text.slice(0, 1000),
      SummaryResultSchema
    );
    return { result: res, source: 'featherless' };
  } catch {
    const offline = classifyEmergencyOffline(text);
    const sentences = text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      source: 'offline-fallback',
      result: {
        summary:
          sentences[0] ||
          text.slice(0, 140) ||
          'Emergency field transmission received.',
        keyFacts: [
          `Urgency level: ${offline.level}`,
          offline.matchedKeywords.length > 0
            ? `Keywords: ${offline.matchedKeywords.join(', ')}`
            : 'No critical hazard keywords matched',
          offline.reason,
        ],
        headcountMentioned: null,
      },
    };
  }
}

export async function translateEmergencyText(
  text: string,
  targetLang: string,
  config: FeatherlessConfig
): Promise<{ result: TranslationResult; source: 'featherless' | 'unavailable' }> {
  try {
    const res = await callFeatherlessStructured(
      config,
      `Translate the emergency message accurately into ${targetLang}. Return JSON: {"translatedText": string, "detectedSourceLang": string, "targetLang": "${targetLang}"}.`,
      text.slice(0, 1000),
      TranslationResultSchema
    );
    return { result: res, source: 'featherless' };
  } catch {
    // Offline, no API key, or the API/parse failed — there is no offline rule-based translator,
    // so unlike the other AI functions this has no local fallback result. Return a clearly
    // labeled "unavailable" state instead of throwing, matching every other AI client function.
    return {
      source: 'unavailable',
      result: {
        translatedText: '',
        detectedSourceLang: 'unknown',
        targetLang,
      },
    };
  }
}

export async function classifyUrgencyWithAI(
  text: string,
  config: FeatherlessConfig
): Promise<{
  result: UrgencyClassificationResult;
  source: 'featherless' | 'offline-fallback';
}> {
  try {
    const res = await callFeatherlessStructured(
      config,
      'Classify the emergency urgency of this message. Return JSON: {"level": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", "reason": string, "confidence": number, "recommendedAction": string}.',
      text.slice(0, 1000),
      UrgencyClassificationSchema
    );
    return { result: res, source: 'featherless' };
  } catch {
    const fallback = classifyEmergencyOffline(text);
    return {
      source: 'offline-fallback',
      result: {
        level: fallback.level,
        reason: fallback.reason,
        confidence: fallback.confidence,
        recommendedAction:
          fallback.level === 'CRITICAL'
            ? 'Dispatch nearest trauma/extraction responder immediately.'
            : 'Monitor mesh channel and acknowledge receipt.',
      },
    };
  }
}

export async function rankAlertsWithAI(
  alerts: StoredSOSAlert[],
  config: FeatherlessConfig
): Promise<{
  result: AlertRankingResult;
  source: 'featherless' | 'offline-fallback';
}> {
  const minimalInput = alerts.map((a) => ({
    alertId: a.id,
    category: a.category,
    headcount: a.headcount,
    hops: a.hops,
    text: a.text.slice(0, 220),
  }));

  try {
    const res = await callFeatherlessStructured(
      config,
      'Rank these emergency SOS alerts in order of life-safety triage priority. Return JSON: {"rankedAlertIds": [{"alertId": string, "rank": number, "rationale": string}]}.',
      JSON.stringify(minimalInput),
      AlertRankingSchema
    );
    return { result: res, source: 'featherless' };
  } catch {
    const sorted = [...alerts].sort((a, b) => {
      const score = (al: StoredSOSAlert) => {
        const hint = classifyEmergencyOffline(al.text);
        const map = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return map[hint.level] * 10 + al.headcount - al.hops;
      };
      return score(b) - score(a);
    });

    return {
      source: 'offline-fallback',
      result: {
        rankedAlertIds: sorted.map((al, idx) => ({
          alertId: al.id,
          rank: idx + 1,
          rationale:
            al.offlineUrgencyHint?.reason ||
            `Sorted by priority P${al.priority}, headcount (${al.headcount}), and proximity (${al.hops} hops).`,
        })),
      },
    };
  }
}
