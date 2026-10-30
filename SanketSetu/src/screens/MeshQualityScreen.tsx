/**
 * Mesh Quality (src/screens/MeshQualityScreen.tsx). Reads only from the MetricLogger snapshot in the
 * store (updated at most once per second, only when values change). Values come from whatever the
 * engine actually carried; when no real-radio peer is connected that is the simulated mesh, so the
 * panel says SIMULATED rather than presenting them as radio measurements.
 */

import { useMeshStore } from '../store/useMeshStore';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { StatCard } from '../ui/StatCard';
import type { PacketDropReason } from '../mesh/metrics';

const DROP_LABEL: Record<PacketDropReason, string> = {
  replay_window: 'Outside time window (replay)',
  seen_duplicate: 'Duplicate (already seen)',
  invalid_signature: 'Invalid signature',
  rate_limited: 'Peer rate-limited',
  ttl_expired: 'Hop limit reached',
  saver_policy: 'Dropped by battery saver',
  oversized: 'Too large',
  malformed: 'Not a valid packet',
  decrypt_failed: 'Could not decrypt',
};

const dash = (n: number | null | undefined, unit = '') => (n === null || n === undefined || n === 0 ? '—' : `${n}${unit}`);

export function MeshQualityScreen() {
  const q = useMeshStore((s) => s.meshQuality);
  const simulated = useMeshStore((s) => s.realRadioPeerCount === 0);
  const peerNow = useMeshStore((s) => s.peers.filter((p) => p.isDirectNeighbor).length);

  const rows = ([0, 1, 2, 3] as const).map((p) => q.byPriority[p]);
  const anyTraffic = rows.some((r) => r.sentCount > 0);
  const drops = (Object.keys(q.dropCounts) as PacketDropReason[]).filter((k) => q.dropCounts[k] > 0);

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[1.75rem] leading-tight font-bold text-[var(--fg)]">Mesh quality</h1>
        {simulated ? <Badge tone="warn">SIMULATED</Badge> : <Badge tone="verified">Real radio</Badge>}
      </div>
      <p className="text-base text-[var(--fg-secondary)]">
        Measured by this phone from the packets it has handled. Best effort, no guaranteed latency.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Direct peers" value={peerNow} simulated={simulated} />
        <StatCard label="Packets relayed" value={q.packetsRelayed} simulated={simulated} />
        <StatCard label="Scan duty" value={`${q.scanDutyCyclePct}%`} detail="Share of time scanning" />
        <StatCard label="Suppressed" value={q.packetsSuppressedDuplicate} detail="Skipped as already heard" simulated={simulated} />
      </div>

      <h2 className="text-lg font-bold text-[var(--fg)]">By priority</h2>
      {!anyTraffic ? (
        <EmptyState title="No traffic yet">Send a message or an SOS and the numbers will appear here.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.priority}>
              <Card className="p-4">
                <h3 className="text-base font-bold text-[var(--fg)]">{r.label}</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {[
                    ['Sent', r.sentCount],
                    ['Delivered', `${r.deliveredCount} (${r.deliveryRatioPct}%)`],
                    ['Mean latency', dash(r.meanLatencyMs, ' ms')],
                    ['Jitter (std dev)', dash(r.jitterStdDevMs, ' ms')],
                    ['Mean hops', dash(r.avgHops)],
                    ['Retries', `${r.retries} (${r.retryRate}/msg)`],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between gap-2">
                      <dt className="text-[var(--fg-secondary)]">{k}</dt>
                      <dd className="font-semibold text-[var(--fg)] tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-lg font-bold text-[var(--fg)]">Dropped packets</h2>
      {drops.length === 0 ? (
        <p className="text-base text-[var(--fg-secondary)]">None so far.</p>
      ) : (
        <Card className="divide-y divide-[var(--line)]">
          {drops.map((k) => (
            <div key={k} className="flex justify-between gap-3 px-4 py-3 text-base">
              <span className="text-[var(--fg)]">{DROP_LABEL[k]}</span>
              <span className="font-semibold text-[var(--fg)] tabular-nums">{q.dropCounts[k]}</span>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
