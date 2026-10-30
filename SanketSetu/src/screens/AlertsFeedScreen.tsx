/**
 * Incoming SOS & Emergency Alerts Feed Screen (src/screens/AlertsFeedScreen.tsx)
 * Per §4, §5, §8.6, §9.1, §9.2, §9.5, §9.7:
 * - Sorted by: Priority (P0 first) -> Recency (newest first) -> Proximity (fewest hops first).
 * - Incident Clustering toggle (§9.7): merges nearby SOS alerts of the same category within 200m.
 * - Responder-Sealed Precise Location display (§5 & §9.2): shows exact 5-decimal GPS only when
 *   unlocked by a Verified Responder Certificate (`DEMO AUTHORITY`); otherwise shows coarse (~1km) + locked badge.
 * - Displays Verified Responder `✔` vs `unverified` badges on `SOS_ACK` records.
 */

import { useState } from 'react';
import { ShowMoreButton, usePagedList } from '../ui/paging';
import { withinRadius } from '../lib/geo';

function bestPosition(a: StoredSOSAlert): { lat?: number; lng?: number } {
  return a.unsealedPreciseLocation ?? { lat: a.lat, lng: a.lng };
}
import { EmptyState } from '../ui/EmptyState';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Pill } from '../ui/Pill';
import {
  AlertTriangle,
  Check,
  Globe,
  Layers,
  Lock,
  MapPin,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlock,
  Users,
} from 'lucide-react';
import { AppScreenId, sanketContent } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { StoredSOSAlert } from '../mesh/types';

interface AlertsFeedScreenProps {
  onNavigate: (screen: AppScreenId) => void;
}

interface ClusteredIncident {
  clusterKey: string;
  primary: StoredSOSAlert;
  members: StoredSOSAlert[];
  totalHeadcount: number;
}

