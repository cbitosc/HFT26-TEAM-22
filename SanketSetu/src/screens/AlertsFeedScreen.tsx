/**
 * Alerts (src/screens/AlertsFeedScreen.tsx): real SOS and hazard reports received from other phones,
 * one card per SOS id, newest unread first. Your own SOS is tracked on the SOS screen, not here.
 * Exact location is shown only when this phone holds a valid responder certificate that unsealed it;
 * otherwise the approximate area. Technical detail (signatures, routes, TTL) lives in the Packet
 * Inspector, not on the card.
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lock, MapPin, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ShowMoreButton, usePagedList } from '../ui/paging';
import { withinRadius } from '../lib/geo';
import { Card } from '../ui/Card';
import { Toggle } from '../ui/Toggle';
import { AlertActions } from '../ui/AlertActions';
import { alertLocationLabel, categoryLabel, hopsLabel } from '../lib/alertFeedback';
import { timeAgo } from '../lib/timeAgo';
import { AppScreenId, sanketContent } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { PeerNode, StoredSOSAlert } from '../mesh/types';

interface AlertsFeedScreenProps {
  onNavigate: (screen: AppScreenId) => void;
}

function bestPosition(a: StoredSOSAlert): { lat?: number; lng?: number } {
  return a.unsealedPreciseLocation ?? { lat: a.lat, lng: a.lng };
}

/** "Asha → Bala → +2 more": shows at most three names, never wraps to a second line. */
function routeSummary(route: string[], peers: PeerNode[], myId: string, myName: string): string {
  const name = (id: string) => (id === myId ? myName : (peers.find((p) => p.nodeId === id)?.displayName ?? `#${id.slice(0, 4)}`));
  const names = route.map(name);
  if (names.length <= 3) return names.join(' → ');
  return `${names.slice(0, 2).join(' → ')} → +${names.length - 2} more`;
}

interface Cluster {
  key: string;
  primary: StoredSOSAlert;
  members: StoredSOSAlert[];
}

