/**
 * Mocked Demo Data & Scenarios (src/lib/demoData.ts)
 * -----------------------------------------------------------------------------
 * Deterministic fallback telemetry results for all 8 NOVA product scenarios
 * used by src/lib/demoAdapter.ts.
 */

export interface DemoActionItem {
  id: string;
  title: string;
  detail: string;
  impact: string;
  confidence: number;
  tag: string;
}

export interface DemoChartPoint {
  label: string;
  baseline: number;
  optimized: number;
}

export interface DemoResult {
  /** High-level synthesis paragraph streamed into the output panel */
  summary: string;
  /** Overall confidence / optimization score (0..100) */
  score: number;
  /** Execution latency in milliseconds */
  latencyMs: number;
  /** Ranked action items or findings */
  items: DemoActionItem[];
  /** Time-series or category comparison points for the output chart */
  chartSeries: DemoChartPoint[];
  /** Raw metadata for JSON export */
  meta: {
    model: string;
    region: string;
    timestamp: string;
    inputTokens: number;
    scenarioId?: string;
  };
}

export const DEMO_PRESETS: Record<string, DemoResult> = {
  'incident-triage': {
    summary:
      'Root cause isolated to PostgreSQL connection pool exhaustion in eu-west-2 triggered by unindexed JSONB lookup in release v4.18.2 (commit #a84f29). NOVA prepared an idempotent pooler patch and hot-standby failover plan that restores p99 latency from 2,840ms down to 14ms with zero dropped transactions.',
    score: 98,
    latencyMs: 14,
    items: [
      {
        id: 'act-1',
        title: 'drain & hot-patch pgbouncer pooler on eu-west-2',
        detail: 'increases max_client_conn to 4,096 and enables transaction-level pooling.',
        impact: '-99.4% p99 latency',
        confidence: 99,
        tag: 'auto-remediation',
      },
      {
        id: 'act-2',
        title: 'create concurrent gin index on ledger_events.payload',
        detail: 'eliminates sequential scan across 18.4M rows introduced in v4.18.2.',
        impact: '-84% cpu load',
        confidence: 97,
        tag: 'schema guard',
      },
      {
        id: 'act-3',
        title: 'reroute 35% of read traffic to fra-edge replica',
        detail: 'balances regional ingress while primary index builds online.',
        impact: '0 dropped reqs',
        confidence: 96,
        tag: 'traffic shift',
      },
    ],
    chartSeries: [
      { label: '00s', baseline: 92, optimized: 88 },
      { label: '10s', baseline: 96, optimized: 42 },
      { label: '20s', baseline: 99, optimized: 24 },
      { label: '30s', baseline: 95, optimized: 14 },
    ],
    meta: {
      model: 'nova-core-v2.4-fp8',
      region: 'eu-west-2 (frankfurt)',
      timestamp: '2025-05-14T09:42:11.084Z',
      inputTokens: 1420,
      scenarioId: 'incident-triage',
    },
  },

  'fraud-screening': {
    summary:
      'Evaluated 18,400 cross-border SEPA and card-not-present settlement events in 0.9ms. NOVA isolated a 42-node synthetic mule ring operating across 3 issuing banks while whitelisting 100% of verified recurring enterprise merchants—reducing false-positive declines by 64%.',
    score: 99,
    latencyMs: 11,
    items: [
      {
        id: 'fr-1',
        title: 'quarantine 42 synthetic mule IBANs on settlement edge',
        detail: 'blocks coordinated cyclic velocity bursts before clearing window.',
        impact: '$1.8M fraud blocked',
        confidence: 99,
        tag: 'graph ring guard',
      },
      {
        id: 'fr-2',
        title: 'apply adaptive 3ds2 exemption for verified b2b renewals',
        detail: 'prevents false-positive friction on known corporate treasury cards.',
        impact: '-64% false positives',
        confidence: 98,
        tag: 'precision allow',
      },
      {
        id: 'fr-3',
        title: 'publish signed SAR evidence bundle to compliance vault',
        detail: 'attaches deterministic subgraph lineage for instant regulator audit.',
        impact: '100% audit trail',
        confidence: 97,
        tag: 'compliance',
      },
    ],
    chartSeries: [
      { label: 'q1', baseline: 84, optimized: 31 },
      { label: 'q2', baseline: 88, optimized: 29 },
      { label: 'q3', baseline: 91, optimized: 27 },
      { label: 'q4', baseline: 94, optimized: 24 },
    ],
    meta: {
      model: 'nova-risk-v2.4-fp8',
      region: 'eu-central-1 (zurich)',
      timestamp: '2025-05-14T09:43:05.112Z',
      inputTokens: 2640,
      scenarioId: 'fraud-screening',
    },
  },

  'supply-chain': {
    summary:
      'Correlated Rotterdam berth telemetry, North Sea 48kt gale vectors, and customs clearance queues. NOVA predicted a 54-hour cold-chain dwell spike and pre-booked intermodal rail slots via Duisburg for 64 priority pharmaceutical containers—preserving 98.4% ETA precision.',
    score: 97,
    latencyMs: 16,
    items: [
      {
        id: 'sc-1',
        title: 'divert 64 reefer containers to Antwerp-Duisburg rail corridor',
        detail: 'bypasses Rotterdam terminal crane suspension ahead of gale front.',
        impact: '48h delay avoided',
        confidence: 98,
        tag: 'intermodal shift',
      },
      {
        id: 'sc-2',
        title: 'pre-clear customs manifest #NL-8841 via electronic phytosanitary link',
        detail: 'eliminates manual port inspection hold on temperature-sensitive cargo.',
        impact: '0% spoilage risk',
        confidence: 97,
        tag: 'customs sync',
      },
      {
        id: 'sc-3',
        title: 're-index downstream warehouse dock schedules in Munich',
        detail: 'aligns receiving crews with updated rail arrival telemetry.',
        impact: '98.4% eta accuracy',
        confidence: 95,
        tag: 'dock dispatch',
      },
    ],
    chartSeries: [
      { label: 'port', baseline: 89, optimized: 22 },
      { label: 'rail', baseline: 76, optimized: 18 },
      { label: 'customs', baseline: 82, optimized: 15 },
      { label: 'last-mile', baseline: 71, optimized: 14 },
    ],
    meta: {
      model: 'nova-logistics-v2.4',
      region: 'eu-west-1 (amsterdam)',
      timestamp: '2025-05-14T09:43:48.902Z',
      inputTokens: 1980,
      scenarioId: 'supply-chain',
    },
  },

  'patient-flow': {
    summary:
      'Synthesized emergency department intake surge (+34% high-acuity arrivals) across 4 metro hospitals. NOVA orchestrated telemetry bed turnover, portable CT slot dispatch, and cross-unit nurse handoffs—cutting median ED boarding wait time by 41%.',
    score: 96,
    latencyMs: 15,
    items: [
      {
        id: 'pf-1',
        title: 'fast-track 14 step-down telemetry discharges with ready transport',
        detail: 'unlocks acute cardiac beds 95 minutes ahead of manual ward rounds.',
        impact: '-41% ed wait time',
        confidence: 98,
        tag: 'bed turnover',
      },
      {
        id: 'pf-2',
        title: 'rebalance 6 incoming ambulance transfers to St. Jude West',
        detail: 'prevents triage bottleneck at Central Trauma during shift change.',
        impact: '100% acuity match',
        confidence: 96,
        tag: 'ems routing',
      },
      {
        id: 'pf-3',
        title: 'auto-schedule priority radiology reads for stroke protocol',
        detail: 'reserves CT-02 window within 8 minutes of triage registration.',
        impact: '-19m door-to-scan',
        confidence: 95,
        tag: 'clinical sla',
      },
    ],
    chartSeries: [
      { label: 'triage', baseline: 88, optimized: 46 },
      { label: 'imaging', baseline: 82, optimized: 39 },
      { label: 'bed-sync', baseline: 91, optimized: 42 },
      { label: 'handoff', baseline: 79, optimized: 34 },
    ],
    meta: {
      model: 'nova-clinical-v2.4',
      region: 'us-east-1 (boston)',
      timestamp: '2025-05-14T09:44:12.330Z',
      inputTokens: 2110,
      scenarioId: 'patient-flow',
    },
  },

  'energy-grid': {
    summary:
      'Balanced a sudden 420MW cloud-cover drop across regional solar arrays coinciding with 18:00 EV fast-charging peak. NOVA dispatched utility-scale LFP battery banks across 64 substations in 12ms—holding grid frequency at 50.00Hz (99.98% stability).',
    score: 99,
    latencyMs: 12,
    items: [
      {
        id: 'eg-1',
        title: 'dispatch 280MW synthetic inertia from substation BESS clusters',
        detail: 'injects sub-cycle reactive power to arrest frequency nadir at 49.98Hz.',
        impact: '99.98% stability',
        confidence: 99,
        tag: 'grid frequency',
      },
      {
        id: 'eg-2',
        title: 'modulate commercial V2G & fleet depot charging by 18% for 22m',
        detail: 'smooths feeder transformer thermal load without impacting departure SOC.',
        impact: '-140MW peak shave',
        confidence: 97,
        tag: 'demand response',
      },
      {
        id: 'eg-3',
        title: 'pre-ramp hydro pumped-storage turbine #04 on alpine tie-line',
        detail: 'bridges evening solar ramp-down with zero peaker gas ignition.',
        impact: '0t co2 fallback',
        confidence: 96,
        tag: 'clean dispatch',
      },
    ],
    chartSeries: [
      { label: '18:00', baseline: 95, optimized: 50 },
      { label: '18:15', baseline: 98, optimized: 50 },
      { label: '18:30', baseline: 92, optimized: 49 },
      { label: '18:45', baseline: 86, optimized: 50 },
    ],
    meta: {
      model: 'nova-grid-v2.4-fp8',
      region: 'eu-central-1 (zurich)',
      timestamp: '2025-05-14T09:45:01.710Z',
      inputTokens: 1760,
      scenarioId: 'energy-grid',
    },
  },

  'support-routing': {
    summary:
      'Synthesized 420 Q3 enterprise escalations and product telemetry. 78% of seat contractions correlate with SSO provisioning friction during first-week onboarding and slow CSV export jobs (>45s). Deploying automated SCIM self-healing achieves an 89% first-touch solve rate.',
    score: 95,
    latencyMs: 16,
    items: [
      {
        id: 'ch-1',
        title: 'enable zero-touch scim group role reconciliation',
        detail: 'resolves #1 enterprise onboarding blocker affecting 64 accounts.',
        impact: '89% first-touch',
        confidence: 97,
        tag: 'auto-resolve',
      },
      {
        id: 'ch-2',
        title: 'switch reporting pipeline to apache arrow stream',
        detail: 'cuts 500k-row export wait time from 48s to 1.1s in browser.',
        impact: '43x faster export',
        confidence: 95,
        tag: 'performance',
      },
      {
        id: 'ch-3',
        title: 'trigger proactive slack workflow on usage drop >22%',
        detail: 'alerts customer success 19 days before renewal risk window.',
        impact: '-38% logo churn',
        confidence: 93,
        tag: 'lifecycle',
      },
    ],
    chartSeries: [
      { label: 'wk 1', baseline: 78, optimized: 85 },
      { label: 'wk 2', baseline: 64, optimized: 88 },
      { label: 'wk 3', baseline: 52, optimized: 91 },
      { label: 'wk 4', baseline: 44, optimized: 95 },
    ],
    meta: {
      model: 'nova-cx-v2.4-fp8',
      region: 'us-east-1 (virginia)',
      timestamp: '2025-05-14T09:44:02.512Z',
      inputTokens: 3890,
      scenarioId: 'support-routing',
    },
  },

  'content-moderation': {
    summary:
      'Evaluated 48,000 multimodal marketplace listings and live stream transcripts against policy graphs in 13ms. NOVA isolated a coordinated credential-phishing campaign across 310 throwaway accounts with 99.3% policy precision and zero false takedowns on verified creators.',
    score: 98,
    latencyMs: 13,
    items: [
      {
        id: 'cm-1',
        title: 'neutralize 310 homoglyph phishing links in live chat overlays',
        detail: 'matches visual OCR embeddings + domain registration age < 2h.',
        impact: '99.3% precision',
        confidence: 99,
        tag: 'multimodal guard',
      },
      {
        id: 'cm-2',
        title: 'preserve context-verified security education streams',
        detail: 'distinguishes benign red-team demonstrations from malicious lures.',
        impact: '0 false takedowns',
        confidence: 97,
        tag: 'context proof',
      },
      {
        id: 'cm-3',
        title: 'commit cryptographic policy citation log for appeal review',
        detail: 'links every enforcement action to exact clause and timestamp.',
        impact: '100% auditable',
        confidence: 98,
        tag: 'governance',
      },
    ],
    chartSeries: [
      { label: 'text', baseline: 82, optimized: 99 },
      { label: 'ocr', baseline: 74, optimized: 98 },
      { label: 'audio', baseline: 71, optimized: 97 },
      { label: 'graph', baseline: 79, optimized: 99 },
    ],
    meta: {
      model: 'nova-trust-v2.4-fp8',
      region: 'us-west-2 (oregon)',
      timestamp: '2025-05-14T09:45:44.019Z',
      inputTokens: 2420,
      scenarioId: 'content-moderation',
    },
  },

  'anomaly-alerts': {
    summary:
      'Detected unthrottled speculative decoding on staging GPU cluster (h100-pool-03) and duplicate embedding jobs running every 15 minutes. Enabling semantic request caching (68% hit rate) and dynamic FP8 quantization saves $42,000/mo (-42%) with zero accuracy degradation.',
    score: 97,
    latencyMs: 15,
    items: [
      {
        id: 'co-1',
        title: 'activate hnsw semantic cache for recurring prompts',
        detail: 'serves 68% of repeated classification queries in 1.8ms without GPU.',
        impact: '-$24.4k / mo',
        confidence: 98,
        tag: 'semantic cache',
      },
      {
        id: 'co-2',
        title: 'auto-scale staging h100 nodes to zero outside CI runs',
        detail: 'eliminates 148 idle GPU hours per week on preview branches.',
        impact: '-$11.9k / mo',
        confidence: 97,
        tag: 'finops',
      },
      {
        id: 'co-3',
        title: 'deduplicate vector re-indexing via content sha256',
        detail: 'skips unchanged document chunks during nightly knowledge sync.',
        impact: '-$5.7k / mo',
        confidence: 95,
        tag: 'pipeline',
      },
    ],
    chartSeries: [
      { label: 'mon', baseline: 88, optimized: 52 },
      { label: 'tue', baseline: 94, optimized: 49 },
      { label: 'wed', baseline: 98, optimized: 48 },
      { label: 'thu', baseline: 91, optimized: 46 },
    ],
    meta: {
      model: 'nova-finops-v2.4-fp8',
      region: 'eu-central-1 (zurich)',
      timestamp: '2025-05-14T09:46:19.204Z',
      inputTokens: 2150,
      scenarioId: 'anomaly-alerts',
    },
  },
};

