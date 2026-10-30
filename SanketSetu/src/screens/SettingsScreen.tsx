/**
 * Settings, Power Activity Meter, Verified Responder Cert Enrollment, Setu Gateway & QR Trust Screen (src/screens/SettingsScreen.tsx)
 * Per §5, §6, §8.9, §9.5, §9.6, §9.8, §9.9:
 * - Power mode selector (Active / Balanced / Saver) + Battery % simulator slider (with ≤5% Last-Gasp SOS trigger)
 * - Verified Responder Certificate Enrollment (`DEMO AUTHORITY` Ed25519 QR + Responder Group X25519 key for unsealing precise GPS)
 * - Gateway "Setu" Online Bridge (`DEMO`) with explicit user consent toggle
 * - Rescuer Locate BLE RSSI signal-strength finder (`EXPERIMENTAL`)
 * - Offline QR Scan-to-Trust & Key Fingerprint
 */

import React, { useEffect, useState } from 'react';
import { Toggle } from '../ui/Toggle';
import { soundEngine } from '../lib/audio';
import {
  Award,
  Battery,
  CheckCircle2,
  Compass,
  Globe,
  KeyRound,
  QrCode,
  Radio,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { POWER_MODES_CONTENT, sanketContent } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { LocationPrecision, PowerMode } from '../mesh/types';
import { generateDeterministicQrMatrix } from '../crypto/qr';
import {
  encodeResponderCertQrUri,
  getDemoAuthorityPublicKeyB64,
  issueResponderCertificate,
} from '../crypto/responderCert';

export function SettingsScreen() {
  const theme = useMeshStore((s) => s.theme);
  const setTheme = useMeshStore((s) => s.setTheme);
  const visuals3D = useMeshStore((s) => s.visuals3D);
  const setVisuals3D = useMeshStore((s) => s.setVisuals3D);
  const [soundMuted, setSoundMuted] = useState(() => soundEngine.isMuted());
  useEffect(() => soundEngine.subscribe(() => setSoundMuted(soundEngine.isMuted())), []);
  const identity = useMeshStore((s) => s.identity);
  const metrics = useMeshStore((s) => s.metrics);
  const outbox = useMeshStore((s) => s.outbox);
  const peers = useMeshStore((s) => s.peers);
  const channelKeySecret = useMeshStore((s) => s.channelKeySecret);
  const locationOptIn = useMeshStore((s) => s.locationOptIn);
  const featherlessApiKey = useMeshStore((s) => s.featherlessApiKey);
  const featherlessModel = useMeshStore((s) => s.featherlessModel);
  const myResponderCert = useMeshStore((s) => s.myResponderCert);
  const gatewayConsent = useMeshStore((s) => s.gatewayConsent);
  const bridgedGatewayIds = useMeshStore((s) => s.bridgedGatewayIds);

  const setDisplayName = useMeshStore((s) => s.setDisplayName);
  const setPowerMode = useMeshStore((s) => s.setPowerMode);
  const setBatteryLevel = useMeshStore((s) => s.setBatteryLevel);
  const setChannelKeySecret = useMeshStore((s) => s.setChannelKeySecret);
  const setLocationOptIn = useMeshStore((s) => s.setLocationOptIn);
  const setFeatherlessConfig = useMeshStore((s) => s.setFeatherlessConfig);
  const getMyTrustQrUri = useMeshStore((s) => s.getMyTrustQrUri);
  const verifyPeerViaQrUri = useMeshStore((s) => s.verifyPeerViaQrUri);
  const enrollAsVerifiedResponder = useMeshStore(
    (s) => s.enrollAsVerifiedResponder
  );
  const enrollViaCertQrUri = useMeshStore((s) => s.enrollViaCertQrUri);
  const clearResponderCert = useMeshStore((s) => s.clearResponderCert);
  const setGatewayConsent = useMeshStore((s) => s.setGatewayConsent);
  const bridgeQueuedSosToSetuGateway = useMeshStore(
    (s) => s.bridgeQueuedSosToSetuGateway
  );
  const clearAllLocalData = useMeshStore((s) => s.clearAllLocalData);

  const [nameInput, setNameInput] = useState(identity.displayName);
  const [channelInput, setChannelInput] = useState(channelKeySecret);
  const [qrScanInput, setQrScanInput] = useState('');
  const [qrScanFeedback, setQrScanFeedback] = useState<string | null>(null);
  const [certQrInput, setCertQrInput] = useState('');
  const [certFeedback, setCertFeedback] = useState<string | null>(null);
  const [aiKeyInput, setAiKeyInput] = useState(featherlessApiKey);
  const [aiModelInput, setAiModelInput] = useState(featherlessModel);
  const [savedNotice, setSavedNotice] = useState(false);

  const myQrUri = getMyTrustQrUri();
  const qrMatrix = generateDeterministicQrMatrix(myQrUri, 21);

  const demoIssuedCertUri = encodeResponderCertQrUri(
    issueResponderCertificate({
      subjectNodeId: identity.nodeId,
      subjectSignPubB64: identity.signPublicKeyB64,
      subjectDisplayName: identity.displayName,
      role: 'NDRF_MEDIC',
      organizationName: 'NDRF Field Rescue Unit (DEMO AUTHORITY)',
    })
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await setDisplayName(nameInput);
    setChannelKeySecret(channelInput);
    setFeatherlessConfig(aiKeyInput, aiModelInput);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleVerifyQr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrScanInput.trim()) return;
    const res = verifyPeerViaQrUri(qrScanInput.trim());
    setQrScanFeedback(res.message);
    if (res.ok) {
      setQrScanInput('');
    }
  };

  const handleVerifyCertQr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!certQrInput.trim()) return;
    const res = enrollViaCertQrUri(certQrInput.trim());
    setCertFeedback(res.message);
    if (res.ok) {
      setCertQrInput('');
    }
  };

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 px-4 pt-2 pb-28 sm:px-6">
      <div>
        <span className="type-mono-label text-[var(--muted)]">
          08 — node configuration, responder certificates, setu gateway & power
        </span>
        <h1 className="type-h2 mt-0.5 font-grotesk text-[var(--fg)] lowercase">
          sanket setu settings & cryptography
        </h1>
      </div>

      {/* Display & sound */}
      <div className="nova-card p-5">
        <h2 className="mb-2 text-lg font-bold text-[var(--fg)]">Display &amp; sound</h2>
        <div className="divide-y divide-[var(--line)]">
          <Toggle
            label="Dark mode"
            description="Saves battery on OLED screens."
            checked={theme === 'dark'}
            onChange={(on) => setTheme(on ? 'dark' : 'light')}
          />
          <Toggle
            label="3D visuals"
            description="Uses more battery. Always off on the SOS screen, in Saver mode, and with reduced motion."
            checked={visuals3D}
            onChange={setVisuals3D}
          />
          <Toggle
            label="Sounds"
            description="Short tones when an SOS is sent. Haptics work either way."
            checked={!soundMuted}
            onChange={(on) => soundEngine.setMuted(!on)}
          />
        </div>
      </div>

      {/* 1. Battery Efficiency, Honest Mesh Activity Meter & Last-Gasp SOS (§6 & §9.9) */}
      <div className="nova-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Battery className="h-5 w-5 text-[var(--safe-ink)]" />
            <h2 className="font-grotesk text-lg font-bold text-[var(--fg)] lowercase">
              01. battery power modes, activity meter & last-gasp sos
            </h2>
          </div>
          <span className="rounded-full bg-[var(--accent-green)] px-3 py-1 font-mono text-xs font-bold text-[var(--on-fill)]">
            {metrics.powerMode.toUpperCase()} · {metrics.scanDutyCyclePct}% SCAN DUTY
          </span>
        </div>

        {/* Battery Level Simulator Slider (to test <30% Balanced, <15% Saver, and ≤5% Last-Gasp SOS) */}
        <div className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
            <span>
              Device Battery Level (&lt;30% Balanced, &lt;15% Saver, ≤5% auto-triggers Last-Gasp SOS)
            </span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--fg)]">
                {metrics.batteryPct}%
              </span>
              <button
                type="button"
                onClick={() => setBatteryLevel(4, false)}
                className="cursor-pointer rounded-full bg-[var(--accent-coral)] px-2.5 py-0.5 text-[10px] font-bold text-white uppercase"
              >
                test ≤5% last-gasp sos
              </button>
            </div>
          </div>
          <input
            type="range"
            min={3}
            max={100}
            value={metrics.batteryPct}
            onChange={(e) => setBatteryLevel(Number(e.target.value), false)}
            className="mt-2 w-full accent-[var(--accent-blue)]"
            aria-label="Simulate Battery Percentage"
          />
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {POWER_MODES_CONTENT.map((pm) => {
            const active = metrics.powerMode === pm.id;
            return (
              <button
                key={pm.id}
                type="button"
                onClick={() => setPowerMode(pm.id as PowerMode)}
                className={`flex min-h-[104px] cursor-pointer flex-col justify-between rounded-2xl border p-3.5 text-left transition-all ${
                  active
                    ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                    : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)]'
                }`}
              >
                <div className="font-grotesk text-base font-bold lowercase">
                  {pm.label}
                </div>
                <div className="font-mono text-[10px] opacity-85">
                  {pm.scanWindowLabel}
                </div>
                <div className="font-mono text-[10px] opacity-75">
                  {pm.orbPolicyLabel}
                </div>
              </button>
            );
          })}
        </div>

        {/* Real Measured Mesh Counters */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono">
            <div className="text-[10px] text-[var(--muted)] uppercase">
              packets sent / recv
            </div>
            <div className="mt-1 text-base font-bold text-[var(--fg)]">
              {metrics.packetsSent} / {metrics.packetsReceived}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono">
            <div className="text-[10px] text-[var(--muted)] uppercase">
              packets relayed
            </div>
            <div className="mt-1 text-base font-bold text-[var(--relay-ink)]">
              {metrics.packetsRelayed}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono">
            <div className="text-[10px] text-[var(--muted)] uppercase">
              dedup suppressed
            </div>
            <div className="mt-1 text-base font-bold text-[var(--verified-ink)]">
              {metrics.packetsSuppressedDuplicate}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono">
            <div className="text-[10px] text-[var(--muted)] uppercase">
              invalid sigs dropped
            </div>
            <div className="mt-1 text-base font-bold text-[var(--sos-ink)]">
              {metrics.packetsDroppedInvalidSig}
            </div>
          </div>
        </div>
      </div>

      {/* 2. VERIFIED RESPONDER CERTIFICATE ENROLLMENT (§5, §9.2, §9.5) */}
      <div className="nova-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-[var(--verified-ink)]" />
            <h2 className="font-grotesk text-lg font-bold text-[var(--fg)] lowercase">
              02. verified responder certificate ({sanketContent.demoAuthorityBadge})
            </h2>
          </div>
          {myResponderCert ? (
            <span className="rounded-full bg-[var(--accent-green)] px-3 py-1 font-mono text-xs font-bold text-[var(--on-fill)]">
              ✔ ENROLLED: {myResponderCert.role}
            </span>
          ) : (
            <span className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 font-mono text-xs font-bold text-[var(--muted)]">
              STANDARD CIVILIAN NODE
            </span>
          )}
        </div>

        <p className="text-xs text-[var(--muted)]">
          Responders enroll via an Authority-signed Ed25519 certificate QR (`DEMO AUTHORITY` pubkey: <code className="font-mono text-[var(--fg)]">{getDemoAuthorityPublicKeyB64().slice(0, 16)}…</code>). Enrolled responders attach their certificate to `SOS_ACK` packets (rendering a verified `✔` badge on the victim’s screen) and receive the Responder Group X25519 key to unseal exact 5-decimal SOS coordinates.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              enrollAsVerifiedResponder(
                'NDRF_MEDIC',
                'NDRF Field Rescue Unit (DEMO AUTHORITY)'
              );
              setCertFeedback(
                'Enrolled with DEMO AUTHORITY Responder Certificate (NDRF_MEDIC). Sealed precise SOS coordinates are now unlocked.'
              );
            }}
            className="min-h-[42px] cursor-pointer rounded-full bg-[var(--accent-green)] px-4 py-2 font-mono text-xs font-bold text-[var(--on-fill)] uppercase"
          >
            enroll as verified ndrf medic ✔
          </button>
          <button
            type="button"
            onClick={() => setCertQrInput(demoIssuedCertUri)}
            className="min-h-[42px] cursor-pointer rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 font-mono text-xs font-bold text-[var(--fg)] uppercase"
          >
            generate demo authority cert qr uri
          </button>
          {myResponderCert && (
            <button
              type="button"
              onClick={() => {
                clearResponderCert();
                setCertFeedback('Reverted to Standard Civilian Node.');
              }}
              className="min-h-[42px] cursor-pointer rounded-full border border-[var(--accent-coral)] px-4 py-2 font-mono text-xs font-bold text-[var(--sos-ink)] uppercase"
            >
              revoke responder cert
            </button>
          )}
        </div>

        <form onSubmit={handleVerifyCertQr} className="mt-3 flex gap-2">
          <input
            type="text"
            value={certQrInput}
            onChange={(e) => setCertQrInput(e.target.value)}
            placeholder="Paste sanket://responder-cert?... URI to verify & enroll"
            className="min-h-[44px] flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 font-mono text-xs text-[var(--fg)]"
          />
          <button
            type="submit"
            className="min-h-[44px] cursor-pointer rounded-full bg-[var(--fg)] px-4 font-mono text-xs font-bold text-[var(--bg)] uppercase"
          >
            verify & enroll
          </button>
        </form>
        {certFeedback && (
          <div className="mt-2 font-mono text-xs text-[var(--verified-ink)]">
            {certFeedback}
          </div>
        )}
      </div>

      {/* 3. GATEWAY "SETU" ONLINE BRIDGE (§9.6 — DEMO) & RESCUER LOCATE BLE RSSI (§9.8 — EXPERIMENTAL) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="nova-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-[var(--verified-ink)]" />
                <h2 className="font-grotesk text-base font-bold text-[var(--fg)] lowercase">
                  gateway “setu” bridge
                </h2>
              </div>
              <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--verified-ink)] uppercase">
                {sanketContent.demoGatewayBadge}
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              When any node regains internet connectivity, it can forward queued Ed25519-signed SOS beacons to a public emergency incident endpoint with explicit user consent.
            </p>
          </div>

          <div className="mt-4 space-y-2.5 border-t border-[var(--line)] pt-3">
            <label className="flex cursor-pointer items-center justify-between font-mono text-xs text-[var(--fg)]">
              <span>User Consent to Bridge Signed SOS Online</span>
              <input
                type="checkbox"
                checked={gatewayConsent}
                onChange={(e) => setGatewayConsent(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent-blue)]"
              />
            </label>
            <button
              type="button"
              disabled={!gatewayConsent}
              onClick={() => bridgeQueuedSosToSetuGateway()}
              className="min-h-[42px] w-full cursor-pointer rounded-full bg-[var(--fg)] px-4 py-2 font-mono text-xs font-bold text-[var(--bg)] uppercase disabled:opacity-40"
            >
              {bridgedGatewayIds.length > 0
                ? `✔ ${bridgedGatewayIds.length} SOS Bridged to Setu Cloud (DEMO)`
                : 'Bridge Queued Signed SOS Now (DEMO)'}
            </button>
          </div>
        </div>

        {/* Rescuer Locate BLE RSSI Signal-Strength Meter (§9.8 — EXPERIMENTAL) */}
        <div className="nova-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-[var(--sos-ink)]" />
                <h2 className="font-grotesk text-base font-bold text-[var(--fg)] lowercase">
                  rescuer locate (last 20m)
                </h2>
              </div>
              <span className="rounded bg-[var(--accent-coral)]/15 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--sos-ink)] uppercase">
                {sanketContent.experimentalBadge}
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Uses smoothed BLE RSSI signal-strength bars to guide field rescuers within the final 20 meters of an active SOS beacon when GPS is obstructed indoors.
            </p>
          </div>

          <div className="mt-4 space-y-2 border-t border-[var(--line)] pt-3">
            {peers.slice(0, 2).map((p) => {
              const barPct = Math.max(
                15,
                Math.min(100, Math.round(((p.rssi + 95) / 55) * 100))
              );
              return (
                <div key={p.nodeId} className="font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="font-bold text-[var(--fg)]">
                      {p.displayName}
                    </span>
                    <span className="text-[var(--muted)]">
                      {p.rssi} dBm (~{Math.max(2, Math.round((100 - barPct) * 0.25))}m)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-full bg-[var(--accent-green)]"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Offline QR Scan-to-Trust & Key Fingerprint (§5) */}
      <div className="nova-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <QrCode className="h-5 w-5 text-[var(--verified-ink)]" />
          <h2 className="font-grotesk text-lg font-bold text-[var(--fg)] lowercase">
            03. offline qr scan-to-trust & key verification
          </h2>
        </div>

        <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-12">
          {/* Deterministic Offline SVG QR Code */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-white p-4 md:col-span-4">
            <svg
              viewBox="0 0 21 21"
              className="h-36 w-36"
              shapeRendering="crispEdges"
              aria-label="Node Trust QR Matrix"
            >
              {qrMatrix.map((row, rIdx) =>
                row.map((cell, cIdx) =>
                  cell ? (
                    <rect
                      key={`${rIdx}-${cIdx}`}
                      x={cIdx}
                      y={rIdx}
                      width={1}
                      height={1}
                      fill="var(--on-fill)"
                    />
                  ) : null
                )
              )}
            </svg>
            <span className="mt-2 font-mono text-[10px] font-bold text-[var(--on-fill)]">
              NODE #{identity.nodeId}
            </span>
          </div>

          <div className="space-y-3 md:col-span-8">
            <div>
              <span className="type-mono-label text-[var(--muted)]">
                your shareable trust uri (sanket://trust)
              </span>
              <input
                type="text"
                readOnly
                value={myQrUri}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 font-mono text-xs text-[var(--fg)]"
              />
            </div>

            <form onSubmit={handleVerifyQr} className="space-y-2">
              <label
                htmlFor="verify-qr-uri"
                className="type-mono-label block text-[var(--muted)]"
              >
                paste or scan peer sanket://trust uri to mark verified
              </label>
              <div className="flex gap-2">
                <input
                  id="verify-qr-uri"
                  type="text"
                  value={qrScanInput}
                  onChange={(e) => setQrScanInput(e.target.value)}
                  placeholder="sanket://trust?id=...&name=...&sp=...&bp=..."
                  className="min-h-[48px] flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 font-mono text-xs text-[var(--fg)]"
                />
                <button
                  type="submit"
                  className="flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-full bg-[var(--accent-blue)] px-4 font-mono text-xs font-bold text-white uppercase"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>verify peer</span>
                </button>
              </div>
              {qrScanFeedback && (
                <div className="font-mono text-xs text-[var(--verified-ink)]">
                  {qrScanFeedback}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* 5. Callsign, Safe-Circle Channel Key, Location & Optional Featherless AI Key */}
      <form onSubmit={handleSaveProfile} className="nova-card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[var(--relay-ink)]" />
            <h2 className="font-grotesk text-lg font-bold text-[var(--fg)] lowercase">
              04. identity, safe-circle key & optional featherless ai
            </h2>
          </div>
          {savedNotice && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-green)] px-3 py-1 font-mono text-xs font-bold text-[var(--on-fill)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>saved</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="settings-name"
              className="type-mono-label block text-[var(--muted)]"
            >
              display name / callsign
            </label>
            <input
              id="settings-name"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 text-sm text-[var(--fg)]"
            />
          </div>

          <div>
            <label
              htmlFor="settings-channel-key"
              className="type-mono-label block text-[var(--muted)]"
            >
              safe-circle emergency channel passphrase (blank = public default)
            </label>
            <input
              id="settings-channel-key"
              type="text"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              placeholder="Default public emergency mesh channel key"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 font-mono text-xs text-[var(--fg)]"
            />
          </div>

          <div>
            <label
              htmlFor="settings-ai-key"
              className="type-mono-label block text-[var(--muted)]"
            >
              featherless.ai api key (optional, online-only)
            </label>
            <input
              id="settings-ai-key"
              type="password"
              value={aiKeyInput}
              onChange={(e) => setAiKeyInput(e.target.value)}
              placeholder="Enter Featherless Bearer key..."
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 font-mono text-xs text-[var(--fg)]"
            />
          </div>

          <div>
            <label
              htmlFor="settings-ai-model"
              className="type-mono-label block text-[var(--muted)]"
            >
              featherless model id
            </label>
            <input
              id="settings-ai-model"
              type="text"
              value={aiModelInput}
              onChange={(e) => setAiModelInput(e.target.value)}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 font-mono text-xs text-[var(--fg)]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[var(--muted)]">
              Default SOS Location:
            </span>
            {(['disabled', 'coarse', 'precise'] as LocationPrecision[]).map(
              (loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocationOptIn(loc)}
                  className={`min-h-[38px] cursor-pointer rounded-full border px-3 font-mono text-xs font-bold uppercase ${
                    locationOptIn === loc
                      ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                      : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)]'
                  }`}
                >
                  {loc}
                </button>
              )
            )}
          </div>

          <button
            type="submit"
            className="min-h-[48px] cursor-pointer rounded-full bg-[var(--accent-green)] px-6 py-2.5 font-grotesk text-sm font-bold text-[var(--on-fill)]"
          >
            save configuration
          </button>
        </div>
      </form>

      {/* 6. Store-and-Forward Outbox Viewer & Clear Data */}
      <div className="nova-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-[var(--sos-ink)]" />
            <h2 className="font-grotesk text-lg font-bold text-[var(--fg)] lowercase">
              05. persistent store-and-forward outbox ({outbox.length} packets)
            </h2>
          </div>

          <button
            type="button"
            onClick={() => void clearAllLocalData()}
            className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border border-[var(--accent-coral)] px-4 py-1.5 font-mono text-xs font-bold text-[var(--sos-ink)] uppercase hover:bg-[var(--accent-coral)] hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>reset & regenerate identity</span>
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {outbox.length === 0 ? (
            <p className="font-mono text-xs text-[var(--muted)]">
              Outbox empty — all direct messages have received signed end-to-end ACKs.
            </p>
          ) : (
            outbox.map((entry) => (
              <div
                key={entry.packet.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2 font-mono text-xs"
              >
                <span>
                  #{entry.packet.id.slice(0, 10)} · {entry.packet.type} (P
                  {entry.packet.prio}) → {entry.packet.dst}
                </span>
                <span className="text-[var(--muted)]">
                  Attempts: {entry.attempts} · ACKs: {entry.acknowledgedBy.length}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