export function AlertsFeedScreen({ onNavigate }: AlertsFeedScreenProps) {
  const allAlerts = useMeshStore((s) => s.alerts);
  const hazards = useMeshStore((s) => s.hazards);
  const peers = useMeshStore((s) => s.peers);
  const identity = useMeshStore((s) => s.identity);
  const seenAlertIds = useMeshStore((s) => s.seenAlertIds);
  const markAlertsSeen = useMeshStore((s) => s.markAlertsSeen);
  const setActiveConversation = useMeshStore((s) => s.setActiveConversation);
  const [grouped, setGrouped] = useState(false);

  const received = useMemo(() => allAlerts.filter((a) => a.senderId !== identity.nodeId), [allAlerts, identity.nodeId]);
  const receivedHazards = useMemo(
    () => hazards.filter((h) => h.senderId !== identity.nodeId && h.expiresAt > Date.now()),
    [hazards, identity.nodeId]
  );

  // Opening the screen counts as seeing everything on it.
  useEffect(() => {
    markAlertsSeen();
  }, [received.length, markAlertsSeen]);

  const sorted = useMemo(() => {
    const seen = new Set(seenAlertIds);
    return [...received].sort(
      (a, b) =>
        Number(!seen.has(b.id)) - Number(!seen.has(a.id)) || a.priority - b.priority || b.timestamp - a.timestamp
    );
  }, [received, seenAlertIds]);

  const clusters = useMemo(() => {
    const out: Cluster[] = [];
    for (const alert of sorted) {
      const hit = grouped
        ? out.find((c) => c.primary.category === alert.category && withinRadius(bestPosition(c.primary), bestPosition(alert)))
        : undefined;
      if (hit) hit.members.push(alert);
      else out.push({ key: alert.id, primary: alert, members: [alert] });
    }
    return out;
  }, [sorted, grouped]);

  const paged = usePagedList(clusters, 20);
  const goMessage = (senderId: string) => {
    setActiveConversation(senderId);
    onNavigate('messages');
  };

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pt-3">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Alerts</h1>

      {sorted.length > 1 && (
        <Toggle checked={grouped} onChange={setGrouped} label="Group reports of the same incident" />
      )}

      {sorted.length === 0 && receivedHazards.length === 0 && (
        <Card className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <ShieldCheck aria-hidden="true" className="h-9 w-9 text-[var(--safe-ink)]" />
          <p className="text-lg font-bold text-[var(--fg)]">No alerts nearby.</p>
          <p className="text-base text-[var(--fg-secondary)]">Everything quiet.</p>
        </Card>
      )}

      {paged.visible.map((cluster) => {
        const alert = cluster.primary;
        const location = alertLocationLabel(alert);
        const sealed = !alert.unsealedPreciseLocation && Boolean(alert.sealedPreciseLocation);
        const people = cluster.members.reduce((n, m) => n + m.headcount, 0);
        return (
          <Card as="article" key={cluster.key} className="flex flex-col gap-3 border-2 border-[var(--sos)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-wide text-[var(--sos-ink)] uppercase">SOS</p>
                <h2 className="text-xl font-bold text-[var(--fg)]">{categoryLabel(alert.category)}</h2>
                <p className="text-base font-semibold text-[var(--fg)]">{alert.senderName}</p>
              </div>
              <p className="shrink-0 text-right text-sm text-[var(--fg-secondary)]">{timeAgo(alert.timestamp)}</p>
            </div>

            <p className="text-sm text-[var(--fg-secondary)]">
              {hopsLabel(alert.hops)}
              {cluster.members.length > 1 && ` · ${cluster.members.length} reports, ${people} people`}
            </p>
            {alert.text && <p className="text-base break-words text-[var(--fg)]">{alert.text}</p>}

            {location && (
              <p className="flex items-start gap-2 text-base text-[var(--fg)]">
                <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                <span className="min-w-0 break-words">{location}</span>
              </p>
            )}
            {sealed && (
              <p className="flex items-center gap-2 text-sm text-[var(--fg-secondary)]">
                <Lock aria-hidden="true" className="h-4 w-4 shrink-0" />
                Exact location is sealed for verified responders.
              </p>
            )}

            {alert.offlineUrgencyHint && (
              <div className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                <p className="text-sm font-bold text-[var(--fg-secondary)]">{sanketContent.offlineHintBadge}</p>
                <p className="text-base break-words text-[var(--fg)]">
                  {alert.offlineUrgencyHint.level}: {alert.offlineUrgencyHint.reason}
                </p>
              </div>
            )}

            {alert.responderAcks.length > 0 && (
              <ul className="flex flex-col gap-1">
                {alert.responderAcks.map((ack) => (
                  <li key={ack.ackPacketId} className="flex items-center gap-2 text-sm text-[var(--fg)]">
                    {ack.verifiedCert ? (
                      <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--verified-ink)]" />
                    ) : (
                      <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--fg-secondary)]" />
                    )}
                    <span className="min-w-0 break-words">
                      {ack.verifiedCert ? 'Verified responder' : 'Acknowledged by'} {ack.responderName}
                      {ack.status === 'RESPONDING' && ack.verifiedCert ? ', on the way' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <AlertActions alert={alert} onMessage={goMessage} />

            <p className="truncate text-xs text-[var(--fg-secondary)]">
              Via {routeSummary(alert.route, peers, identity.nodeId, identity.displayName)}
            </p>
          </Card>
        );
      })}
      <ShowMoreButton hiddenCount={paged.hiddenCount} onClick={paged.showMore} label="Show more alerts" />

      {receivedHazards.length > 0 && (
        <>
          <h2 className="mt-2 text-lg font-bold text-[var(--fg)]">Hazards reported</h2>
          {receivedHazards.map((h) => (
            <Card as="article" key={h.id} className="flex items-start gap-3 p-4">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[var(--warn-ink)]" />
              <div className="min-w-0">
                <p className="text-base font-bold text-[var(--fg)]">{h.title}</p>
                <p className="text-sm break-words text-[var(--fg-secondary)]">{h.description}</p>
                <p className="mt-1 text-sm text-[var(--fg-secondary)]">
                  {h.senderName} · {timeAgo(h.timestamp)}
                </p>
              </div>
            </Card>
          ))}
        </>
      )}
    </section>
  );
}
