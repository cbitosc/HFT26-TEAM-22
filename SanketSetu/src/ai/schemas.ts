/**
 * Strict Zod Schemas for Optional Featherless AI Structured Responses (src/ai/schemas.ts)
 * Per §9:
 * Forces structured JSON output validated by Zod.
 */

import { z } from 'zod';

export const UrgencyClassificationSchema = z.object({
  level: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  reason: z.string().min(3),
  confidence: z.number().min(0).max(1),
  recommendedAction: z.string().optional(),
});

export type UrgencyClassificationResult = z.infer<
  typeof UrgencyClassificationSchema
>;

export const SummaryResultSchema = z.object({
  summary: z.string().min(3),
  keyFacts: z.array(z.string()).max(5),
  headcountMentioned: z.number().nullable().optional(),
});

export type SummaryResult = z.infer<typeof SummaryResultSchema>;

export const TranslationResultSchema = z.object({
  translatedText: z.string().min(1),
  detectedSourceLang: z.string(),
  targetLang: z.string(),
});

export type TranslationResult = z.infer<typeof TranslationResultSchema>;

export const AlertRankingSchema = z.object({
  rankedAlertIds: z.array(
    z.object({
      alertId: z.string(),
      rank: z.number().int().positive(),
      rationale: z.string(),
    })
  ),
});

export type AlertRankingResult = z.infer<typeof AlertRankingSchema>;
