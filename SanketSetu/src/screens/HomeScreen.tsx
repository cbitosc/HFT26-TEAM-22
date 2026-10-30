/**
 * Home Screen — Live Mesh Status Orb, Hold-3-Seconds SOS & One-Tap "I'm Safe" (src/screens/HomeScreen.tsx)
 * Per §8.3, §8.9, §9.6:
 * - Displays the NOVA glass Orb reflecting real mesh state:
 *   idle = lilac, scanning = pulse, peers connected = orbit dots (one per peer), SOS active = coral.
 * - Shows honest real metrics: online/offline pill, connected/mesh peers count, queued outbox count, battery mode.
 * - Giant Hold-3-Seconds SOS button with radial progress + cancel, plus one-tap "I'm safe" check-in CTA.
 */

import { useState } from 'react';
import {
  AlertOctagon,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  Globe,
  HeartHandshake,
  MessageSquareLock,
  Radio,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { AppScreenId, sanketContent } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { MeshOrb, MeshOrbState } from '../ui/MeshOrb';
import { HoldToSendButton } from '../ui/HoldToSendButton';
import { ThemeMode } from '../ui/theme';
import { soundEngine } from '../lib/audio';

interface HomeScreenProps {
  theme: ThemeMode;
  reducedMotion: boolean;
  onNavigate: (screen: AppScreenId) => void;
}

export function HomeScreen({
  theme,
  reducedMotion,
  onNavigate,
}: HomeScreenProps) {
  const peers = useMeshStore((s) => s.peers);
  const outbox = useMeshStore((s) => s.outbox);
  const metrics = useMeshStore((s) => s.metrics);
  const alerts = useMeshStore((s) => s.alerts);
  const messages = useMeshStore((s) => s.messages);
  const activeSosId = useMeshStore((s) => s.activeSosId);
  const broadcastSOS = useMeshStore((s) => s.broadcastSOS);
  const cancelActiveSOS = useMeshStore((s) => s.cancelActiveSOS);
  const sendImSafeToCircle = useMeshStore((s) => s.sendImSafeToCircle);
  const bridgeQueuedSosToSetuGateway = useMeshStore(
    (s) => s.bridgeQueuedSosToSetuGateway
  );
  const bridgedGatewayIds = useMeshStore((s) => s.bridgedGatewayIds);

  const [safeBanner, setSafeBanner] = useState(false);

  const directPeers = peers.filter((p) => p.isDirectNeighbor);
  const orbState: MeshOrbState = activeSosId
    ? 'sos'
    : directPeers.length > 0
      ? 'connected'
      : 'scanning';

  const sendHomeSos = () => {
    soundEngine.playSosSent();
    void broadcastSOS({
      category: 'medical',
      text: 'EMERGENCY SOS BEACON: Immediate responder assistance requested at my node location.',
      headcount: 1,
    });
  };

  const handleQuickSafe = async () => {
    soundEngine.playSelectChord();
    await sendImSafeToCircle(
      'circle-family-alpha',
      'SAFE',
      "I'm safe — one-tap check-in from Sanket Setu Home."
    );
    setSafeBanner(true);
    setTimeout(() => setSafeBanner(false), 3000);
  };

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col justify-between gap-6 px-4 pt-2 pb-28 sm:px-6">
      {/* Top Hero Grid: Editorial NOVA Typography + Live Mesh Status Orb */}
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
        {/* Left Column: Headline & Live Mesh Telemetry */}
        <div className="flex flex-col items-start lg:col-span-7">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="type-mono-label text-[var(--muted)]">
              {sanketContent.home.kicker}
            </span>
            <span className="rounded-full bg-[var(--accent-lilac)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--on-fill)]">
              {sanketContent.home.orbStates[orbState]}
            </span>
          </div>

          <h1 className="type-display font-grotesk text-[var(--fg)] lowercase">
            <span className="block">{sanketContent.home.headlineLine1}</span>
            <span className="block font-serif-editorial italic font-normal">
              {sanketContent.home.headlineLine2}
            </span>
            <span className="text-treatment-outline block">
              {sanketContent.home.headlineLine3}
            </span>
          </h1>

          <p className="type-body mt-4 max-w-xl text-[var(--muted)]">
            {sanketContent.home.subtitle}
          </p>

          {/* Honest Real-State Telemetry Grid (Labeled SIMULATED where backed by SimTransport) */}
          <div className="mt-5 grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="nova-card p-3.5">
              <div className="flex items-center justify-between font-mono text-[10px] text-[var(--muted)] uppercase">
                <span>mesh peers</span>
                <span>{sanketContent.simulatedBadge}</span>
              </div>
              <div className="mt-1 font-grotesk text-2xl font-bold tabular-nums text-[var(--fg)]">
                {peers.length}
              </div>
              <div className="font-mono text-[11px] text-[var(--verified-ink)]">
                {directPeers.length} direct ·{' '}
                {Math.max(0, peers.length - directPeers.length)} multi-hop
              </div>
            </div>

            <div className="nova-card p-3.5">
              <div className="flex items-center justify-between font-mono text-[10px] text-[var(--muted)] uppercase">
                <span>outbox queue</span>
                <span>REAL</span>
              </div>
              <div className="mt-1 font-grotesk text-2xl font-bold tabular-nums text-[var(--fg)]">
                {outbox.length}
              </div>
              <div className="font-mono text-[11px] text-[var(--muted)]">
                {metrics.packetsRelayed} packets relayed
              </div>
            </div>

            <div className="nova-card p-3.5">
              <div className="flex items-center justify-between font-mono text-[10px] text-[var(--muted)] uppercase">
                <span>delivered</span>
                <span>SIGNED</span>
              </div>
              <div className="mt-1 font-grotesk text-2xl font-bold tabular-nums text-[var(--fg)]">
                {
                  messages.filter((m) => m.deliveryState === 'DELIVERED')
                    .length
                }
              </div>
              <div className="font-mono text-[11px] text-[var(--verified-ink)]">
                ed25519 verified acks
              </div>
            </div>

            <div className="nova-card p-3.5">
              <div className="flex items-center justify-between font-mono text-[10px] text-[var(--muted)] uppercase">
                <span>power mode</span>
                <span>{metrics.batteryPct}%</span>
              </div>
              <div className="mt-1 font-grotesk text-2xl font-bold text-[var(--fg)] lowercase">
                {metrics.powerMode}
              </div>
              <div className="font-mono text-[11px] text-[var(--muted)]">
                {metrics.scanDutyCyclePct}% radio duty
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live 3D / Saver Glass Orb + Giant Hold-3-Seconds SOS Control */}
        <div className="flex flex-col items-center justify-center lg:col-span-5">
          <MeshOrb state={orbState} peers={peers} />

          {/* Giant Hold-3-Seconds SOS Button */}
          <div className="mt-4 flex w-full max-w-sm flex-col items-center gap-2.5">
            {!activeSosId ? (
              <HoldToSendButton onConfirm={sendHomeSos} />
            ) : (
              <div className="flex w-full flex-col gap-2 rounded-3xl border-2 border-[var(--accent-coral)] bg-[var(--accent-coral)]/12 p-4 text-center">
                <div className="font-grotesk text-sm font-bold text-[var(--sos-ink)] uppercase">
                  {sanketContent.home.sosActivePrompt}
                </div>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('sos')}
                    className="flex min-h-[48px] flex-1 cursor-pointer items-center justify-center rounded-full bg-[var(--accent-coral)] px-4 font-mono text-xs font-bold text-white uppercase"
                  >
                    closed-loop tracker
                  </button>
                  <button
                    type="button"
                    onClick={cancelActiveSOS}
                    className="flex min-h-[48px] cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 font-mono text-xs font-bold text-[var(--fg)] uppercase"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>{sanketContent.home.sosCancelLabel}</span>
                  </button>
                </div>
              </div>
            )}

            {/* One-Tap "I'm Safe" Check-In Bar (§8.9) */}
            <button
              type="button"
              onClick={() => void handleQuickSafe()}
              className="flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--accent-green)] px-5 py-2.5 font-grotesk text-xs font-bold text-[var(--on-fill)] shadow-xs transition-transform active:scale-[0.99]"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {safeBanner
                  ? '✔ signed SAFE check-in broadcasted to family circle!'
                  : sanketContent.home.safeCheckInCta}
              </span>
            </button>

            {/* Secondary Action Pills */}
            <div className="grid w-full grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onNavigate('messages')}
                className="flex min-h-[46px] cursor-pointer items-center justify-center gap-1 rounded-full bg-[var(--fg)] px-3 py-2 font-grotesk text-xs font-bold text-[var(--bg)] transition-opacity hover:opacity-90"
              >
                <MessageSquareLock className="h-3.5 w-3.5" />
                <span>direct msg</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('circles')}
                className="flex min-h-[46px] cursor-pointer items-center justify-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-grotesk text-xs font-bold text-[var(--fg)] hover:bg-[var(--surface-2)]"
              >
                <HeartHandshake className="h-3.5 w-3.5 text-[var(--verified-ink)]" />
                <span>circles</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('simulator')}
                className="flex min-h-[46px] cursor-pointer items-center justify-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-grotesk text-xs font-bold text-[var(--fg)] hover:bg-[var(--surface-2)]"
              >
                <Cpu className="h-3.5 w-3.5 text-[var(--relay-ink)]" />
                <span>simulator</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Setu Online Gateway Bridge Strip (§9.6 — DEMO) */}
      <div className="nova-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Globe className="h-4 w-4 text-[var(--verified-ink)]" />
          <div>
            <div className="font-grotesk text-xs font-bold text-[var(--fg)]">
              Setu Online Gateway Bridge ({sanketContent.demoGatewayBadge})
            </div>
            <div className="font-mono text-[11px] text-[var(--muted)]">
              When any mesh phone regains cellular/Wi-Fi signal, user-consented nodes forward queued signed SOS beacons to the incident feed.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => bridgeQueuedSosToSetuGateway()}
          className="min-h-[38px] cursor-pointer rounded-full bg-[var(--fg)] px-4 py-1.5 font-mono text-[11px] font-bold text-[var(--bg)] uppercase"
        >
          {bridgedGatewayIds.length > 0
            ? `✔ ${bridgedGatewayIds.length} SOS Bridged Online (DEMO)`
            : 'Bridge Queued SOS Online (DEMO)'}
        </button>
      </div>

      {/* Bottom Live Mesh Activity Strip: Active Alerts & Multi-Hop Peers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="nova-card flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="type-mono-label text-[var(--muted)]">
              known mesh topology ({peers.length} nodes)
            </span>
            <button
              type="button"
              onClick={() => onNavigate('map')}
              className="flex cursor-pointer items-center gap-1 font-mono text-xs font-bold text-[var(--verified-ink)]"
            >
              <span>open 3d/2d map</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {peers.map((peer) => (
              <div
                key={peer.nodeId}
                className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Radio
                    className={`h-3.5 w-3.5 ${
                      peer.isDirectNeighbor
                        ? 'text-[var(--verified-ink)]'
                        : 'text-[var(--relay-ink)]'
                    }`}
                  />
                  <div>
                    <div className="font-grotesk text-sm font-bold text-[var(--fg)]">
                      {peer.displayName}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--muted)]">
                      #{peer.nodeId} · RSSI {peer.rssi} dBm
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                      peer.isDirectNeighbor
                        ? 'bg-[var(--accent-green)] text-[var(--on-fill)]'
                        : 'bg-[var(--accent-lilac)] text-[var(--on-fill)]'
                    }`}
                  >
                    {peer.hopsAway} {peer.hopsAway === 1 ? 'HOP' : 'HOPS'}
                  </span>
                  {peer.trustStatus === 'verified' && (
                    <ShieldCheck
                      className="h-4 w-4 text-[var(--verified-ink)]"
                      aria-label="Verified via QR / TOFU"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="nova-card flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="type-mono-label text-[var(--muted)]">
              priority emergency beacons ({alerts.length})
            </span>
            <button
              type="button"
              onClick={() => onNavigate('alerts')}
              className="flex cursor-pointer items-center gap-1 font-mono text-xs font-bold text-[var(--sos-ink)]"
            >
              <span>open alerts feed</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {alerts.slice(0, 2).map((alert) => (
              <div
                key={alert.id}
                className="rounded-xl border border-[var(--accent-coral)]/35 bg-[var(--surface-2)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-[var(--accent-coral)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-white uppercase">
                    SOS · {alert.category} · P{alert.priority}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--muted)]">
                    {alert.hops} hop(s) · reached {alert.reachedNodeIds.length}{' '}
                    node(s) · {alert.responderAcks.length} ack(s)
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs text-[var(--fg)]">
                  {alert.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
