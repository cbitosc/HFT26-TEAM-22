import type { ReactNode } from 'react';

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'safe' | 'warn' | 'relay' }) {
  const tones = {
    neutral: 'bg-[var(--surface-2)] text-[var(--fg-secondary)]',
    safe: 'bg-[var(--safe-tint)] text-[var(--safe-ink)]',
    warn: 'bg-[var(--warn-tint)] text-[var(--warn-ink)]',
    relay: 'bg-[var(--relay-tint)] text-[var(--relay-ink)]',
  };
  return <span className={`inline-flex min-h-8 items-center rounded-full px-3 py-1 text-sm font-semibold ${tones[tone]}`}>{children}</span>;
}