export function AlertsFeedScreen({ onNavigate }: AlertsFeedScreenProps) {
  const alerts = useMeshStore((s) => s.alerts);
  const respondToSOS = useMeshStore((s) => s.respondToSOS);
  const triggerVirtualResponderAck = useMeshStore(
    (s) => s.triggerVirtualResponderAck
  );
  const setActiveConversation = useMeshStore((s) => s.setActiveConversation);
  const identity = useMeshStore((s) => s.identity);
  const myResponderCert = useMeshStore((s) => s.myResponderCert);
  const enrollAsVerifiedResponder = useMeshStore(
    (s) => s.enrollAsVerifiedResponder
  );

  const [clusterMode, setClusterMode] = useState<boolean>(false);
  const [sortMode, setSortMode] = useState<'priority' | 'recent' | 'hops'>('priority');

  // Sort strictly by Priority -> Recency -> Proximity (hops)
  const sortedAlerts = [...alerts].sort((a, b) => {
    if (sortMode === 'recent') return b.timestamp - a.timestamp || a.priority - b.priority;
    if (sortMode === 'hops') return a.hops - b.hops || a.priority - b.priority;
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return a.hops - b.hops;
  });

  // Incident clustering: same category within 200 m. Civilians only see coarse (~1 km) positions, so
  // clusters form reliably only for alerts whose precise position this node can unseal (responders).
  const clusters: ClusteredIncident[] = [];
  if (clusterMode) {
    for (const alert of sortedAlerts) {
      const existing = clusters.find(
        (c) =>
          c.primary.category === alert.category &&
          withinRadius(bestPosition(c.primary), bestPosition(alert))
      );
      if (existing) {
        existing.members.push(alert);
        existing.totalHeadcount += alert.headcount;
      } else {
        clusters.push({
          clusterKey: alert.id,
          primary: alert,
          members: [alert],
          totalHeadcount: alert.headcount,
        });
      }
    }
  } else {
    for (const alert of sortedAlerts) {
      clusters.push({
        clusterKey: alert.id,
        primary: alert,
        members: [alert],
        totalHeadcount: alert.headcount,
      });
    }
  }

  const pagedClusters = usePagedList(clusters, 20);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-2 pb-28 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="type-mono-label text-[var(--sos-ink)]">
            04 / 08 — priority emergency feed (sorted: prio → recency → hops)
          </span>
          <h1 className="type-h2 mt-0.5 font-grotesk text-[var(--fg)]">
            Alerts ({sortedAlerts.length})
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Sort alerts" className="flex rounded-full border border-[var(--line)] bg-[var(--surface)] p-1">
            {([['priority', 'Priority'], ['recent', 'Newest'], ['hops', 'Nearest']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={sortMode === id}
                onClick={() => setSortMode(id)}
                className={`min-h-[44px] rounded-full px-3 text-sm font-semibold ${sortMode === id ? 'bg-[var(--fg)] text-[var(--bg)]' : 'text-[var(--fg)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setClusterMode((v) => !v)}
            className={`flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 font-mono text-xs font-bold uppercase transition-colors ${
              clusterMode
                ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--fg)]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>
              {clusterMode ? 'incident clustering: on' : 'cluster incidents'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('ai')}
            className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 font-mono text-xs font-bold text-[var(--fg)] hover:bg-[var(--surface-2)]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--relay-ink)]" />
            <span>ai triage</span>
          </button>

          <Button
            type="button"
            tone="danger"
            onClick={() => onNavigate('sos')}
            className="rounded-full text-sm"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>New SOS</span>
          </Button>
        </div>
      </div>

      {/* Responder Role Status Banner */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          {myResponderCert ? (
            <>
              <Unlock className="h-4 w-4 text-[var(--verified-ink)]" />
              <span className="font-mono font-bold text-[var(--fg)]">
                ✔ Enrolled as Verified Responder ({myResponderCert.role} ·{' '}
                {myResponderCert.organizationName}) — Exact sealed SOS GPS coordinates are UNLOCKED.
              </span>
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 text-[var(--sos-ink)]" />
              <span className="font-mono text-[var(--muted)]">
                Standard Civilian Node — You see coarse (~1km) SOS coordinates. Exact 5-decimal GPS is sealed to Verified Responders.
              </span>
            </>
          )}
        </div>
        {!myResponderCert && (
          <button
            type="button"
            onClick={() =>
              enrollAsVerifiedResponder(
                'NDRF_MEDIC',
                'NDRF Field Rescue Unit (DEMO AUTHORITY)'
              )
            }
            className="min-h-[36px] cursor-pointer rounded-full bg-[var(--accent-green)] px-3.5 py-1.5 font-mono text-[10px] font-bold text-[var(--on-fill)] uppercase"
          >
            enroll demo responder cert ✔ (unseal gps)
          </button>
        )}
      </div>

      <div className="space-y-4">
        {pagedClusters.visible.length === 0 && (
          <EmptyState title="No alerts" >New emergency alerts will appear here when received.</EmptyState>
        )}
        {pagedClusters.visible.map((cluster) => {
          const alert = cluster.primary;
          const isMine = alert.senderId === identity.nodeId;
          const mergedCount = cluster.members.length;

          return (
            <Card
              as="article"
              key={cluster.clusterKey}
              className="overflow-hidden border-2 border-[var(--accent-coral)]/45 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--accent-coral)] px-3 py-1 font-mono text-xs font-bold text-white uppercase">
                    SOS · {alert.category} · P{alert.priority}
                  </span>
                  {mergedCount > 1 && (
                    <span className="rounded-full bg-[var(--fg)] px-3 py-1 font-mono text-xs font-bold text-[var(--bg)] uppercase">
                      CLUSTERED: {mergedCount} REPORTS ({cluster.totalHeadcount}{' '}
                      PEOPLE)
                    </span>
                  )}
                  <span className="rounded-full bg-[var(--accent-lilac)] px-3 py-1 font-mono text-xs font-bold text-[var(--on-fill)]">
                    {alert.hops === 0
                      ? 'LOCAL ORIGIN (0 HOPS)'
                      : `${alert.hops} HOP${alert.hops > 1 ? 'S' : ''} AWAY`}
                  </span>
                  <span className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 font-mono text-xs font-bold text-[var(--verified-ink)]">
                    Reached {alert.reachedNodeIds.length} node(s) (lower bound)
                  </span>
                  {alert.bridgedOnline && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-green)] px-3 py-1 font-mono text-xs font-bold text-[var(--on-fill)]">
                      <Globe className="h-3 w-3" />
                      <span>SETU BRIDGED ONLINE (DEMO)</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--muted)]">
                  <ShieldCheck className="h-4 w-4 text-[var(--verified-ink)]" />
                  <span>Ed25519 Verified · #{alert.senderId}</span>
                </div>
              </div>

              <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div className="space-y-2">
                  <h2 className="font-grotesk text-lg font-bold text-[var(--fg)]">
                    {alert.senderName}
                  </h2>
                  <p className="text-base leading-relaxed text-[var(--fg)]">
                    {alert.text}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-xs text-[var(--muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-[var(--fg)]" />
                      <span>Headcount: {cluster.totalHeadcount}</span>
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Radio className="h-3.5 w-3.5 text-[var(--relay-ink)]" />
                      <span>Route: {alert.route.join(' → ')}</span>
                    </span>

                    {/* Location Display: Coarse vs Responder-Unsealed Precise */}
                    {alert.locationPrecision !== 'disabled' &&
                      alert.lat !== undefined &&
                      alert.lng !== undefined && (
                        <>
                          <span>·</span>
                          {alert.unsealedPreciseLocation ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-green)] px-2.5 py-0.5 font-bold text-[var(--on-fill)]">
                              <Unlock className="h-3 w-3" />
                              <span>
                                UNSEALED EXACT GPS:{' '}
                                {alert.unsealedPreciseLocation.lat.toFixed(5)},{' '}
                                {alert.unsealedPreciseLocation.lng.toFixed(5)} (±
                                {alert.unsealedPreciseLocation.accuracyMeters}m)
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[var(--verified-ink)]">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>
                                COARSE (~1KM): {alert.lat.toFixed(2)},{' '}
                                {alert.lng.toFixed(2)}
                              </span>
                              {alert.sealedPreciseLocation && (
                                <span className="ml-1 inline-flex items-center gap-1 rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                                  <Lock className="h-2.5 w-2.5" />
                                  <span>Exact GPS Sealed to Responder Key</span>
                                </span>
                              )}
                            </span>
                          )}
                        </>
                      )}
                  </div>
                </div>

                {/* Responder Actions */}
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void respondToSOS(alert.id, 'RELAY_RECEIPT')}
                    className={`flex min-h-[46px] cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 font-mono text-xs font-bold uppercase transition-colors ${
                      alert.acknowledgedByMe
                        ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)] text-white'
                        : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)] hover:border-[var(--fg)]'
                    }`}
                  >
                    <Check className="h-4 w-4" />
                    <span>
                      {alert.acknowledgedByMe ? 'acknowledged' : 'acknowledge'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void respondToSOS(alert.id, 'SOS_RESPONDING')
                    }
                    className={`flex min-h-[46px] cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 font-mono text-xs font-bold uppercase transition-colors ${
                      alert.respondingByMe
                        ? 'bg-[var(--accent-green)] text-[var(--on-fill)]'
                        : 'bg-[var(--fg)] text-[var(--bg)]'
                    }`}
                  >
                    <span>
                      {alert.respondingByMe ? 'en route ✔' : 'mark en route'}
                    </span>
                  </button>

                  {isMine && (
                    <button
                      type="button"
                      onClick={() =>
                        void triggerVirtualResponderAck(
                          alert.id,
                          'RESPONDING',
                          true
                        )
                      }
                      className="flex min-h-[46px] cursor-pointer items-center rounded-full bg-[var(--accent-green)] px-3.5 py-2 font-mono text-[11px] font-bold text-[var(--on-fill)] uppercase"
                    >
                      sim medic-d ack ✔
                    </button>
                  )}

                  {!isMine && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveConversation(alert.senderId);
                        onNavigate('messages');
                      }}
                      className="flex min-h-[46px] cursor-pointer items-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 font-mono text-xs font-bold text-[var(--fg)] uppercase"
                    >
                      direct msg
                    </button>
                  )}
                </div>
              </div>

              {/* Verified & Unverified Responder Acknowledgements */}
              {alert.responderAcks.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
                  {alert.responderAcks.map((ack) => (
                    <div
                      key={ack.ackPacketId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-1.5 font-mono text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[var(--fg)]">
                          {ack.responderName}
                        </span>
                        {ack.verifiedCert ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-green)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--on-fill)]">
                            <ShieldCheck className="h-3 w-3" />
                            <span>✔ VERIFIED ({ack.certRole})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 text-[10px] text-[var(--muted)] uppercase">
                            <ShieldAlert className="h-3 w-3 text-[var(--sos-ink)]" />
                            <span>unverified</span>
                          </span>
                        )}
                        <span className="text-[11px] text-[var(--verified-ink)] uppercase">
                          {ack.status} · {ack.hops} hop{ack.hops === 1 ? '' : 's'}
                        </span>
                      </div>
                      {ack.note && (
                        <span className="text-[11px] text-[var(--muted)]">
                          “{ack.note}”
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Offline Rule-Based Urgency Hint */}
              {alert.offlineUrgencyHint && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <Pill>{sanketContent.offlineHintBadge}</Pill>
                    <span className="font-bold text-[var(--fg)]">
                      {alert.offlineUrgencyHint.level}:
                    </span>
                    <span className="text-[var(--muted)]">
                      {alert.offlineUrgencyHint.reason}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        <ShowMoreButton hiddenCount={pagedClusters.hiddenCount} onClick={pagedClusters.showMore} label="Show more alerts" />
      </div>
    </section>
  );
}
