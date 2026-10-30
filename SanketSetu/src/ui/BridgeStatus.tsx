/**
 * Bridge-themed status graphics (src/ui/BridgeStatus.tsx). Both always include text, never colour
 * alone, and animate only with a one-shot CSS transition on fill.
 *
 * DeliveryBridge: four bridge segments (Pending, Sent, Relayed, Delivered) that fill as the message
 * progresses. The labels are the real engine states; "Relayed" shows the hop count.
 * BridgeChain: sender -> relays -> receiver as linked nodes. The relay list is the packet's
 * unsigned `route` field, so it is labelled as an unauthenticated hint.
 */

import { memo } from 'react';
import type { MessageDeliveryState } from '../mesh/types';

const STEPS: { state: MessageDeliveryState; label: string }[] = [
  { state: 'PENDING', label: 'Pending' },
  { state: 'SENT', label: 'Sent' },
  { state: 'RELAYED', label: 'Relayed' },
  { state: 'DELIVERED', label: 'Delivered' },
];

export const DeliveryBridge = memo(function DeliveryBridge({
  state,
  hops = 0,
  compact = false,
}: {
  state: MessageDeliveryState;
  hops?: number;
  compact?: boolean;
}) {
  const reached = STEPS.findIndex((s) => s.state === state);
  const done = state === 'DELIVERED';
  const summary = `${STEPS[reached].label}${state === 'RELAYED' || (done && hops > 0) ? `, ${hops} hop${hops === 1 ? '' : 's'}` : ''}`;
  return (
    <div role="img" aria-label={`Delivery status: ${summary}`} className="w-full">
      <div className="flex items-end gap-1">
        {STEPS.map((step, i) => {
          const filled = i <= reached;
          const fill = done ? 'var(--safe)' : state === 'RELAYED' ? 'var(--relay-ink)' : 'var(--verified)';
          return (
            <div key={step.state} className="flex flex-1 flex-col items-center gap-1">
              <svg viewBox="0 0 40 14" className="h-3.5 w-full" aria-hidden="true">
                <path
                  d="M2 12 Q20 -4 38 12"
                  fill="none"
                  strokeWidth="5"
                  strokeLinecap="round"
                  style={{ stroke: filled ? fill : 'var(--line)', transition: 'stroke 0.3s ease' }}
                />
              </svg>
              {!compact && (
                <span className={`text-xs leading-4 ${i === reached ? 'font-bold text-[var(--fg)]' : 'text-[var(--fg-secondary)]'}`}>
                  {step.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className={`text-sm font-semibold ${done ? 'text-[var(--safe-ink)]' : state === 'RELAYED' ? 'text-[var(--relay-ink)]' : 'text-[var(--fg)]'}`}>
        {summary}
      </p>
    </div>
  );
});

export const BridgeChain = memo(function BridgeChain({
  route,
  selfId,
  nameFor,
}: {
  route: string[];
  selfId?: string;
  nameFor?: (nodeId: string) => string | undefined;
}) {
  if (route.length === 0) return <p className="text-sm text-[var(--fg-secondary)]">No path recorded yet.</p>;
  return (
    <div>
      <ol className="flex flex-wrap items-center gap-y-2" aria-label="Path from sender to receiver">
        {route.map((id, i) => {
          const role = i === 0 ? 'Sender' : i === route.length - 1 ? 'Receiver' : `Relay ${i}`;
          const name = nameFor?.(id);
          return (
            <li key={`${id}-${i}`} className="flex items-center">
              <span className="flex min-w-[72px] flex-col items-center gap-1 text-center">
                <span
                  aria-hidden="true"
                  className={`h-4 w-4 rounded-full border-2 border-[var(--surface)] ${i === 0 ? 'bg-[var(--verified)]' : i === route.length - 1 ? 'bg-[var(--safe)]' : 'bg-[var(--relay-ink)]'}`}
                />
                <span className="text-xs font-semibold text-[var(--fg)]">{id === selfId ? 'You' : role}</span>
                <span className="max-w-[88px] truncate text-xs text-[var(--fg-secondary)]">{name ?? ''}</span>
                <span className="font-mono text-xs text-[var(--fg-secondary)]">#{id.slice(0, 6)}</span>
              </span>
              {i < route.length - 1 && (
                <svg viewBox="0 0 32 14" className="mb-8 h-3.5 w-8" aria-hidden="true">
                  <path d="M1 12 Q16 -2 31 12" fill="none" stroke="var(--relay-ink)" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-[var(--fg-secondary)]">
        Unauthenticated hint: relays add themselves to this list without signing it, so it can be wrong.
      </p>
    </div>
  );
});
