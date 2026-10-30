/**
 * Safety Check, Family/Group Circles & Signed Hazard Reports Screen (src/screens/CirclesSafetyScreen.tsx)
 * Per §8.9, §8.10, §8.11 & §9.3:
 * - One-tap "I'm Safe" (`SAFE` packet) check-in broadcast that propagates across the mesh and syncs via `SYNC_INV`.
 * - Family/Group Circles roster (`Safe` / `Needs Assistance` / `Not-Heard-From`) with QR key fingerprint.
 * - Signed Hazard Reports (`flood`, `collapse`, `fire`, `blocked_road`) with TTL expiry.
 */

import React, { useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  HeartHandshake,
  Plus,
  Radio,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AppScreenId, HAZARD_CATEGORIES } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { HazardCategory } from '../mesh/types';
import { soundEngine } from '../lib/audio';

interface CirclesSafetyScreenProps {
  onNavigate: (screen: AppScreenId) => void;
}

export function CirclesSafetyScreen({ onNavigate }: CirclesSafetyScreenProps) {
  const circles = useMeshStore((s) => s.circles);
  const hazards = useMeshStore((s) => s.hazards);
  const peers = useMeshStore((s) => s.peers);
  const sendImSafeToCircle = useMeshStore((s) => s.sendImSafeToCircle);
  const simulatePeerSafeCheckIn = useMeshStore(
    (s) => s.simulatePeerSafeCheckIn
  );
  const createSafetyCircle = useMeshStore((s) => s.createSafetyCircle);
  const reportHazard = useMeshStore((s) => s.reportHazard);

  const [selectedCircleId, setSelectedCircleId] = useState<string>(
    circles[0]?.circleId ?? 'circle-family-alpha'
  );
  const [safeNote, setSafeNote] = useState<string>(
    "I'm safe at Ward 14 shelter. Battery & water stable."
  );
  const [newCircleName, setNewCircleName] = useState<string>('');
  const [newCircleKey, setNewCircleKey] = useState<string>('');

  // Hazard report state
  const [hazardCategory, setHazardCategory] =
    useState<HazardCategory>('flood');
  const [hazardTitle, setHazardTitle] = useState<string>(
    'Blocked Evacuation Route — Sector 5'
  );
  const [hazardDesc, setHazardDesc] = useState<string>(
    'Downed masonry and power line across main road. Use footbridge bypass.'
  );
  const [hazardTtlMins, setHazardTtlMins] = useState<number>(120);

  const activeCircle =
    circles.find((c) => c.circleId === selectedCircleId) ?? circles[0];

  const handleBroadcastSafe = async (status: 'SAFE' | 'NEEDS_ASSISTANCE') => {
    if (!activeCircle) return;
    soundEngine.playSelectChord();
    await sendImSafeToCircle(activeCircle.circleId, status, safeNote);
  };

  const handleCreateCircle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCircleName.trim()) return;
    const created = createSafetyCircle(
      newCircleName.trim(),
      newCircleKey.trim() || 'FAMILY-KEY-2025'
    );
    setSelectedCircleId(created.circleId);
    setNewCircleName('');
    setNewCircleKey('');
  };

  const handleSubmitHazard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hazardTitle.trim()) return;
    soundEngine.playSelectChord();
    await reportHazard({
      category: hazardCategory,
      title: hazardTitle.trim(),
      description: hazardDesc.trim(),
      ttlMinutes: hazardTtlMins,
    });
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-2 pb-28 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="type-mono-label text-[var(--verified-ink)]">
            05 / 08 — offline safety check circles & signed hazard beacons
          </span>
          <h1 className="type-h2 mt-0.5 font-grotesk text-[var(--fg)] lowercase">
            family circles & field hazard reports
          </h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Lightweight signed SAFE and HAZARD packets reduce panic traffic on the mesh and reconcile automatically via anti-entropy SYNC_INV when partitioned nodes reconnect.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('map')}
          className="min-h-[42px] cursor-pointer rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 font-mono text-xs font-bold text-[var(--fg)] uppercase hover:bg-[var(--surface-2)]"
        >
          view hazards on mesh map →
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* LEFT COLUMN: ONE-TAP "I'M SAFE" & FAMILY CIRCLES (§8.9, §8.10, §9.3) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="nova-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HeartHandshake className="h-4 w-4 text-[var(--verified-ink)]" />
                <span className="type-mono-label text-[var(--muted)]">
                  one-tap safety check-in (signed safe packet · prio 1)
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {circles.map((c) => (
                  <button
                    key={c.circleId}
                    type="button"
                    onClick={() => setSelectedCircleId(c.circleId)}
                    className={`min-h-[34px] cursor-pointer rounded-full px-3 py-1 font-mono text-xs font-bold transition-colors ${
                      activeCircle?.circleId === c.circleId
                        ? 'bg-[var(--fg)] text-[var(--bg)]'
                        : 'border border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)]'
                    }`}
                  >
                    {c.circleName}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <input
                type="text"
                value={safeNote}
                onChange={(e) => setSafeNote(e.target.value)}
                placeholder="Short status note (e.g., Safe at high-ground school shelter)"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--fg)]"
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handleBroadcastSafe('SAFE')}
                className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--accent-green)] px-4 py-3 font-grotesk text-sm font-bold text-[var(--on-fill)] shadow-sm transition-transform active:scale-[0.99]"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>broadcast “i'm safe” to circle</span>
              </button>
              <button
                type="button"
                onClick={() => void handleBroadcastSafe('NEEDS_ASSISTANCE')}
                className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[var(--accent-coral)] bg-[var(--accent-coral)]/15 px-4 py-3 font-grotesk text-sm font-bold text-[var(--fg)]"
              >
                <AlertOctagon className="h-4 w-4 text-[var(--sos-ink)]" />
                <span>check-in: need supplies / help</span>
              </button>
            </div>
          </div>

          {/* Circle Member Roster: Safe vs Not-Heard-From */}
          {activeCircle && (
            <div className="nova-card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-grotesk text-base font-bold text-[var(--fg)]">
                    {activeCircle.circleName}
                  </h2>
                  <p className="font-mono text-[11px] text-[var(--muted)]">
                    Circle Key Fingerprint: {activeCircle.circleKeyHint} · Synced via SYNC_INV
                  </p>
                </div>
                {peers[0] && (
                  <button
                    type="button"
                    onClick={() =>
                      void simulatePeerSafeCheckIn(
                        peers[0].nodeId,
                        activeCircle.circleId,
                        'SAFE',
                        'Reached North Ridge Assembly Point safely.'
                      )
                    }
                    className="min-h-[34px] cursor-pointer rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 font-mono text-[10px] font-bold text-[var(--fg)] uppercase hover:border-[var(--fg)]"
                  >
                    + sim {peers[0].displayName.split(' ')[0]} check-in safe
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {activeCircle.members.map((m) => (
                  <div
                    key={m.nodeId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-grotesk text-sm font-bold text-[var(--fg)]">
                          {m.displayName}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--muted)]">
                          #{m.nodeId} · {m.hops} hop{m.hops === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {m.note
                          ? `“${m.note}”`
                          : 'No SAFE beacon received yet across mesh'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {m.status === 'SAFE' ? (
                        <span className="rounded-full bg-[var(--accent-green)] px-3 py-1 font-mono text-xs font-bold text-[var(--on-fill)]">
                          ✔ SAFE
                        </span>
                      ) : m.status === 'NEEDS_ASSISTANCE' ? (
                        <span className="rounded-full bg-[var(--accent-coral)] px-3 py-1 font-mono text-xs font-bold text-white">
                          NEEDS HELP
                        </span>
                      ) : (
                        <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 font-mono text-xs font-bold text-[var(--muted)]">
                          NOT HEARD FROM
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Create/Join New Circle */}
              <form
                onSubmit={handleCreateCircle}
                className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4"
              >
                <Users className="h-4 w-4 text-[var(--muted)]" />
                <input
                  type="text"
                  value={newCircleName}
                  onChange={(e) => setNewCircleName(e.target.value)}
                  placeholder="New family/group circle name..."
                  className="min-w-[160px] flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--fg)]"
                />
                <input
                  type="text"
                  value={newCircleKey}
                  onChange={(e) => setNewCircleKey(e.target.value)}
                  placeholder="Shared circle passphrase"
                  className="w-44 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 font-mono text-xs text-[var(--fg)]"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-xl bg-[var(--fg)] px-3.5 py-2 font-mono text-xs font-bold text-[var(--bg)] uppercase"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>create circle</span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: SIGNED HAZARD REPORTS WITH TTL EXPIRY (§8.11) */}
        <div className="space-y-4 lg:col-span-5">
          <form onSubmit={handleSubmitHazard} className="nova-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="type-mono-label text-[var(--sos-ink)]">
                report signed field hazard (ttl expiry)
              </span>
              <span className="font-mono text-[10px] text-[var(--muted)]">
                Ed25519 Signed
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {HAZARD_CATEGORIES.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setHazardCategory(h.id)}
                  className={`flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition-colors ${
                    hazardCategory === h.id
                      ? 'border-[var(--accent-coral)] bg-[var(--accent-coral)] text-white'
                      : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)]'
                  }`}
                >
                  <span>{h.glyph}</span>
                  <span>{h.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-2.5">
              <input
                type="text"
                value={hazardTitle}
                onChange={(e) => setHazardTitle(e.target.value)}
                placeholder="Hazard location / landmark"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs font-bold text-[var(--fg)]"
                required
              />
              <textarea
                rows={2}
                value={hazardDesc}
                onChange={(e) => setHazardDesc(e.target.value)}
                placeholder="Describe road blockage, flood depth, or structural risk..."
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-xs text-[var(--fg)]"
                required
              />
              <div className="flex items-center justify-between font-mono text-xs text-[var(--muted)]">
                <span>Auto-Expiry TTL:</span>
                <div className="flex gap-1.5">
                  {[60, 120, 240].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setHazardTtlMins(mins)}
                      className={`cursor-pointer rounded-lg px-2.5 py-1 text-[10px] font-bold ${
                        hazardTtlMins === mins
                          ? 'bg-[var(--fg)] text-[var(--bg)]'
                          : 'border border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)]'
                      }`}
                    >
                      {mins / 60}h
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="mt-3 flex min-h-[46px] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--fg)] px-4 py-2.5 font-mono text-xs font-bold text-[var(--bg)] uppercase"
            >
              <Radio className="h-3.5 w-3.5" />
              <span>broadcast signed hazard beacon</span>
            </button>
          </form>

          {/* Active Hazards List */}
          <div className="nova-card p-5">
            <div className="type-mono-label mb-3 text-[var(--muted)]">
              active mesh hazard beacons ({hazards.length})
            </div>
            <div className="space-y-2.5">
              {hazards.map((hz) => {
                const minsLeft = Math.max(
                  1,
                  Math.round((hz.expiresAt - Date.now()) / 60000)
                );
                return (
                  <div
                    key={hz.id}
                    className="rounded-2xl border border-[var(--accent-coral)]/40 bg-[var(--surface-2)] p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                      <span className="rounded bg-[var(--accent-coral)] px-2 py-0.5 font-bold text-white uppercase">
                        {hz.category.replace('_', ' ')}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                        <Clock className="h-3 w-3" />
                        <span>Expires in {minsLeft}m</span>
                      </span>
                    </div>
                    <h3 className="mt-1.5 font-grotesk text-sm font-bold text-[var(--fg)]">
                      {hz.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {hz.description}
                    </p>
                    <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[var(--muted)]">
                      <span>
                        By {hz.senderName} ({hz.hops} hop
                        {hz.hops === 1 ? '' : 's'})
                      </span>
                      <span className="inline-flex items-center gap-1 text-[var(--verified-ink)]">
                        <ShieldCheck className="h-3 w-3" />
                        <span>Ed25519 Signed</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
