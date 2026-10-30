/**
 * App header (src/app/TopBar.tsx): one compact row — app name (never wraps), a single mode badge,
 * and a small status cluster (outbox queue) — with the persistent StatusStrip directly beneath.
 * Theme, sound, and settings live in More > Settings, not here. Solid surface, no blur.
 */

import { Inbox } from 'lucide-react';
import { useMeshStore } from '../store/useMeshStore';
import { AppScreenId } from '../content';
import { Badge } from '../ui/Badge';
import { StatusStrip } from '../ui/StatusStrip';

interface TopBarProps {
  onNavigate: (screen: AppScreenId) => void;
}

export function TopBar({ onNavigate }: TopBarProps) {
  const sosActive = useMeshStore((s) => s.activeSosId !== null);
  const queued = useMeshStore((s) => s.outbox.length);

  return (
    <header
      className="sticky top-0 z-50 w-full bg-[var(--surface)]"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="flex min-h-[var(--header-h)] items-center justify-between gap-2 border-b border-[var(--line)] px-4">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex min-h-[48px] min-w-0 items-center gap-2 rounded-[var(--radius-sm)] text-left"
          aria-label="Sanket Setu, go to Home"
        >
          <span className="text-lg font-bold whitespace-nowrap text-[var(--fg)]">Sanket Setu</span>
          {sosActive ? (
            <Badge
              tone="sos-solid"
              icon={<span aria-hidden="true" className="sos-pulse h-2 w-2 rounded-full bg-[var(--on-sos)]" />}
            >
              SOS active
            </Badge>
          ) : (
            <Badge tone="neutral">Offline mesh</Badge>
          )}
        </button>

        <button
          type="button"
          onClick={() => onNavigate('messages')}
          className="flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-sm font-semibold text-[var(--fg)]"
          aria-label={`${queued} message${queued === 1 ? '' : 's'} waiting to send`}
        >
          <Inbox aria-hidden="true" className="h-5 w-5 text-[var(--fg-secondary)]" />
          <span className="tabular-nums">{queued}</span>
          <span className="hidden min-[400px]:inline">queued</span>
        </button>
      </div>
      <StatusStrip />
    </header>
  );
}
