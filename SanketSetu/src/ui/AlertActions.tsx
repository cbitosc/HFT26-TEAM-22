/** Shared Acknowledge / I'm on my way / Message buttons (src/ui/AlertActions.tsx): 2-column grid, equal height, 48 px minimum. */

import { Check, MessageSquare, Navigation } from 'lucide-react';
import { useMeshStore } from '../store/useMeshStore';
import type { StoredSOSAlert } from '../mesh/types';

const base =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]';

export function AlertActions({ alert, onMessage }: { alert: StoredSOSAlert; onMessage: (senderId: string) => void }) {
  const respondToSOS = useMeshStore((s) => s.respondToSOS);
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => void respondToSOS(alert.id, 'RELAY_RECEIPT')}
        disabled={alert.acknowledgedByMe}
        className={`${base} ${alert.acknowledgedByMe ? 'bg-[var(--safe-tint)] text-[var(--safe-ink)]' : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)]'}`}
      >
        <Check aria-hidden="true" className="h-5 w-5 shrink-0" />
        {alert.acknowledgedByMe ? 'Acknowledged' : 'Acknowledge'}
      </button>
      <button
        type="button"
        onClick={() => void respondToSOS(alert.id, 'SOS_RESPONDING')}
        disabled={alert.respondingByMe}
        className={`${base} ${alert.respondingByMe ? 'bg-[var(--safe-tint)] text-[var(--safe-ink)]' : 'bg-[var(--fg)] text-[var(--bg)]'}`}
      >
        <Navigation aria-hidden="true" className="h-5 w-5 shrink-0" />
        {alert.respondingByMe ? 'On my way' : "I'm on my way"}
      </button>
      <button
        type="button"
        onClick={() => onMessage(alert.senderId)}
        className={`${base} col-span-2 border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)]`}
      >
        <MessageSquare aria-hidden="true" className="h-5 w-5 shrink-0" />
        Message
      </button>
    </div>
  );
}
