/** Congestion Benchmark result (src/ui/BenchmarkCard.tsx): SOS vs normal latency, p50 / p95, measured. */

import type { BenchmarkClassStats, CongestionBenchmarkSummary } from '../mesh/metrics';
import { Badge } from './Badge';

function Column({ title, tone, stats }: { title: string; tone: string; stats: BenchmarkClassStats }) {
  const fmt = (v: number | null) => (v === null ? 'n/a' : `${v} ms`);
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3">
      <h3 className={`text-base font-bold ${tone}`}>{title}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <dt className="text-sm text-[var(--fg-secondary)]">p50</dt>
          <dd className="text-[1.75rem] leading-tight font-bold text-[var(--fg)] tabular-nums">{fmt(stats.p50Ms)}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--fg-secondary)]">p95</dt>
          <dd className="text-[1.75rem] leading-tight font-bold text-[var(--fg)] tabular-nums">{fmt(stats.p95Ms)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-sm text-[var(--fg-secondary)]">
        {stats.arrived} of {stats.sent} arrived
      </p>
    </div>
  );
}

export function BenchmarkCard({ result }: { result: CongestionBenchmarkSummary | null }) {
  return (
    <section aria-label="Congestion benchmark" className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[var(--fg)]">SOS vs normal traffic</h2>
        <Badge tone="warn">SIMULATED</Badge>
      </div>
      {result ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Column title="SOS (priority 0)" tone="text-[var(--sos-ink)]" stats={result.sos} />
            <Column title="Normal (priority 2)" tone="text-[var(--verified-ink)]" stats={result.normal} />
          </div>
          <p className="mt-3 text-sm text-[var(--fg-secondary)]">
            Measured on the in-app simulated mesh (3 hops, simulated per-hop delay), from send until the
            packet reaches the destination node. Best effort, not a guarantee; real radios will differ.
          </p>
        </>
      ) : (
        <p className="mt-2 text-base text-[var(--fg-secondary)]">
          Run the benchmark to send background traffic and SOS beacons through the same simulated path and compare their measured latency.
        </p>
      )}
    </section>
  );
}
