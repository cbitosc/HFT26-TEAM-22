/**
 * Interactive Multi-Node Virtual Mesh Simulator Screen (src/screens/SimulatorScreen.tsx)
 * Per §3, §8.10 & §11:
 * - Default 4-node chain: A -> B -> C -> D where A cannot reach D directly (arrives via 3 hops).
 * - Drag node positions, adjust radio range, latency, packet loss.
 * - Break or restore middle link (B <-> C) with one click to verify store-and-forward + anti-entropy sync.
 * - Send test E2E message (A -> D) or SOS broadcast and watch live delivery states transition:
 *   PENDING -> SENT -> RELAYED (n hops) -> DELIVERED.
 */

import React, { useRef, useState } from 'react';
import {
  Activity,
  Gauge,
  Plus,
  Play,
  RadioTower,
  RotateCcw,
  Unlink,
  Wifi,
} from 'lucide-react';
import { sanketContent } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { PriorityLevel } from '../mesh/types';

export function SimulatorScreen() {
  const identity = useMeshStore((s) => s.identity);
  const simNodes = useMeshStore((s) => s.simNodes);
  const simLinks = useMeshStore((s) => s.simLinks);
  const simRadioRange = useMeshStore((s) => s.simRadioRange);
  const simLatencyMs = useMeshStore((s) => s.simLatencyMs);
  const simPacketLossPct = useMeshStore((s) => s.simPacketLossPct);
  const messages = useMeshStore((s) => s.messages);
  const outbox = useMeshStore((s) => s.outbox);
  const meshQuality = useMeshStore((s) => s.meshQuality);
  const dropLog = useMeshStore((s) => s.dropLog);

  const setSimNodePosition = useMeshStore((s) => s.setSimNodePosition);
  const setSimNodeOnline = useMeshStore((s) => s.setSimNodeOnline);
  const toggleSimLinkBlocked = useMeshStore((s) => s.toggleSimLinkBlocked);
  const setSimRadioRange = useMeshStore((s) => s.setSimRadioRange);
  const setSimLatencyMs = useMeshStore((s) => s.setSimLatencyMs);
  const setSimPacketLossPct = useMeshStore((s) => s.setSimPacketLossPct);
  const addVirtualSimNode = useMeshStore((s) => s.addVirtualSimNode);
  const resetFourNodeChainPreset = useMeshStore(
    (s) => s.resetFourNodeChainPreset
  );
  const sendDirectMessage = useMeshStore((s) => s.sendDirectMessage);
  const triggerRemoteSimSOS = useMeshStore((s) => s.triggerRemoteSimSOS);
  const runCongestionBenchmark = useMeshStore((s) => s.runCongestionBenchmark);

  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [runningBenchmark, setRunningBenchmark] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string>(
    'Ready: 4-Node Linear Chain (A ↔ B ↔ C ↔ D). Node A cannot reach Node D directly (3 hops).'
  );

  // Identify nodes B, C, D in the chain
  const nodeB = simNodes[1];
  const nodeC = simNodes[2];
  const nodeD = simNodes[simNodes.length - 1];

  const linkBC =
    nodeB && nodeC
      ? simLinks.find(
          (l) =>
            (l.nodeA === nodeB.nodeId && l.nodeB === nodeC.nodeId) ||
            (l.nodeA === nodeC.nodeId && l.nodeB === nodeB.nodeId)
        )
      : undefined;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingNodeId || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 1000 / Math.max(1, rect.width);
    const scaleY = 520 / Math.max(1, rect.height);
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setSimNodePosition(draggingNodeId, x, y);
  };

  const handleTestMultiHopSend = async () => {
    if (!nodeD) return;
    const msg = await sendDirectMessage(
      nodeD.nodeId,
      `Multi-hop E2E test A→D at ${new Date().toLocaleTimeString()} (TTL 8)`,
      1
    );
    setStatusBanner(
      `Dispatched Packet #${msg.id.slice(0, 8)} from Node A to ${nodeD.displayName}. Watch state transition below!`
    );
  };

  const handleToggleMiddleLink = () => {
    if (!nodeB || !nodeC) return;
    toggleSimLinkBlocked(nodeB.nodeId, nodeC.nodeId);
    const wasBlocked = linkBC?.manuallyBlocked;
    setStatusBanner(
      wasBlocked
        ? `Restored middle link B↔C! Anti-entropy SYNC_INV automatically delivers queued packets.`
        : `Severed middle link B↔C! Messages sent A→D will stay queued in store-and-forward until restored.`
    );
  };

  const handleTestRemoteSOS = async () => {
    const origin = nodeD ?? simNodes[0];
    if (!origin) return;
    await triggerRemoteSimSOS(
      origin.nodeId,
      'trapped',
      `SIMULATED SOS from ${origin.displayName}: 4 survivors in stairwell, requesting extraction.`
    );
    setStatusBanner(
      `Broadcasted P0 SOS from ${origin.displayName} (TTL 12). Flooded across all reachable nodes.`
    );
  };

  const handleRunCongestionBenchmark = async () => {
    if (runningBenchmark) return;
    setRunningBenchmark(true);
    setStatusBanner(
      'Running Congestion Benchmark: flooding 8 P2/P3 packets while dispatching a P0 SOS across A→B→C→D...'
    );
    try {
      const res = await runCongestionBenchmark();
      if (res) {
        setStatusBanner(
          `Benchmark Complete: P0 SOS Latency ${res.sosLatencyMs} ms vs P2 Normal Mean Latency ${res.normalMeanLatencyMs} ms (${res.sosBypassSpeedupFactor}x faster under load).`
        );
      }
    } finally {
      setRunningBenchmark(false);
    }
  };

  const priorities: PriorityLevel[] = [0, 1, 2, 3];

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-2 pb-28 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="type-mono-label text-[var(--relay-ink)]">
            06 / 07 — interactive multi-node mesh testbed ({sanketContent.simulatedBadge})
          </span>
          <h1 className="type-h2 mt-0.5 font-grotesk text-[var(--fg)] lowercase">
            4-node chain (a→b→c→d), link break & epidemic sync simulator
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void addVirtualSimNode()}
            className="flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 font-mono text-xs font-bold text-[var(--fg)] hover:bg-[var(--surface-2)]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ virtual phone</span>
          </button>

          <button
            type="button"
            onClick={() => void resetFourNodeChainPreset()}
            className="flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 font-mono text-xs font-bold text-[var(--fg)] hover:bg-[var(--surface-2)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>reset a→b→c→d chain</span>
          </button>
        </div>
      </div>

      {/* Primary Demo Action Bar for Judges */}
      <div className="nova-card mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleTestMultiHopSend()}
              data-testid="sim-send-multihop"
              className="flex min-h-[48px] cursor-pointer items-center gap-2 rounded-full bg-[var(--accent-green)] px-5 py-2.5 font-grotesk text-xs font-bold text-[var(--on-fill)] shadow-xs"
            >
              <Play className="h-4 w-4" />
              <span>1. send e2e message a → d (3 hops)</span>
            </button>

            <button
              type="button"
              onClick={handleToggleMiddleLink}
              data-testid="sim-toggle-link-bc"
              className={`flex min-h-[48px] cursor-pointer items-center gap-2 rounded-full border px-5 py-2.5 font-grotesk text-xs font-bold transition-colors ${
                linkBC?.manuallyBlocked
                  ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)] text-white'
                  : 'border-[var(--accent-coral)] bg-[var(--accent-coral)]/15 text-[var(--sos-ink)]'
              }`}
            >
              {linkBC?.manuallyBlocked ? (
                <>
                  <Wifi className="h-4 w-4" />
                  <span>2. restore middle link (b↔c) & sync</span>
                </>
              ) : (
                <>
                  <Unlink className="h-4 w-4" />
                  <span>2. break middle link (b↔c)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleTestRemoteSOS()}
              data-testid="sim-broadcast-sos"
              className="flex min-h-[48px] cursor-pointer items-center gap-2 rounded-full bg-[var(--accent-coral)] px-5 py-2.5 font-grotesk text-xs font-bold text-white"
            >
              <RadioTower className="h-4 w-4" />
              <span>3. broadcast test sos</span>
            </button>

            <button
              type="button"
              onClick={() => void handleRunCongestionBenchmark()}
              disabled={runningBenchmark}
              data-testid="sim-congestion-benchmark"
              className="flex min-h-[48px] cursor-pointer items-center gap-2 rounded-full border border-[var(--accent-blue)] bg-[var(--accent-blue)] px-5 py-2.5 font-grotesk text-xs font-bold text-white disabled:opacity-60"
            >
              <Gauge className="h-4 w-4" />
              <span>
                {runningBenchmark
                  ? 'running congestion benchmark...'
                  : '4. congestion benchmark (p0 sos vs p2/p3)'}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2 font-mono text-xs text-[var(--fg)]">
          {statusBanner}
        </div>
      </div>

      {/* Interactive Drag-and-Drop Virtual Mesh Canvas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="nova-card overflow-hidden p-4 lg:col-span-8">
          <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-[var(--muted)]">
            <span>DRAG ANY PHONE TO CHANGE DISTANCE · CLICK A LINK TO BREAK/RESTORE</span>
            <span>RADIO RANGE: {simRadioRange}m</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]">
            <svg
              ref={svgRef}
              viewBox="0 0 1000 520"
              onPointerMove={handlePointerMove}
              onPointerUp={() => setDraggingNodeId(null)}
              onPointerLeave={() => setDraggingNodeId(null)}
              className="h-[340px] w-full touch-none select-none sm:h-[380px]"
            >
              {/* Radio Links */}
              {simLinks.map((link) => {
                const nA = simNodes.find((n) => n.nodeId === link.nodeA);
                const nB = simNodes.find((n) => n.nodeId === link.nodeB);
                if (!nA || !nB) return null;
                if (!link.inRange && !link.manuallyBlocked) return null;

                const midX = (nA.x + nB.x) / 2;
                const midY = (nA.y + nB.y) / 2;

                return (
                  <g
                    key={`${link.nodeA}-${link.nodeB}`}
                    className="cursor-pointer"
                    onClick={() => toggleSimLinkBlocked(link.nodeA, link.nodeB)}
                  >
                    <line
                      x1={nA.x}
                      y1={nA.y}
                      x2={nB.x}
                      y2={nB.y}
                      stroke={
                        link.active
                          ? 'var(--verified)'
                          : link.manuallyBlocked
                            ? 'var(--sos)'
                            : 'rgba(120,120,120,0.3)'
                      }
                      strokeWidth={link.active ? 3.5 : 2.5}
                      strokeDasharray={link.active ? undefined : '8 6'}
                    />
                    <rect
                      x={midX - 48}
                      y={midY - 12}
                      width={96}
                      height={24}
                      rx={12}
                      fill={link.manuallyBlocked ? 'var(--sos)' : 'var(--surface)'}
                      stroke="var(--line)"
                    />
                    <text
                      x={midX}
                      y={midY + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill={link.manuallyBlocked ? 'var(--on-sos)' : 'var(--fg)'}
                    >
                      {link.manuallyBlocked
                        ? 'BROKEN (TAP)'
                        : `${link.distance}m · OK`}
                    </text>
                  </g>
                );
              })}

              {/* Virtual Phone Nodes */}
              {simNodes.map((node, idx) => {
                const isMe = node.nodeId === identity.nodeId;
                const labelLetter = String.fromCharCode(65 + idx);
                return (
                  <g
                    key={node.nodeId}
                    transform={`translate(${node.x}, ${node.y})`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setDraggingNodeId(node.nodeId);
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    {/* Radio Range Halo on Drag */}
                    {draggingNodeId === node.nodeId && (
                      <circle
                        r={simRadioRange}
                        fill="none"
                        stroke="var(--verified)"
                        strokeWidth={1.5}
                        strokeDasharray="6 6"
                      />
                    )}
                    <circle
                      r={28}
                      fill={
                        !node.online
                          ? 'var(--fg-secondary)'
                          : isMe
                            ? 'var(--lime)'
                            : idx === simNodes.length - 1
                              ? 'var(--verified)'
                              : 'var(--relay)'
                      }
                      stroke="var(--fg)"
                      strokeWidth={2.5}
                    />
                    <text
                      y={5}
                      textAnchor="middle"
                      fontSize="14"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill={
                        !node.online || idx === simNodes.length - 1
                          ? 'var(--on-sos)'
                          : 'var(--on-fill)'
                      }
                    >
                      {labelLetter}
                    </text>
                    <rect
                      x={-72}
                      y={34}
                      width={144}
                      height={24}
                      rx={8}
                      fill="var(--surface)"
                      stroke="var(--line)"
                    />
                    <text
                      y={50}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill="var(--fg)"
                    >
                      {node.displayName.slice(0, 18)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Right Column: Radio Parameters & Live Delivery-State Transitions */}
        <div className="flex flex-col gap-4 lg:col-span-4">
          <div className="nova-card space-y-3 p-4">
            <div className="type-mono-label text-[var(--muted)]">
              radio environment sliders
            </div>

            <div>
              <div className="flex justify-between font-mono text-xs">
                <span>Radio Range</span>
                <span className="font-bold">{simRadioRange}m</span>
              </div>
              <input
                type="range"
                min={120}
                max={550}
                value={simRadioRange}
                onChange={(e) => setSimRadioRange(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--accent-blue)]"
                aria-label="Radio Range Slider"
              />
            </div>

            <div>
              <div className="flex justify-between font-mono text-xs">
                <span>Per-Hop Latency</span>
                <span className="font-bold">{simLatencyMs}ms</span>
              </div>
              <input
                type="range"
                min={0}
                max={400}
                step={5}
                value={simLatencyMs}
                onChange={(e) => setSimLatencyMs(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--accent-blue)]"
                aria-label="Per-Hop Latency Slider"
              />
            </div>

            <div>
              <div className="flex justify-between font-mono text-xs">
                <span>Packet Loss %</span>
                <span className="font-bold">{simPacketLossPct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={75}
                step={5}
                value={simPacketLossPct}
                onChange={(e) => setSimPacketLossPct(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--accent-coral)]"
                aria-label="Packet Loss Percentage Slider"
              />
            </div>

            {/* Toggle Virtual Nodes Online/Offline */}
            <div className="border-t border-[var(--line)] pt-2">
              <div className="font-mono text-[10px] font-bold text-[var(--muted)] uppercase">
                node power toggles
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {simNodes.map((n, i) => (
                  <button
                    key={n.nodeId}
                    type="button"
                    onClick={() => setSimNodeOnline(n.nodeId, !n.online)}
                    className={`min-h-[36px] cursor-pointer rounded-lg border px-2.5 py-1 font-mono text-[10px] font-bold ${
                      n.online
                        ? 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg)]'
                        : 'border-[var(--accent-coral)] bg-[var(--accent-coral)] text-white'
                    }`}
                  >
                    Node {String.fromCharCode(65 + i)}:{' '}
                    {n.online ? 'ON' : 'OFF'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Delivery State Machine Log */}
          <div className="nova-card flex-1 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="type-mono-label text-[var(--muted)]">
                delivery transitions ({messages.length})
              </span>
              <span className="font-mono text-[10px] font-bold text-[var(--relay-ink)]">
                Outbox: {outbox.length}
              </span>
            </div>

            <div className="max-h-52 space-y-2 overflow-y-auto">
              {messages
                .slice()
                .reverse()
                .slice(0, 6)
                .map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-2.5 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--fg)]">
                        #{m.id.slice(0, 6)} · {m.packet.type}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          m.deliveryState === 'DELIVERED'
                            ? 'bg-[var(--accent-blue)] text-white'
                            : m.deliveryState === 'RELAYED'
                              ? 'bg-[var(--accent-lilac)] text-[var(--on-fill)]'
                              : 'bg-[var(--accent-green)] text-[var(--on-fill)]'
                        }`}
                      >
                        {m.deliveryState} ({m.relayedHops}h)
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-[var(--muted)]">
                      {m.text}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--verified-ink)]">
                      Route: {m.route.join(' → ')}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Priority 3: Mesh Quality & Congestion Benchmark Telemetry Panel */}
      <div
        className="nova-card mt-4 p-4 sm:p-5"
        data-testid="mesh-quality-panel"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--verified-ink)]" />
            <span className="type-mono-label text-[var(--fg)]">
              mesh quality & per-priority telemetry ({sanketContent.simulatedBadge})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-[var(--muted)]">
            <span>Relayed: {meshQuality.packetsRelayed}</span>
            <span>Overhear Suppressed: {meshQuality.packetsSuppressedDuplicate}</span>
            <span>Scan Duty: {meshQuality.scanDutyCyclePct}%</span>
          </div>
        </div>

        {/* Side-by-side SOS vs Normal Latency Congestion Benchmark Card */}
        <div className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs font-bold text-[var(--fg)]">
              CONGESTION BENCHMARK · P0 SOS BYPASS VS P2/P3 NORMAL QUEUE
            </span>
            {meshQuality.lastBenchmark && (
              <span className="rounded-full bg-[var(--accent-green)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--on-fill)]">
                P0 SOS {meshQuality.lastBenchmark.sosBypassSpeedupFactor}x FASTER UNDER LOAD
              </span>
            )}
          </div>

          {meshQuality.lastBenchmark ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--accent-coral)]/40 bg-[var(--surface)] p-3">
                <div className="font-mono text-[10px] font-bold text-[var(--sos-ink)] uppercase">
                  P0 · SOS Beacon Latency (0–10ms Jitter)
                </div>
                <div className="mt-1 font-grotesk text-2xl font-bold text-[var(--fg)]">
                  {meshQuality.lastBenchmark.sosLatencyMs} ms
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                  Strict head-of-line priority dequeue
                </div>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="font-mono text-[10px] font-bold text-[var(--verified-ink)] uppercase">
                  P2 · Normal Mean Latency ({meshQuality.lastBenchmark.floodPacketsCount} Flood Pkts)
                </div>
                <div className="mt-1 font-grotesk text-2xl font-bold text-[var(--fg)]">
                  {meshQuality.lastBenchmark.normalMeanLatencyMs} ms
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                  Max: {meshQuality.lastBenchmark.normalMaxLatencyMs} ms (10–50ms jitter)
                </div>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="font-mono text-[10px] font-bold text-[var(--relay-ink)] uppercase">
                  Priority Advantage Ratio
                </div>
                <div className="mt-1 font-grotesk text-2xl font-bold text-[var(--fg)]">
                  {meshQuality.lastBenchmark.sosBypassSpeedupFactor}x
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                  P0 never dropped; P3→P2 shed under congestion
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-1.5 font-mono text-xs text-[var(--muted)]">
              Click &ldquo;4. congestion benchmark (p0 sos vs p2/p3)&rdquo; above to flood 8 background P2 packets while sending a P0 SOS across the 4-node chain and compare latencies side by side.
            </p>
          )}
        </div>

        {/* Per-Priority Class (P0..P3) Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] text-[10px] text-[var(--muted)] uppercase">
                <th className="py-2 pr-3">Queue Class</th>
                <th className="px-2 py-2">Sent</th>
                <th className="px-2 py-2">Delivered</th>
                <th className="px-2 py-2">Delivery %</th>
                <th className="px-2 py-2">Mean Latency</th>
                <th className="px-2 py-2">Jitter (σ)</th>
                <th className="px-2 py-2">Avg Hops</th>
                <th className="pl-2 py-2">Retries (Rate)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {priorities.map((prio) => {
                const row = meshQuality.byPriority[prio];
                return (
                  <tr key={prio} className="text-[var(--fg)]">
                    <td className="py-2 pr-3 font-bold">{row.label}</td>
                    <td className="px-2 py-2">{row.sentCount}</td>
                    <td className="px-2 py-2">{row.deliveredCount}</td>
                    <td className="px-2 py-2 font-bold text-[var(--verified-ink)]">
                      {row.deliveryRatioPct}%
                    </td>
                    <td className="px-2 py-2">
                      {row.meanLatencyMs > 0 ? `${row.meanLatencyMs} ms` : '—'}
                    </td>
                    <td className="px-2 py-2">
                      {row.jitterStdDevMs > 0 ? `±${row.jitterStdDevMs} ms` : '0 ms'}
                    </td>
                    <td className="px-2 py-2">
                      {row.avgHops > 0 ? `${row.avgHops} hops` : '—'}
                    </td>
                    <td className="pl-2 py-2">
                      {row.retries} ({row.retryRate}/pkt)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Drop Reasons & Replay/Security Audit Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3 font-mono text-[11px] text-[var(--muted)]">
          <div className="flex flex-wrap gap-3">
            <span>
              Replay (±5m) Drops:{' '}
              <strong className="text-[var(--fg)]">
                {meshQuality.dropCounts.replay_window}
              </strong>
            </span>
            <span>
              Seen-Cache Dedup:{' '}
              <strong className="text-[var(--fg)]">
                {meshQuality.dropCounts.seen_duplicate}
              </strong>
            </span>
            <span>
              Invalid Sig Drops:{' '}
              <strong className="text-[var(--sos-ink)]">
                {meshQuality.dropCounts.invalid_signature}
              </strong>
            </span>
            <span>
              TTL=0 Expired:{' '}
              <strong className="text-[var(--fg)]">
                {meshQuality.dropCounts.ttl_expired}
              </strong>
            </span>
            <span>
              Rate-Limited:{' '}
              <strong className="text-[var(--fg)]">
                {meshQuality.dropCounts.rate_limited}
              </strong>
            </span>
          </div>
          {dropLog.length > 0 && (
            <span className="truncate text-[10px] text-[var(--relay-ink)]">
              Last drop: [{dropLog[dropLog.length - 1].reason}]{' '}
              {dropLog[dropLog.length - 1].detail}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
