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
    <span className="inline-flex min-w-0 items-center gap-1 text-[0.8125rem] leading-5 font-semibold whitespace-nowrap">
      {children}
    </span>
  );
}

export function StatusStrip() {
  const isOnline = useMeshStore((s) => s.isOnline);
  const appMode = useMeshStore((s) => s.appMode);
  const connectedPhones = useMeshStore((s) => s.peers.filter((p) => p.isDirectNeighbor).length);
  const powerMode = useMeshStore((s) => s.metrics.powerMode);
  const batteryPct = useMeshStore((s) => s.metrics.batteryPct);
  const demo = appMode === 'demo';

  return (
    <div
      role="status"
      aria-label="Connection status"
      className="grid min-h-[var(--status-h)] grid-cols-2 items-center gap-x-3 gap-y-1 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-1.5 text-[var(--fg)] min-[430px]:flex min-[430px]:flex-wrap"
    >
      <Item>
        {demo ? (
          <Cpu aria-hidden="true" className="h-4 w-4 text-[var(--warn-ink)]" />
        ) : (
          <Radio aria-hidden="true" className="h-4 w-4 text-[var(--verified-ink)]" />
        )}
        {demo ? 'DEMO' : 'REAL RADIO'}
      </Item>
      <Item>
        {isOnline ? (
          <Wifi aria-hidden="true" className="h-4 w-4 text-[var(--fg-secondary)]" />
        ) : (
          <WifiOff aria-hidden="true" className="h-4 w-4 text-[var(--fg-secondary)]" />
        )}
        {isOnline ? 'ONLINE' : 'OFFLINE'}
      </Item>
      <Item>
        <Users aria-hidden="true" className="h-4 w-4 text-[var(--fg-secondary)]" />
        <span className="tabular-nums">{connectedPhones}</span>
        {connectedPhones === 1 ? 'phone nearby' : 'phones nearby'}
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