export function selectMockResultForInput(
  input: string,
  scenarioId?: string
): DemoResult {
  if (scenarioId && DEMO_PRESETS[scenarioId]) {
    return DEMO_PRESETS[scenarioId];
  }

  const normalized = input.toLowerCase();
  if (normalized.includes('sepa') || normalized.includes('fraud') || normalized.includes('mule')) {
    return DEMO_PRESETS['fraud-screening'];
  }
  if (normalized.includes('rotterdam') || normalized.includes('cold-chain') || normalized.includes('freight')) {
    return DEMO_PRESETS['supply-chain'];
  }
  if (normalized.includes('hospital') || normalized.includes('triage') || normalized.includes('acuity')) {
    return DEMO_PRESETS['patient-flow'];
  }
  if (normalized.includes('420mw') || normalized.includes('solar') || normalized.includes('50.00hz')) {
    return DEMO_PRESETS['energy-grid'];
  }
  if (normalized.includes('churn') || normalized.includes('support') || normalized.includes('scim')) {
    return DEMO_PRESETS['support-routing'];
  }
  if (normalized.includes('phishing') || normalized.includes('moderation') || normalized.includes('marketplace')) {
    return DEMO_PRESETS['content-moderation'];
  }
  if (normalized.includes('gpu') || normalized.includes('cost') || normalized.includes('spend')) {
    return DEMO_PRESETS['anomaly-alerts'];
  }
  if (normalized.includes('latency') || normalized.includes('eu-west') || normalized.includes('p99')) {
    return DEMO_PRESETS['incident-triage'];
  }

  const preview = input.trim().slice(0, 72);
  return {
    ...DEMO_PRESETS['incident-triage'],
    summary: `NOVA analyzed "${preview}${input.length > 72 ? '...' : ''}" across 14 telemetry streams, verified causal dependencies in 15ms, and generated 3 deterministic execution steps with 97.8% consensus confidence.`,
    score: 97,
    meta: {
      ...DEMO_PRESETS['incident-triage'].meta,
      timestamp: new Date().toISOString(),
      inputTokens: Math.max(128, input.trim().length * 4),
    },
  };
}
