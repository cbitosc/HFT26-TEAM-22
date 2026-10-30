/**
 * Full-screen incoming SOS card (src/ui/IncomingAlertOverlay.tsx). Shown over everything when a new,
 * signature-verified SOS arrives from another phone. Vibration, sound and the system notification
 * are fired by src/lib/alertFeedback.ts; this is the visible half.
 */

import { AlertOctagon, MapPin } from 'lucide-react';
import { useMeshStore } from '../store/useMeshStore';
import { alertLocationLabel, categoryLabel, hopsLabel } from '../lib/alertFeedback';
import { timeAgo } from '../lib/timeAgo';
import { AppScreenId } from '../content';
import { AlertActions } from './AlertActions';

export function IncomingAlertOverlay({ onNavigate }: { onNavigate: (screen: AppScreenId) => void }) {
  const alert = useMeshStore((s) => s.alerts.find((a) => a.id === s.incomingAlertId) ?? null);
  const dismiss = useMeshStore((s) => s.dismissIncomingAlert);
  const setActiveConversation = useMeshStore((s) => s.setActiveConversation);
  if (!alert) return null;
  const location = alertLocationLabel(alert);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Emergency alert"
      className="fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-[var(--sos-tint)] px-4"
      style={{ paddingTop: 'calc(var(--safe-top) + 16px)', paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4">
        <div className="flex items-center gap-3 text-[var(--sos-ink)]">
          <AlertOctagon aria-hidden="true" className="h-9 w-9 shrink-0" />
          <h1 className="text-2xl font-bold">SOS nearby</h1>
        </div>
        <div className="rounded-[var(--radius)] border-2 border-[var(--sos)] bg-[var(--surface)] p-4">
          <p className="text-xl font-bold text-[var(--fg)]">{categoryLabel(alert.category)}</p>
          <p className="mt-1 text-lg font-semibold text-[var(--fg)]">{alert.senderName}</p>
          <p className="mt-1 text-base text-[var(--fg-secondary)]">
            {hopsLabel(alert.hops)} · {timeAgo(alert.timestamp)}
          </p>
          {alert.text && <p className="mt-3 text-base break-words text-[var(--fg)]">{alert.text}</p>}
          {location && (
            <p className="mt-3 flex items-start gap-2 text-base text-[var(--fg)]">
              <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="min-w-0 break-words">{location}</span>
            </p>
          )}
        </div>
        <AlertActions
          alert={alert}
          onMessage={(id) => {
            setActiveConversation(id);
            dismiss();
            onNavigate('messages');
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              dismiss();
              onNavigate('alerts');
            }}
            className="min-h-12 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-base font-semibold text-[var(--fg)]"
          >
            Open alerts
          </button>
          <button type="button" onClick={dismiss} className="min-h-12 rounded-xl px-3 text-base font-semibold text-[var(--fg)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
