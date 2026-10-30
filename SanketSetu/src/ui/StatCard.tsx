/**
 * Single-number stat card (src/ui/StatCard.tsx): plain label (13px), large tabular value (28px),
 * optional one-line detail, and a SIMULATED badge whenever the number comes from the in-memory
 * demo mesh rather than real radio traffic. Memoised so it only re-renders when its props change.
 */

import { memo } from 'react';
import { Badge } from './Badge';

interface StatCardProps {
  label: string;
  value: string | number;
  detail?: string;
  simulated?: boolean;
}

export const StatCard = memo(function StatCard({ label, value, detail, simulated }: StatCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-[0.8125rem] font-semibold text-[var(--fg-secondary)]">{label}</span>
        {simulated && <Badge tone="neutral">SIMULATED</Badge>}
      </div>
      <span className="text-[1.75rem] leading-tight font-bold text-[var(--fg)] tabular-nums">{value}</span>
      {detail && <span className="text-[0.8125rem] text-[var(--fg-secondary)]">{detail}</span>}
    </div>
  );
});
