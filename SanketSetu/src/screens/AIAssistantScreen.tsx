/**
 * Optional Online Featherless.ai Triage Assistant & Offline Rule-Based Fallback (src/screens/AIAssistantScreen.tsx)
 * Per §1.2, §8.8 & §9:
 * - Strictly optional & online-only for Featherless LLM calls; visibly disabled when offline.
 * - Includes an offline rule-based fallback classifier clearly labeled "basic offline hint (rule-based)".
 * - Always displays: "AI suggestion — verify with your own judgment".
 * - Never auto-modifies message priority; user explicitly reviews suggestions.
 */

import { useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Languages,
  ListOrdered,
  ShieldAlert,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { sanketContent } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import {
  classifyUrgencyWithAI,
  rankAlertsWithAI,
  summarizeEmergencyText,
  translateEmergencyText,
} from '../ai/featherless';
import { classifyEmergencyOffline } from '../ai/fallbackClassifier';

export function AIAssistantScreen() {
  const isOnline = useMeshStore((s) => s.isOnline);
  const alerts = useMeshStore((s) => s.alerts);
  const featherlessApiKey = useMeshStore((s) => s.featherlessApiKey);
  const featherlessModel = useMeshStore((s) => s.featherlessModel);
  const aiPrivacyAccepted = useMeshStore((s) => s.aiPrivacyAccepted);
  const acceptAiPrivacyNotice = useMeshStore((s) => s.acceptAiPrivacyNotice);
  const language = useMeshStore((s) => s.language);

  // Allow user/judge to toggle simulated offline state to test offline graceful disablement
  const [forceOfflineTest, setForceOfflineTest] = useState<boolean>(false);
  const effectiveOnline = isOnline && !forceOfflineTest;

  const [inputText, setInputText] = useState<string>(
    alerts[0]?.text ??
      'Urgent: 4 civilians trapped on 2nd floor of collapsed school wing. Severe bleeding reported, water level rising.'
  );
  const [targetLang, setTargetLang] = useState<string>(
    language === 'English' ? 'Hindi' : language
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [outputSource, setOutputSource] = useState<
    'featherless' | 'offline-fallback' | null
  >(null);
  const [outputTitle, setOutputTitle] = useState<string>('');
  const [outputBody, setOutputBody] = useState<string>('');
  const [outputBullets, setOutputBullets] = useState<string[]>([]);

  const config = {
    apiKey: featherlessApiKey,
    model: featherlessModel,
  };

  const handleOfflineRuleClassify = () => {
    const res = classifyEmergencyOffline(inputText);
    setOutputSource('offline-fallback');
    setOutputTitle(`Urgency: ${res.level} (${Math.round(res.confidence * 100)}% confidence)`);
    setOutputBody(res.reason);
    setOutputBullets(
      res.matchedKeywords.length > 0
        ? [`Matched keywords: ${res.matchedKeywords.join(', ')}`]
        : ['No critical keywords matched']
    );
  };

  const handleSummarize = async () => {
    if (!effectiveOnline) {
      handleOfflineRuleClassify();
      return;
    }
    setLoading(true);
    try {
      const { result, source } = await summarizeEmergencyText(
        inputText,
        config
      );
      setOutputSource(source);
      setOutputTitle('Emergency Field Summary');
      setOutputBody(result.summary);
      setOutputBullets(result.keyFacts);
    } finally {
      setLoading(false);
    }
  };

  const handleClassifyUrgency = async () => {
    if (!effectiveOnline) {
      handleOfflineRuleClassify();
      return;
    }
    setLoading(true);
    try {
      const { result, source } = await classifyUrgencyWithAI(inputText, config);
      setOutputSource(source);
      setOutputTitle(
        `Urgency Level: ${result.level} (${Math.round(
          result.confidence * 100
        )}%)`
      );
      setOutputBody(result.reason);
      setOutputBullets(
        result.recommendedAction ? [result.recommendedAction] : []
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTranslate = async () => {
    if (!effectiveOnline) return;
    setLoading(true);
    try {
      const res = await translateEmergencyText(inputText, targetLang, config);
      setOutputSource('featherless');
      setOutputTitle(`Translated to ${res.targetLang}`);
      setOutputBody(res.translatedText);
      setOutputBullets([`Detected source language: ${res.detectedSourceLang}`]);
    } catch (err) {
      setOutputSource('offline-fallback');
      setOutputTitle('Online Translation Unavailable');
      setOutputBody(
        err instanceof Error
          ? err.message
          : 'Configure Featherless.ai API key in Settings to use neural translation.'
      );
      setOutputBullets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRankAlerts = async () => {
    setLoading(true);
    try {
      const { result, source } = await rankAlertsWithAI(alerts, config);
      setOutputSource(source);
      setOutputTitle(`Recommended Responder Triage Order (${alerts.length} alerts)`);
      setOutputBody(
        'Sorted by life-safety criticality, headcount, and hop proximity. User must confirm before changing dispatch order.'
      );
      setOutputBullets(
        result.rankedAlertIds.map(
          (r) => `#${r.rank} [Alert ${r.alertId.slice(0, 6)}]: ${r.rationale}`
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pt-2 pb-28 sm:px-6">
      {/* Header + Offline/Online Status Toggle */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="type-mono-label text-[var(--muted)]">
            07 / 07 — optional online triage assistant + offline keyword classifier
          </span>
          <h1 className="type-h2 mt-0.5 font-grotesk text-[var(--fg)] lowercase">
            featherless.ai triage & rule-based fallback
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setForceOfflineTest((v) => !v)}
          className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 py-2 font-mono text-xs font-bold uppercase ${
            effectiveOnline
              ? 'border-[var(--line)] bg-[var(--accent-green)] text-[#0B0B0B]'
              : 'border-[var(--accent-coral)] bg-[var(--accent-coral)]/15 text-[var(--accent-coral)]'
          }`}
        >
          {effectiveOnline ? (
            <>
              <Wifi className="h-4 w-4" />
              <span>online mode (tap to test offline)</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4" />
              <span>offline mode — cloud ai disabled</span>
            </>
          )}
        </button>
      </div>

      {/* Mandatory Disclaimer Banner (§8.8) */}
      <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 font-mono text-xs text-[var(--fg)]">
        <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--accent-coral)]" />
        <span className="font-bold">{sanketContent.aiDisclaimer}.</span>
        <span className="text-[var(--muted)]">
          Core mesh messaging and SOS work 100% offline without AI.
        </span>
      </div>

      {/* One-Time Privacy Notice (§9) */}
      {!aiPrivacyAccepted && effectiveOnline && (
        <div className="nova-card mb-4 border-2 border-[var(--accent-lilac)] p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs leading-relaxed text-[var(--fg)]">
              {sanketContent.privacyNotice}
            </p>
            <button
              type="button"
              onClick={acceptAiPrivacyNotice}
              className="min-h-[44px] shrink-0 cursor-pointer rounded-full bg-[var(--fg)] px-4 py-2 font-mono text-xs font-bold text-[var(--bg)] uppercase"
            >
              i understand & accept
            </button>
          </div>
        </div>
      )}

      {/* Workbench */}
      <div className="nova-card space-y-4 p-5">
        <div>
          <label
            htmlFor="ai-input-text"
            className="type-mono-label block text-[var(--muted)]"
          >
            emergency message text to analyze
          </label>
          <textarea
            id="ai-input-text"
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 text-sm text-[var(--fg)]"
          />
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOfflineRuleClassify}
            className="flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 font-mono text-xs font-bold text-[var(--fg)] uppercase hover:border-[var(--fg)]"
          >
            <CheckCircle2 className="h-4 w-4 text-[var(--accent-green)]" />
            <span>run offline keyword classifier (0ms)</span>
          </button>

          <button
            type="button"
            disabled={!effectiveOnline || loading}
            onClick={() => void handleClassifyUrgency()}
            className="flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-full bg-[var(--fg)] px-4 py-2 font-mono text-xs font-bold text-[var(--bg)] uppercase disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            <span>classify urgency (online ai)</span>
          </button>

          <button
            type="button"
            disabled={!effectiveOnline || loading}
            onClick={() => void handleSummarize()}
            className="flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-full bg-[var(--fg)] px-4 py-2 font-mono text-xs font-bold text-[var(--bg)] uppercase disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Bot className="h-4 w-4" />
            <span>summarize (online ai)</span>
          </button>

          <button
            type="button"
            disabled={!effectiveOnline || loading}
            onClick={() => void handleRankAlerts()}
            className="flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-full bg-[var(--accent-lilac)] px-4 py-2 font-mono text-xs font-bold text-[#0B0B0B] uppercase disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ListOrdered className="h-4 w-4" />
            <span>rank {alerts.length} alerts</span>
          </button>

          <div className="flex items-center gap-1.5">
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              disabled={!effectiveOnline}
              aria-label="Target translation language"
              className="min-h-[48px] rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 font-mono text-xs text-[var(--fg)] disabled:opacity-40"
            >
              <option value="Hindi">Hindi</option>
              <option value="Tamil">Tamil</option>
              <option value="Telugu">Telugu</option>
              <option value="Spanish">Spanish</option>
              <option value="English">English</option>
            </select>
            <button
              type="button"
              disabled={!effectiveOnline || loading}
              onClick={() => void handleTranslate()}
              className="flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 font-mono text-xs font-bold text-[var(--fg)] uppercase disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Languages className="h-4 w-4" />
              <span>translate</span>
            </button>
          </div>
        </div>

        {/* Result Box */}
        {outputTitle && (
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-grotesk text-base font-bold text-[var(--fg)]">
                {outputTitle}
              </span>
              <span
                className={`rounded-full px-3 py-0.5 font-mono text-[10px] font-bold uppercase ${
                  outputSource === 'featherless'
                    ? 'bg-[var(--accent-blue)] text-white'
                    : 'bg-[var(--accent-lilac)] text-[#0B0B0B]'
                }`}
              >
                {outputSource === 'featherless'
                  ? `Featherless.ai (${featherlessModel.split('/').pop()})`
                  : sanketContent.offlineHintBadge}
              </span>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-[var(--fg)]">
              {outputBody}
            </p>

            {outputBullets.length > 0 && (
              <ul className="mt-2.5 space-y-1 font-mono text-xs text-[var(--muted)]">
                {outputBullets.map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex items-center gap-1.5 border-t border-[var(--line)] pt-2 font-mono text-[11px] text-[var(--muted)]">
              <AlertCircle className="h-3.5 w-3.5 text-[var(--accent-coral)]" />
              <span>{sanketContent.aiDisclaimer}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
