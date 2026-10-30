/**
 * SOS Emergency Broadcast Composer & Closed-Loop Status Tracker Screen (src/screens/SOSComposerScreen.tsx)
 * Per §5, §8.5, §8.6, §8.8, §9.1, §9.2, §9.4:
 * - Closed-Loop SOS Status Tracker:
 *   `Broadcast -> Reached N nodes (lower bound) -> Acknowledged -> Responder en route`
 *   with responder identity, hop distance, and `✔ Verified Responder` vs `unverified` badge.
 * - Quick-SOS Multilingual Pictogram Picker (English, Hindi, Telugu, Tamil) — 100% offline.
 * - Opt-in location precision toggle (disabled / coarse / precise) — when `precise` is chosen,
 *   exact 5-decimal GPS coordinates are sealed (`nacl.box`) to the Responder Group X25519 public key.
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Languages,
  Lock,
  MapPin,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  AppScreenId,
  PictogramLanguage,
  QUICK_SOS_PICTOGRAMS,
  SOS_CATEGORIES,
} from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { LocationPrecision, SOSCategoryId } from '../mesh/types';
import { soundEngine } from '../lib/audio';

interface SOSComposerScreenProps {
  onNavigate: (screen: AppScreenId) => void;
}

export function SOSComposerScreen({ onNavigate }: SOSComposerScreenProps) {
  const broadcastSOS = useMeshStore((s) => s.broadcastSOS);
  const alerts = useMeshStore((s) => s.alerts);
  const activeSosId = useMeshStore((s) => s.activeSosId);
  const triggerVirtualResponderAck = useMeshStore(
    (s) => s.triggerVirtualResponderAck
  );
  const locationOptIn = useMeshStore((s) => s.locationOptIn);
  const simulatedLat = useMeshStore((s) => s.simulatedLat);
  const simulatedLng = useMeshStore((s) => s.simulatedLng);

  const [selectedCategory, setSelectedCategory] =
    useState<SOSCategoryId>('medical');
  const [selectedPictogramId, setSelectedPictogramId] = useState<
    string | undefined
  >('medical_trauma');
  const [pictoLang, setPictoLang] = useState<PictogramLanguage>('English');
  const [text, setText] = useState<string>(SOS_CATEGORIES[0].templateText);
  const [headcount, setHeadcount] = useState<number>(2);
  const [locPrecision, setLocPrecision] =
    useState<LocationPrecision>(locationOptIn);

  // Find active SOS or most recent SOS to display in the Closed-Loop SOS Status Tracker
  const trackedSos =
    alerts.find((a) => a.id === activeSosId) ?? alerts[0] ?? null;

  const handleSelectCategory = (catId: SOSCategoryId) => {
    setSelectedCategory(catId);
    const found = SOS_CATEGORIES.find((c) => c.id === catId);
    if (found) {
      setText(found.templateText);
    }
  };

  const handleSelectPictogram = (pictoId: string) => {
    const picto = QUICK_SOS_PICTOGRAMS.find((p) => p.id === pictoId);
    if (!picto) return;
    setSelectedPictogramId(picto.id);
    setSelectedCategory(picto.category);
    setText(picto.localized[pictoLang].template);
  };

  const handleLanguageSwitch = (lang: PictogramLanguage) => {
    setPictoLang(lang);
    if (selectedPictogramId) {
      const picto = QUICK_SOS_PICTOGRAMS.find(
        (p) => p.id === selectedPictogramId
      );
      if (picto) {
        setText(picto.localized[lang].template);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    soundEngine.playSelectChord();
    await broadcastSOS({
      category: selectedCategory,
      text: text.trim(),
      headcount,
      locationPrecision: locPrecision,
      pictogramId: selectedPictogramId,
    });
  };

  const reachedCount = trackedSos ? trackedSos.reachedNodeIds.length : 0;
  const responderAcks = trackedSos ? trackedSos.responderAcks : [];
  const hasAcknowledged = responderAcks.length > 0;
  const enRouteResponders = responderAcks.filter(
    (r) => r.status === 'RESPONDING'
  );
  const hasEnRoute = enRouteResponders.length > 0;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-2 pb-28 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="type-mono-label text-[var(--accent-coral)]">
            03 / 08 — priority 0 emergency broadcast & closed-loop tracker
          </span>
          <h1 className="type-h2 mt-0.5 font-grotesk text-[var(--fg)] lowercase">
            sanket setu sos beacon & responder loop
          </h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Channel-encrypted (XSalsa20-Poly1305) + Ed25519 signed. Exact GPS coordinates are sealed with an ephemeral X25519 box to the Verified Responder Group public key.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('alerts')}
          className="min-h-[42px] cursor-pointer rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 font-mono text-xs font-bold text-[var(--fg)] uppercase hover:bg-[var(--surface-2)]"
        >
          open all alerts ({alerts.length}) →
        </button>
      </div>

      {/* CLOSED-LOOP SOS STATUS TRACKER (§8.6 & §9.1) */}
      {trackedSos && (
        <div className="nova-card mb-5 border-2 border-[var(--accent-coral)]/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-[var(--accent-coral)]" />
              <span className="font-mono text-xs font-bold tracking-wider text-[var(--accent-coral)] uppercase">
                closed-loop sos status tracker · packet #{trackedSos.id.slice(0, 8)}
              </span>
              {trackedSos.isLastGasp && (
                <span className="rounded-full bg-[var(--accent-coral)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-white uppercase">
                  LAST-GASP ≤5% BATTERY BEACON
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  void triggerVirtualResponderAck(
                    trackedSos.id,
                    'ACKNOWLEDGED',
                    true
                  )
                }
                className="min-h-[34px] cursor-pointer rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 font-mono text-[10px] font-bold text-[var(--fg)] uppercase hover:border-[var(--fg)]"
              >
                + sim verified ack
              </button>
              <button
                type="button"
                onClick={() =>
                  void triggerVirtualResponderAck(
                    trackedSos.id,
                    'RESPONDING',
                    true
                  )
                }
                className="min-h-[34px] cursor-pointer rounded-full bg-[var(--accent-green)] px-3 py-1 font-mono text-[10px] font-bold text-[#0B0B0B] uppercase"
              >
                + sim verified medic en route ✔
              </button>
              <button
                type="button"
                onClick={() =>
                  void triggerVirtualResponderAck(
                    trackedSos.id,
                    'ACKNOWLEDGED',
                    false
                  )
                }
                className="min-h-[34px] cursor-pointer rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 font-mono text-[10px] font-bold text-[var(--muted)] uppercase"
              >
                + sim unverified ack
              </button>
            </div>
          </div>

          {/* 4-Stage Pipeline */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {/* Stage 1: Broadcast */}
            <div className="rounded-2xl border border-[var(--accent-coral)] bg-[var(--accent-coral)]/10 p-3">
              <div className="flex items-center justify-between font-mono text-[10px] font-bold text-[var(--accent-coral)] uppercase">
                <span>stage 01</span>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
              <div className="mt-1 font-grotesk text-sm font-bold text-[var(--fg)] lowercase">
                broadcasted
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                Priority 0 · TTL 12 · Ed25519 Signed
              </div>
            </div>

            {/* Stage 2: Reached N nodes */}
            <div
              className={`rounded-2xl border p-3 ${
                reachedCount > 0
                  ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10'
                  : 'border-[var(--line)] bg-[var(--surface-2)] opacity-70'
              }`}
            >
              <div className="flex items-center justify-between font-mono text-[10px] font-bold text-[var(--accent-blue)] uppercase">
                <span>stage 02</span>
                <span>{reachedCount} NODES</span>
              </div>
              <div className="mt-1 font-grotesk text-sm font-bold text-[var(--fg)] lowercase">
                reached {reachedCount} node{reachedCount === 1 ? '' : 's'}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                Signed receipt lower bound
              </div>
            </div>

            {/* Stage 3: Acknowledged */}
            <div
              className={`rounded-2xl border p-3 ${
                hasAcknowledged
                  ? 'border-[var(--accent-lilac)] bg-[var(--accent-lilac)]/20'
                  : 'border-[var(--line)] bg-[var(--surface-2)] opacity-70'
              }`}
            >
              <div className="flex items-center justify-between font-mono text-[10px] font-bold text-[var(--fg)] uppercase">
                <span>stage 03</span>
                <span>{responderAcks.length} ACK(S)</span>
              </div>
              <div className="mt-1 font-grotesk text-sm font-bold text-[var(--fg)] lowercase">
                {hasAcknowledged ? 'acknowledged' : 'awaiting ack'}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                {hasAcknowledged
                  ? `Signed SOS_ACK received`
                  : 'Outbox repeating w/ backoff'}
              </div>
            </div>

            {/* Stage 4: Responder En Route */}
            <div
              className={`rounded-2xl border p-3 ${
                hasEnRoute
                  ? 'border-[var(--fg)] bg-[var(--accent-green)] text-[#0B0B0B]'
                  : 'border-[var(--line)] bg-[var(--surface-2)] opacity-70'
              }`}
            >
              <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase">
                <span>stage 04</span>
                <span>{hasEnRoute ? 'ACTIVE ✔' : 'PENDING'}</span>
              </div>
              <div className="mt-1 font-grotesk text-sm font-bold lowercase">
                {hasEnRoute ? 'responder en route' : 'awaiting dispatch'}
              </div>
              <div className="mt-0.5 font-mono text-[10px] opacity-80">
                {hasEnRoute
                  ? `${enRouteResponders[0].responderName} (${enRouteResponders[0].hops} hops)`
                  : 'Waiting for responder team'}
              </div>
            </div>
          </div>

          {/* Responder Acks list with ✔ Verified Responder vs Unverified badge */}
          {responderAcks.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
              <div className="font-mono text-[10px] font-bold text-[var(--muted)] uppercase">
                received signed responder acknowledgements (sos_ack):
              </div>
              {responderAcks.map((ack) => (
                <div
                  key={ack.ackPacketId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-grotesk font-bold text-[var(--fg)]">
                      {ack.responderName}
                    </span>
                    {ack.verifiedCert ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-green)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[#0B0B0B]">
                        <ShieldCheck className="h-3 w-3" />
                        <span>✔ VERIFIED ({ack.certRole || 'RESPONDER'})</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--muted)] uppercase">
                        <ShieldAlert className="h-3 w-3 text-[var(--accent-coral)]" />
                        <span>unverified</span>
                      </span>
                    )}
                    <span className="rounded bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent-blue)] uppercase">
                      {ack.status} · {ack.hops} hop{ack.hops === 1 ? '' : 's'}
                    </span>
                  </div>
                  {ack.note && (
                    <span className="font-mono text-[11px] text-[var(--muted)]">
                      “{ack.note}”
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 1. QUICK-SOS MULTILINGUAL PICTOGRAM PICKER (§8.8 & §9.4) */}
        <div className="nova-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-[var(--accent-coral)]" />
              <span className="type-mono-label text-[var(--muted)]">
                01. quick-sos multilingual pictograms (offline · zero typing required)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                ['English', 'Hindi', 'Telugu', 'Tamil'] as PictogramLanguage[]
              ).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => handleLanguageSwitch(lang)}
                  className={`min-h-[34px] cursor-pointer rounded-full px-3 py-1 font-mono text-xs font-bold transition-colors ${
                    pictoLang === lang
                      ? 'bg-[var(--fg)] text-[var(--bg)]'
                      : 'border border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)]'
                  }`}
                >
                  {lang === 'Hindi'
                    ? 'हिन्दी (HI)'
                    : lang === 'Telugu'
                      ? 'తెలుగు (TE)'
                      : lang === 'Tamil'
                        ? 'தமிழ் (TA)'
                        : 'English (EN)'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {QUICK_SOS_PICTOGRAMS.map((picto) => {
              const isSelected = selectedPictogramId === picto.id;
              const loc = picto.localized[pictoLang];
              return (
                <button
                  key={picto.id}
                  type="button"
                  onClick={() => handleSelectPictogram(picto.id)}
                  className={`flex min-h-[76px] cursor-pointer flex-col justify-between rounded-2xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? 'border-[var(--accent-coral)] bg-[var(--accent-coral)] text-white shadow-sm'
                      : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)] hover:border-[var(--fg)]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl" aria-hidden="true">
                      {picto.glyph}
                    </span>
                    <span className="font-mono text-[10px] font-bold uppercase opacity-80">
                      {picto.category}
                    </span>
                  </div>
                  <div className="mt-1 font-grotesk text-sm font-bold">
                    {loc.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Category Selector */}
        <div className="nova-card p-4">
          <div className="type-mono-label mb-3 text-[var(--muted)]">
            02. emergency category tag
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {SOS_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`flex min-h-[54px] cursor-pointer flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
                    isSelected
                      ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                      : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)]'
                  }`}
                >
                  <span className="font-mono text-[9px] font-bold uppercase opacity-75">
                    {cat.shortTag}
                  </span>
                  <span className="font-grotesk text-xs font-bold lowercase">
                    {cat.label.split(' / ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Emergency Message Text & Headcount */}
        <div className="nova-card p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-8">
              <label
                htmlFor="sos-text"
                className="type-mono-label block text-[var(--muted)]"
              >
                03. situation details (≤ 500 chars · populated by pictogram or custom)
              </label>
              <textarea
                id="sos-text"
                rows={3}
                maxLength={500}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 text-sm text-[var(--fg)] focus:border-[var(--fg)] focus:outline-none"
                required
              />
              <div className="mt-1 text-right font-mono text-[10px] text-[var(--muted)]">
                {text.length} / 500 chars
              </div>
            </div>

            <div className="flex flex-col justify-between sm:col-span-4">
              <div>
                <span className="type-mono-label block text-[var(--muted)]">
                  04. people affected (headcount)
                </span>
                <div className="mt-2 flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-2">
                  <button
                    type="button"
                    onClick={() => setHeadcount((h) => Math.max(1, h - 1))}
                    className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] font-mono text-lg font-bold text-[var(--fg)]"
                    aria-label="Decrease headcount"
                  >
                    -
                  </button>
                  <div className="flex items-center gap-1.5 font-grotesk text-2xl font-bold text-[var(--fg)]">
                    <Users className="h-5 w-5 text-[var(--muted)]" />
                    <span>{headcount}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHeadcount((h) => Math.min(99, h + 1))}
                    className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] font-mono text-lg font-bold text-[var(--fg)]"
                    aria-label="Increase headcount"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Opt-In Location Privacy Control with Responder-Key Sealing (§5 & §9.2) */}
        <div className="nova-card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[var(--accent-blue)]" />
              <span className="type-mono-label text-[var(--muted)]">
                05. location privacy & responder-sealed gps (§5 & §9.2)
              </span>
            </div>
            <span className="font-mono text-xs text-[var(--fg)]">
              {locPrecision === 'disabled'
                ? 'Coordinates OMITTED'
                : locPrecision === 'coarse'
                  ? `Coarse (~1km): ${simulatedLat.toFixed(2)}, ${simulatedLng.toFixed(2)}`
                  : `Coarse ${simulatedLat.toFixed(2)}, ${simulatedLng.toFixed(2)} + Sealed Exact (${simulatedLat.toFixed(5)}, ${simulatedLng.toFixed(5)})`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['disabled', 'coarse', 'precise'] as LocationPrecision[]).map(
              (mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLocPrecision(mode)}
                  className={`min-h-[48px] cursor-pointer rounded-xl border font-mono text-xs font-bold uppercase transition-colors ${
                    locPrecision === mode
                      ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                      : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)]'
                  }`}
                >
                  {mode === 'disabled'
                    ? 'No Location'
                    : mode === 'coarse'
                      ? 'Coarse (~1km)'
                      : 'Precise (Responder-Sealed)'}
                </button>
              )
            )}
          </div>

          {locPrecision === 'precise' && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 font-mono text-xs text-[var(--fg)]">
              <Lock className="h-4 w-4 shrink-0 text-[var(--accent-blue)]" />
              <span>
                <strong>Privacy Guarantee:</strong> General mesh relay nodes see only coarse (~1km) coordinates ({simulatedLat.toFixed(2)}, {simulatedLng.toFixed(2)}). Exact 5-decimal GPS ({simulatedLat.toFixed(5)}, {simulatedLng.toFixed(5)}) is sealed with an ephemeral X25519 box to the Verified Responder Group public key.
              </span>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="flex min-h-[58px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-full bg-[var(--accent-coral)] px-6 py-4 font-grotesk text-base font-bold text-white shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          <RadioTower className="h-5 w-5" />
          <span>confirm & broadcast priority-0 sos beacon</span>
          <AlertTriangle className="h-5 w-5" />
        </button>
      </form>
    </section>
  );
}
