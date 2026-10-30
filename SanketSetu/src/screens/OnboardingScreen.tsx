/**
 * Onboarding & Android Permissions Explainer Screen (src/screens/OnboardingScreen.tsx)
 * Per §2 & §8.2:
 * - Generates/displays Ed25519 + X25519 keys & short Node ID
 * - Sets responder display name & optional 4-digit PIN for encryption at rest
 * - Explains Android Nearby Connections permissions clearly
 * - Selects language, initial power mode, and optional Featherless AI key
 */

import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Lock,
  Radio,
  ShieldAlert,
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
import { MeshPermissionState } from '../transport/NearbyTransport';

interface OnboardingScreenProps {
  onCompleteNavigate: (screen: AppScreenId) => void;
}

/**
 * Maps this UI's permission-list ids to the real native permission-state keys returned by
 * NearbyMeshPlugin. Ids with no entry here aren't runtime-requestable: `fg-service`
 * (FOREGROUND_SERVICE) is a normal manifest permission granted at install time, and
 * `camera-qr` has no QR-scan feature wired up yet.
 */
const PERMISSION_ID_TO_STATE_KEY: Partial<
  Record<string, keyof MeshPermissionState>
> = {
  'bt-scan': 'bluetoothScan',
  'bt-advertise': 'bluetoothAdvertise',
  'bt-connect': 'bluetoothConnect',
  'nearby-wifi': 'nearbyWifi',
  'fine-location': 'fineLocation',
};

export function OnboardingScreen({
  onCompleteNavigate,
}: OnboardingScreenProps) {
  const identity = useMeshStore((s) => s.identity);
  const currentLang = useMeshStore((s) => s.language);
  const metrics = useMeshStore((s) => s.metrics);
  const featherlessApiKey = useMeshStore((s) => s.featherlessApiKey);
  const completeOnboarding = useMeshStore((s) => s.completeOnboarding);
  const permissionState = useMeshStore((s) => s.permissionState);
  const checkMeshPermissions = useMeshStore((s) => s.checkMeshPermissions);
  const requestMeshPermissions = useMeshStore((s) => s.requestMeshPermissions);
  const openAppSettings = useMeshStore((s) => s.openAppSettings);

  const [displayName, setDisplayName] = useState(identity.displayName);
  const [pin, setPin] = useState('');
  const [language, setLanguage] = useState(currentLang);
  const [powerMode, setPowerMode] = useState<PowerMode>(metrics.powerMode);
  const [aiKey, setAiKey] = useState(featherlessApiKey);
  const [requesting, setRequesting] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative) {
      void checkMeshPermissions();
    }
  }, [isNative, checkMeshPermissions]);

  const handleGrantAccess = async () => {
    setRequesting(true);
    try {
      await requestMeshPermissions();
    } finally {
      setRequesting(false);
    }
  };

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
        <h1 className="type-h1 mt-1 font-grotesk text-[var(--fg)]">
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
              <KeyRound className="h-5 w-5 text-[var(--verified-ink)]" />
              <h2 className="font-grotesk text-lg font-bold text-[var(--fg)]">
              Create your device identity
              </h2>
            </div>
            <span className="rounded-full bg-[var(--accent-green)] px-3 py-1 font-mono text-xs font-bold text-[var(--on-fill)]">
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

        {/* 2. Android Nearby Mesh Permissions — real OS grant state on native, explainer-only in browser */}
        <div className="nova-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-[var(--relay-ink)]" />
            <h2 className="font-grotesk text-lg font-bold text-[var(--fg)]">
              Nearby device permissions
            </h2>
          </div>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Sanket uses Google Nearby Connections (Bluetooth + BLE + Wi-Fi Direct) to form an offline mesh. Location is strictly optional and never sent silently.
          </p>

          {!isNative && (
            <p className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">
              Running in the browser preview — Android doesn't prompt for these here. Status below reflects what will be requested when this is installed as an Android app.
            </p>
          )}

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {ANDROID_PERMISSIONS_LIST.map((perm) => {
              const stateKey = PERMISSION_ID_TO_STATE_KEY[perm.id];
              // fg-service is a manifest (install-time) permission, not runtime-requestable —
              // always effectively granted. Unmapped ids (camera-qr) have no feature wired up yet.
              const granted = !isNative
                ? false
                : stateKey
                  ? Boolean(permissionState?.[stateKey])
                  : perm.id === 'fg-service';
              const applicable =
                stateKey === undefined || permissionState?.[stateKey] !== undefined || perm.id === 'fg-service';
              return (
                <div
                  key={perm.id}
                  className={`flex min-h-[68px] items-start justify-between gap-3 rounded-2xl border p-3.5 text-left ${
                    granted
                      ? 'border-[var(--fg)]/35 bg-[var(--surface-2)]'
                      : 'border-[var(--line)] bg-[var(--surface)] opacity-75'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-grotesk text-sm font-bold text-[var(--fg)]">
                        {perm.title}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                          perm.requiredForCore
                            ? 'bg-[var(--accent-lilac)] text-[var(--on-fill)]'
                            : 'bg-[var(--surface)] text-[var(--muted)]'
                        }`}
                      >
                        {perm.requiredForCore ? 'core mesh' : 'opt-in only'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-[var(--muted)]">
                      {perm.purpose}
                    </p>
                    {isNative && !applicable && (
                      <p className="mt-1 text-[10px] uppercase text-[var(--muted)]">
                        not applicable on this Android version
                      </p>
                    )}
                  </div>
                  <CheckCircle2
                    className={`h-5 w-5 shrink-0 ${
                      granted ? 'text-[var(--verified-ink)]' : 'text-[var(--muted)]/40'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {isNative && (
            <div className="mt-4 flex flex-col gap-2.5">
              {permissionState && !permissionState.allGranted && (
                <div className="flex items-start gap-2 rounded-xl border border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/10 p-3 text-xs text-[var(--fg)]">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--sos-ink)]" />
                  <span>
                    Some permissions are denied. The app still works — you'll see the simulated demo mesh — but it can't reach real nearby phones until core mesh permissions above are granted.
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => void handleGrantAccess()}
                  disabled={requesting}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-[var(--accent-lilac)] px-5 text-sm font-bold text-[var(--on-fill)] disabled:opacity-60"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {requesting ? 'requesting…' : 'grant access'}
                </button>
                <button
                  type="button"
                  onClick={() => void openAppSettings()}
                  className="flex min-h-[48px] items-center gap-2 rounded-full border border-[var(--line)] px-5 text-sm font-bold text-[var(--fg)]"
                >
                  <ExternalLink className="h-4 w-4" />
                  open settings
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. Power Mode & Language Selection */}
        <div className="nova-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Radio className="h-5 w-5 text-[var(--safe-ink)]" />
            <h2 className="font-grotesk text-lg font-bold text-[var(--fg)]">
              Power mode and language
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
                  <div className="font-grotesk text-base font-bold">
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
                placeholder="Leave blank to use the offline rule-based classifier"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 font-mono text-xs text-[var(--fg)]"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="flex min-h-[52px] cursor-pointer items-center gap-2 rounded-full bg-[var(--accent-green)] px-8 py-3 font-grotesk text-base font-bold text-[var(--on-fill)] shadow-md transition-transform hover:scale-[1.01]"
          >
            <ShieldCheck className="h-5 w-5" />
            <span>{sanketContent.onboarding.completeCta}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
