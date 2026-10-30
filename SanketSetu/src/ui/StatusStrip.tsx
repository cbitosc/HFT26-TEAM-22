/**
 * Persistent status strip under the header (src/ui/StatusStrip.tsx): connectivity, which radio is
 * actually carrying traffic, nearby peer count, and power mode — each as icon + text. Uses narrow
 * selectors on primitives so it only re-renders when one of these values changes.
 */

import { Battery, BatteryLow, Cpu, Radio, Users, Wifi, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMeshStore } from '../store/useMeshStore';

const POWER_LABEL: Record<string, string> = {
  active: 'Active',
  balanced: 'Balanced',
  saver: 'Saver',
};

function Item({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[0.8125rem] leading-5 font-semibold whitespace-nowrap">
      {children}
    </span>
  );
}

export function StatusStrip() {
  const isOnline = useMeshStore((s) => s.isOnline);
  const realRadioPeerCount = useMeshStore((s) => s.realRadioPeerCount);
  const directPeerCount = useMeshStore(
    (s) => s.peers.filter((p) => p.isDirectNeighbor).length
  );
  const powerMode = useMeshStore((s) => s.metrics.powerMode);
  const batteryPct = useMeshStore((s) => s.metrics.batteryPct);
  const hasRealRadio = realRadioPeerCount > 0;

  return (
    <div
      role="status"
      aria-label="Connection status"
      className="flex min-h-[var(--status-h)] flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-[var(--fg)]"
    >
      <Item>
        {isOnline ? (
          <Wifi aria-hidden="true" className="h-4 w-4 text-[var(--safe-ink)]" />
        ) : (
          <WifiOff aria-hidden="true" className="h-4 w-4 text-[var(--fg-secondary)]" />
        )}
        {isOnline ? 'Online' : 'Offline'}
      </Item>
      <Item>
        {hasRealRadio ? (
          <Radio aria-hidden="true" className="h-4 w-4 text-[var(--verified-ink)]" />
        ) : (
          <Cpu aria-hidden="true" className="h-4 w-4 text-[var(--fg-secondary)]" />
        )}
        {hasRealRadio ? 'Real radio' : 'Simulated'}
      </Item>
      <Item>
        <Users aria-hidden="true" className="h-4 w-4 text-[var(--fg-secondary)]" />
        <span className="tabular-nums">{directPeerCount}</span>
        {directPeerCount === 1 ? 'peer' : 'peers'}
      </Item>
      <Item>
        {batteryPct < 15 ? (
          <BatteryLow aria-hidden="true" className="h-4 w-4 text-[var(--warn-ink)]" />
        ) : (
          <Battery aria-hidden="true" className="h-4 w-4 text-[var(--fg-secondary)]" />
        )}
        {POWER_LABEL[powerMode] ?? powerMode}
      </Item>
    </div>
  );
}
