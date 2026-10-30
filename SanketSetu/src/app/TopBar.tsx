/**
 * Top Telemetry & Theme Bar (src/app/TopBar.tsx)
 * Preserves NOVA's floating pill aesthetic with ≥ 48px touch targets:
 * - Left: Sanket brand monogram + node callsign + real mesh status pill
 * - Center/Right: Connected peers count, Outbox queued count, Battery % & Power mode,
 *   Sun/Moon theme toggle with circular clip-path reveal, Sound toggle, and Settings button.
 */

import React from 'react';
import {
  Battery,
  BatteryCharging,
  Moon,
  Radio,
  Settings,
  ShieldCheck,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useMeshStore } from '../store/useMeshStore';
import { ThemeMode } from '../ui/theme';
import { AppScreenId, sanketContent } from '../content';

interface TopBarProps {
  activeScreen: AppScreenId;
  onNavigate: (screen: AppScreenId) => void;
  theme: ThemeMode;
  onToggleTheme: (next: ThemeMode, ev?: React.MouseEvent) => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export function TopBar({
  activeScreen,
  onNavigate,
  theme,
  onToggleTheme,
  isMuted,
  onToggleMute,
}: TopBarProps) {
  const identity = useMeshStore((s) => s.identity);
  const peers = useMeshStore((s) => s.peers);
  const outbox = useMeshStore((s) => s.outbox);
  const metrics = useMeshStore((s) => s.metrics);
  const activeSosId = useMeshStore((s) => s.activeSosId);
  const realRadioPeerCount = useMeshStore((s) => s.realRadioPeerCount);

  const directNeighbors = peers.filter((p) => p.isDirectNeighbor).length;
  const totalKnownPeers = peers.length;
  // Truthful, not aspirational: only ever says REAL RADIO when a Nearby Connections peer is
  // actually connected right now. Everything else (browser, native with 0 real peers, denied
  // permissions) honestly shows SIMULATED, since that's what's actually carrying the traffic.
  const hasRealRadio = realRadioPeerCount > 0;

  return (
    <header className="sticky top-0 z-50 w-full px-3 pt-2.5 pb-2 sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)]/92 px-3 py-1.5 shadow-[var(--shadow-1)] backdrop-blur-md">
        {/* Left: Brand & Node Identity */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex min-h-[48px] cursor-pointer items-center gap-2.5 rounded-full pr-2 text-left transition-opacity hover:opacity-85"
          aria-label="Go to Sanket Home"
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--on-fill)]/15 font-grotesk text-base font-bold text-[var(--on-fill)] ${
              activeSosId
                ? 'bg-[var(--accent-coral)] text-white'
                : 'bg-[var(--accent-green)]'
            }`}
          >
            s
          </span>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-grotesk text-sm font-bold tracking-tight text-[var(--fg)] lowercase">
                {sanketContent.appName}
              </span>
              <span className="rounded-full bg-[var(--accent-green)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--on-fill)]">
                OFFLINE MESH
              </span>
            </div>
            <span className="font-mono text-[10px] text-[var(--muted)]">
              {identity.displayName} · #{identity.nodeId.slice(0, 6)}
            </span>
          </div>
        </button>

        {/* Center Live Mesh Telemetry Strip (Real state + SIMULATED badge) */}
        <div className="hidden items-center gap-3 md:flex">
          <button
            type="button"
            onClick={() => onNavigate('map')}
            className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 font-mono text-xs text-[var(--fg)] transition-colors hover:border-[var(--fg)]/30"
          >
            <Radio className="h-3.5 w-3.5 text-[var(--verified-ink)]" />
            <span>
              {directNeighbors} direct / {totalKnownPeers} mesh peers
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                hasRealRadio
                  ? 'bg-[var(--accent-green)] text-[var(--on-fill)]'
                  : 'bg-[var(--surface)] text-[var(--muted)]'
              }`}
              title={
                hasRealRadio
                  ? `${realRadioPeerCount} peer(s) connected over the real Nearby Connections radio`
                  : 'No real-radio peers connected — showing the in-memory demo mesh only'
              }
            >
              {hasRealRadio ? 'REAL RADIO' : sanketContent.simulatedBadge}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 font-mono text-xs text-[var(--fg)]"
            title="Store-and-forward outbox & battery mode"
          >
            {metrics.isCharging ? (
              <BatteryCharging className="h-3.5 w-3.5 text-[var(--verified-ink)]" />
            ) : (
              <Battery
                className={`h-3.5 w-3.5 ${
                  metrics.batteryPct < 15
                    ? 'text-[var(--sos-ink)]'
                    : 'text-[var(--fg)]'
                }`}
              />
            )}
            <span>
              {metrics.batteryPct}% · {metrics.powerMode.toUpperCase()} (
              {metrics.scanDutyCyclePct}% scan)
            </span>
            {outbox.length > 0 && (
              <span className="ml-1 rounded-full bg-[var(--accent-lilac)] px-2 py-0.5 text-[10px] font-bold text-[var(--on-fill)]">
                {outbox.length} queued
              </span>
            )}
          </button>
        </div>

        {/* Right Controls: Onboarding/Keys, Sound, Theme, Settings (all >= 48px touch targets) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigate('onboarding')}
            className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border transition-colors ${
              activeScreen === 'onboarding'
                ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                : 'border-transparent text-[var(--fg)] hover:bg-[var(--surface-2)]'
            }`}
            aria-label="Node Identity & Permissions Setup"
            title="Identity, Keys & Android Permissions"
          >
            <ShieldCheck className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="hidden h-12 w-12 cursor-pointer items-center justify-center rounded-full text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] sm:flex"
            aria-label={isMuted ? 'Unmute audio feedback' : 'Mute audio feedback'}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-[var(--muted)]" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={(e) =>
              onToggleTheme(theme === 'light' ? 'dark' : 'light', e)
            }
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)]"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4 text-[var(--safe-ink)]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border transition-colors ${
              activeScreen === 'settings'
                ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                : 'border-transparent text-[var(--fg)] hover:bg-[var(--surface-2)]'
            }`}
            aria-label="Open Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
