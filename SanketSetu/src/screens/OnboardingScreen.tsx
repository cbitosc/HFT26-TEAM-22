/**
 * Onboarding & Android Permissions Explainer Screen (src/screens/OnboardingScreen.tsx)
 * Per §2 & §8.2:
 * - Generates/displays Ed25519 + X25519 keys & short Node ID
 * - Sets responder display name & optional 4-digit PIN for encryption at rest
 * - Explains Android Nearby Connections permissions clearly
 * - Selects language, initial power mode, and optional Featherless AI key
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  Radio,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import {
  ANDROID_PERMISSIONS_LIST,
  AppScreenId,
  POWER_MODES_CONTENT,
  sanketContent,
} from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { PowerMode } from '../mesh/types';

interface OnboardingScreenProps {
  onCompleteNavigate: (screen: AppScreenId) => void;
}

export function OnboardingScreen({
  onCompleteNavigate,
}: OnboardingScreenProps) {
  const identity = useMeshStore((s) => s.identity);
  const currentLang = useMeshStore((s) => s.language);
  const metrics = useMeshStore((s) => s.metrics);
  const featherlessApiKey = useMeshStore((s) => s.featherlessApiKey);
  const completeOnboarding = useMeshStore((s) => s.completeOnboarding);

  const [displayName, setDisplayName] = useState(identity.displayName);
  const [pin, setPin] = useState('');
  const [language, setLanguage] = useState(currentLang);
  const [powerMode, setPowerMode] = useState<PowerMode>(metrics.powerMode);
  const [aiKey, setAiKey] = useState(featherlessApiKey);
  const [grantedPerms, setGrantedPerms] = useState<Record<string, boolean>>({
    'bt-scan': true,
    'bt-advertise': true,
    'bt-connect': true,
    'nearby-wifi': true,
    'fine-location': false,
    'fg-service': true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await completeOnboarding({
      displayName,
      pin: pin.trim() || undefined,
      language,
      powerMode,
      featherlessApiKey: aiKey,
    });
    onCompleteNavigate('home');
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pt-3 pb-28 sm:px-6">
      <div className="mb-6">
        <span className="type-mono-label text-[var(--muted)]">
          {sanketContent.onboarding.kicker}
        </span>
        <h1 className="type-h1 mt-1 font-grotesk text-[var(--fg)] lowercase">
          {sanketContent.onboarding.title}
        </h1>
        <p className="type-body mt-2 max-w-2xl text-[var(--muted)]">
          {sanketContent.onboarding.subtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Cryptographic Identity & Callsign */}
        <div className="nova-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-[var(--accent-blue)]" />
              <h2 className="font-grotesk text-lg font-bold text-[var(--fg)] lowercase">
                01. cryptographic node identity (ed25519 + x25519)
              </h2>
            </div>
            <span className="rounded-full bg-[var(--accent-green)] px-3 py-1 font-mono text-xs font-bold text-[#0B0B0B]">
              NODE ID #{identity.nodeId}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="onboard-name"
                className="type-mono-label block text-[var(--muted)]"
              >
                {sanketContent.onboarding.nameLabel}
              </label>
              <input
                id="onboard-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={sanketContent.onboarding.namePlaceholder}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 font-grotesk text-base text-[var(--fg)] focus:border-[var(--fg)] focus:outline-none"
                required
              />
            </div>

            <div>
              <label
                htmlFor="onboard-pin"
                className="type-mono-label block text-[var(--muted)]"
              >
                {sanketContent.onboarding.pinLabel}
              </label>
              <div className="relative mt-1.5">
                <input
                  id="onboard-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={sanketContent.onboarding.pinPlaceholder}
                  className="min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 font-mono text-base text-[var(--fg)] focus:border-[var(--fg)] focus:outline-none"
                />
                <Lock className="pointer-events-none absolute top-3.5 right-3.5 h-4 w-4 text-[var(--muted)]" />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono text-[11px] sm:grid-cols-2">
            <div>
              <span className="text-[var(--muted)]">Ed25519 Sign PubKey:</span>
              <div className="truncate text-[var(--fg)]">
                {identity.signPublicKeyB64}
              </div>
            </div>
            <div>
              <span className="text-[var(--muted)]">X25519 ECDH PubKey:</span>
              <div className="truncate text-[var(--fg)]">
                {identity.boxPublicKeyB64}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Android Nearby Mesh Permissions Explainer */}
        <div className="nova-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-[var(--accent-lilac)]" />
            <h2 className="font-grotesk text-lg font-bold text-[var(--fg)] lowercase">
              02. android p2p_cluster permissions explainer
            </h2>
          </div>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Sanket uses Google Nearby Connections (Bluetooth + BLE + Wi-Fi Direct) to form an offline mesh. Location is strictly optional and never sent silently.
          </p>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {ANDROID_PERMISSIONS_LIST.map((perm) => {
              const checked = Boolean(grantedPerms[perm.id]);
              return (
                <button
                  key={perm.id}
                  type="button"
                  onClick={() =>
                    setGrantedPerms((prev) => ({
                      ...prev,
                      [perm.id]: !prev[perm.id],
                    }))
                  }
                  className={`flex min-h-[68px] cursor-pointer items-start justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                    checked
                      ? 'border-[var(--fg)]/35 bg-[var(--surface-2)]'
                      : 'border-[var(--line)] bg-[var(--surface)] opacity-75'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-grotesk text-sm font-bold text-[var(--fg)] lowercase">
                        {perm.title}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                          perm.requiredForCore
                            ? 'bg-[var(--accent-lilac)] text-[#0B0B0B]'
                            : 'bg-[var(--surface)] text-[var(--muted)]'
                        }`}
                      >
                        {perm.requiredForCore ? 'core mesh' : 'opt-in only'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-[var(--muted)]">
                      {perm.purpose}
                    </p>
                  </div>
                  <CheckCircle2
                    className={`h-5 w-5 shrink-0 ${
                      checked
                        ? 'text-[var(--accent-blue)]'
                        : 'text-[var(--muted)]/40'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Power Mode & Language Selection */}
        <div className="nova-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Radio className="h-5 w-5 text-[var(--accent-green)]" />
            <h2 className="font-grotesk text-lg font-bold text-[var(--fg)] lowercase">
              03. radio duty-cycle & language
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {POWER_MODES_CONTENT.map((pm) => {
              const active = powerMode === pm.id;
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setPowerMode(pm.id)}
                  className={`flex min-h-[96px] cursor-pointer flex-col justify-between rounded-2xl border p-3.5 text-left transition-all ${
                    active
                      ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                      : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)]'
                  }`}
                >
                  <div className="font-grotesk text-base font-bold lowercase">
                    {pm.label}
                  </div>
                  <div className="mt-1 font-mono text-[11px] opacity-85">
                    {pm.scanWindowLabel}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="onboard-lang"
                className="type-mono-label block text-[var(--muted)]"
              >
                {sanketContent.onboarding.languageLabel}
              </label>
              <select
                id="onboard-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 font-grotesk text-sm text-[var(--fg)]"
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi (हिन्दी)</option>
                <option value="Tamil">Tamil (தமிழ்)</option>
                <option value="Telugu">Telugu (తెలుగు)</option>
                <option value="Spanish">Spanish (Español)</option>
                <option value="French">French (Français)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="onboard-ai-key"
                className="type-mono-label block text-[var(--muted)]"
              >
                optional featherless.ai api key (online triage only)
              </label>
              <input
                id="onboard-ai-key"
                type="password"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder="Leave blank for 100% offline rule-based triage"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 font-mono text-xs text-[var(--fg)]"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="flex min-h-[52px] cursor-pointer items-center gap-2 rounded-full bg-[var(--accent-green)] px-8 py-3 font-grotesk text-base font-bold text-[#0B0B0B] shadow-md transition-transform hover:scale-[1.01]"
          >
            <ShieldCheck className="h-5 w-5" />
            <span>{sanketContent.onboarding.completeCta}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
