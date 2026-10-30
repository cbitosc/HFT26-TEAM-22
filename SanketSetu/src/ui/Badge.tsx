/**
 * Small status label (src/ui/Badge.tsx). Tones map to semantic tint + ink token pairs that pass
 * WCAG AA in both themes (see scripts/contrast-check.mjs). Always carries text — colour is never
 * the only signal.
 */

import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'sos' | 'verified' | 'relay' | 'safe' | 'warn' | 'sos-solid';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--surface-2)] text-[var(--fg-secondary)] border-[var(--line)]',
  sos: 'bg-[var(--sos-tint)] text-[var(--sos-ink)] border-transparent',
  verified: 'bg-[var(--verified-tint)] text-[var(--verified-ink)] border-transparent',
  relay: 'bg-[var(--relay-tint)] text-[var(--relay-ink)] border-transparent',
  safe: 'bg-[var(--safe-tint)] text-[var(--safe-ink)] border-transparent',
  warn: 'bg-[var(--warn-tint)] text-[var(--warn-ink)] border-transparent',
  'sos-solid': 'bg-[var(--sos)] text-[var(--on-sos)] border-transparent',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className = '',
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap ${TONE_CLASS[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
