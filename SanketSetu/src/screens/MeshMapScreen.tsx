/**
 * Mesh Map Screen — 3D / 2D Topology Graph, Dead-Zone Risk & Hazard Beacons (src/screens/MeshMapScreen.tsx)
 * Per §8.7, §8.11, §8.12:
 * - Toggle between Interactive 2D/3D-perspective Topology Graph and Node List view
 * - Highlights "DEAD-ZONE RISK" nodes (nodes with ≤ 1 active link that are 1 link away from isolation)
 * - Plots active signed Hazard Beacons (`flood`, `collapse`, `fire`, `blocked_road`) on the map.
 */

import { useState } from 'react';
import { ShowMoreButton, usePagedList } from '../ui/paging';
import {
  Activity,
  AlertOctagon,
  List,
  MessageSquareLock,
  Network,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import { AppScreenId, sanketContent } from '../content';
import { useMeshStore } from '../store/useMeshStore';

interface MeshMapScreenProps {
  onNavigate: (screen: AppScreenId) => void;
}

export function MeshMapScreen({ onNavigate }: MeshMapScreenProps) {
  const identity = useMeshStore((s) => s.identity);
  const peers = useMeshStore((s) => s.peers);
  const hazards = useMeshStore((s) => s.hazards);
  const simNodes = useMeshStore((s) => s.simNodes);
  const simLinks = useMeshStore((s) => s.simLinks);
  const simTransmissions = useMeshStore((s) => s.simTransmissions);
  const setActiveConversation = useMeshStore((s) => s.setActiveConversation);
  const pagedPeers = usePagedList(peers, 20);

  const [viewMode, setViewMode] = useState<'topology' | 'list'>('topology');
  const [is3dTilt, setIs3dTilt] = useState<boolean>(true);

  // Dead-Zone Risk detection (§8.12): compute active link degree for each node.
  // Any online node with active degree <= 1 is 1 link away from total mesh isolation!
  const activeDegreeByNode = new Map<string, number>();
  for (const n of simNodes) {
    activeDegreeByNode.set(n.nodeId, 0);
  }
  for (const l of simLinks) {
    if (l.active) {
      activeDegreeByNode.set(
        l.nodeA,
        (activeDegreeByNode.get(l.nodeA) ?? 0) + 1
      );
      activeDegreeByNode.set(
        l.nodeB,
        (activeDegreeByNode.get(l.nodeB) ?? 0) + 1
      );
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-2 pb-28 sm:px-6">
      {/* Header + 3D/2D Graph vs List View Toggle */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="type-mono-label text-[var(--muted)]">
            06 / 08 — live p2p_cluster topology, dead-zone risk & hazards (
            {sanketContent.simulatedBadge})
          </span>
          <h1 className="type-h2 mt-0.5 font-grotesk text-[var(--fg)] lowercase">
            multi-hop radio graph & dead-zone risk
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === 'topology' && (
            <button
              type="button"
              onClick={() => setIs3dTilt((v) => !v)}
              className="min-h-[44px] cursor-pointer rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-1.5 font-mono text-xs font-bold text-[var(--fg)]"
            >
              {is3dTilt ? '3D Isometric Tilt: ON' : '2D Flat Plan: ON'}
            </button>
          )}

          <div className="flex items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-1">
            <button
              type="button"
              onClick={() => setViewMode('topology')}
              className={`flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1 font-mono text-xs font-bold uppercase transition-colors ${
                viewMode === 'topology'
                  ? 'bg-[var(--fg)] text-[var(--bg)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              <Network className="h-3.5 w-3.5" />
              <span>topology</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1 font-mono text-xs font-bold uppercase transition-colors ${
                viewMode === 'list'
                  ? 'bg-[var(--fg)] text-[var(--bg)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>list view</span>
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'topology' ? (
        <div className="nova-card overflow-hidden p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-[var(--muted)]">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-green)]" />
                <span>Your Node ({identity.displayName})</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-blue)]" />
                <span>Direct Neighbor (1 hop)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-lilac)]" />
                <span>Multi-Hop Relay (2–3 hops)</span>
              </span>
              <span className="flex items-center gap-1.5 font-bold text-[var(--sos-ink)]">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-[var(--accent-coral)]" />
                <span>Dead-Zone Risk (≤1 Active Link)</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('simulator')}
              className="cursor-pointer font-bold text-[var(--verified-ink)] underline"
            >
              Drag nodes or break links in Simulator →
            </button>
          </div>

          {/* Interactive SVG Topology Stage with 3D Isometric Perspective Option */}
          <div className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-2">
            <svg
              viewBox="0 0 1000 560"
              className="h-[360px] w-full transition-transform duration-500 sm:h-[420px]"
              style={{
                transform: is3dTilt
                  ? 'perspective(1100px) rotateX(18deg) scale(0.96)'
                  : 'none',
              }}
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
                  <g key={`${link.nodeA}-${link.nodeB}`}>
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
                            : 'rgba(120,120,120,0.28)'
                      }
                      strokeWidth={link.active ? 3 : 2}
                      strokeDasharray={link.active ? undefined : '8 6'}
                    />
                    <rect
                      x={midX - 54}
                      y={midY - 13}
                      width={108}
                      height={24}
                      rx={12}
                      fill="var(--surface)"
                      stroke="var(--line)"
                    />
                    <text
                      x={midX}
                      y={midY + 3}
                      textAnchor="middle"
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill={link.active ? 'var(--fg)' : 'var(--sos)'}
                    >
                      {link.active
                        ? `${link.linkQuality}% · ${link.rssi}dBm`
                        : 'LINK SEVERED'}
                    </text>
                  </g>
                );
              })}

              {/* Hazard Beacons plotted on Topology Stage (§8.11) */}
              {hazards.slice(0, 4).map((hz, idx) => {
                const hx = 280 + idx * 210;
                const hy = 475;
                return (
                  <g
                    key={hz.id}
                    transform={`translate(${hx}, ${hy})`}
                    className="cursor-pointer"
                    onClick={() => onNavigate('circles')}
                  >
                    <rect
                      x={-92}
                      y={-18}
                      width={184}
                      height={34}
                      rx={10}
                      fill="var(--sos)"
                      stroke="var(--fg)"
                      strokeWidth={1.5}
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill="var(--on-sos)"
                    >
                      ⚠ HAZARD: {hz.category.toUpperCase()} ({hz.hops}H)
                    </text>
                  </g>
                );
              })}

              {/* Nodes with Dead-Zone Risk Halo (§8.12) */}
              {simNodes.map((node) => {
                const isMe = node.nodeId === identity.nodeId;
                const peerInfo = peers.find((p) => p.nodeId === node.nodeId);
                const hops = isMe ? 0 : peerInfo?.hopsAway ?? 1;
                const activeDeg = activeDegreeByNode.get(node.nodeId) ?? 0;
                const isDeadZoneRisk = node.online && activeDeg <= 1;

                const fillColor = !node.online
                  ? 'var(--fg-secondary)'
                  : isMe
                    ? 'var(--lime)'
                    : hops === 1
                      ? 'var(--verified)'
                      : 'var(--relay)';

                return (
                  <g
                    key={node.nodeId}
                    transform={`translate(${node.x}, ${node.y})`}
                    className="cursor-pointer"
                    onClick={() => {
                      if (!isMe) {
                        setActiveConversation(node.nodeId);
                        onNavigate('messages');
                      }
                    }}
                  >
                    {/* Dead-Zone Risk Outer Warning Ring */}
                    {isDeadZoneRisk && (
                      <circle
                        r={56}
                        fill="none"
                        stroke="var(--sos)"
                        strokeWidth={2.5}
                        strokeDasharray="6 5"
                      />
                    )}
                    <circle
                      r={42}
                      fill={fillColor}
                      fillOpacity={0.16}
                      stroke={fillColor}
                      strokeWidth={1.5}
                    />
                    <circle
                      r={24}
                      fill={fillColor}
                      stroke="var(--fg)"
                      strokeWidth={2}
                    />
                    <text
                      y={4}
                      textAnchor="middle"
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill={isMe || hops > 1 ? 'var(--on-fill)' : 'var(--on-sos)'}
                    >
                      {isMe ? 'YOU' : `${hops}H`}
                    </text>
                    <rect
                      x={-84}
                      y={32}
                      width={168}
                      height={26}
                      rx={8}
                      fill="var(--surface)"
                      stroke="var(--line)"
                    />
                    <text
                      y={49}
                      textAnchor="middle"
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill="var(--fg)"
                    >
                      {node.displayName.slice(0, 18)}
                    </text>
                    {isDeadZoneRisk && (
                      <g transform="translate(0, -48)">
                        <rect
                          x={-68}
                          y={-12}
                          width={136}
                          height={20}
                          rx={10}
                          fill="var(--sos)"
                        />
                        <text
                          y={2}
                          textAnchor="middle"
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="bold"
                          fill="var(--on-sos)"
                        >
                          DEAD-ZONE RISK ({activeDeg} LINK)
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Recent Wire Transmissions Ticker */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2 font-mono text-xs">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--verified-ink)]" />
              <span className="font-bold text-[var(--fg)]">
                Recent Radio Hop Events:
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {simTransmissions.slice(0, 4).map((tx) => (
                <span
                  key={tx.id}
                  className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 text-[10px] text-[var(--fg)]"
                >
                  {tx.packetType} (P{tx.priority}): #{tx.fromId.slice(0, 4)} → #
                  {tx.toId.slice(0, 4)}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* 2-Column Scannable Peer List View with Dead-Zone Risk Badge */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pagedPeers.visible.map((peer) => {
            const deg = activeDegreeByNode.get(peer.nodeId) ?? 1;
            const isDeadZoneRisk = deg <= 1;
            return (
              <div
                key={peer.nodeId}
                className="nova-card flex flex-col justify-between p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Radio className="h-4 w-4 text-[var(--verified-ink)]" />
                      <h2 className="font-grotesk text-base font-bold text-[var(--fg)]">
                        {peer.displayName}
                      </h2>
                    </div>
                    <div className="mt-1 font-mono text-xs text-[var(--muted)]">
                      Node ID #{peer.nodeId} · Trust:{' '}
                      {peer.trustStatus.toUpperCase()}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-3 py-1 font-mono text-xs font-bold ${
                        peer.isDirectNeighbor
                          ? 'bg-[var(--accent-green)] text-[var(--on-fill)]'
                          : 'bg-[var(--accent-lilac)] text-[var(--on-fill)]'
                      }`}
                    >
                      {peer.hopsAway} {peer.hopsAway === 1 ? 'HOP' : 'HOPS'}
                    </span>
                    {isDeadZoneRisk && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-coral)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-white uppercase">
                        <AlertOctagon className="h-3 w-3" />
                        <span>dead-zone risk ({deg} link)</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3">
                  <div className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
                    <ShieldCheck className="h-4 w-4 text-[var(--verified-ink)]" />
                    <span>
                      Link {peer.linkQuality}% · {peer.rssi} dBm
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConversation(peer.nodeId);
                      onNavigate('messages');
                    }}
                    className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full bg-[var(--fg)] px-4 py-1.5 font-mono text-xs font-bold text-[var(--bg)]"
                  >
                    <MessageSquareLock className="h-3.5 w-3.5" />
                    <span>message</span>
                  </button>
                </div>
              </div>
            );
          })}
          <ShowMoreButton hiddenCount={pagedPeers.hiddenCount} onClick={pagedPeers.showMore} label="Show more nodes" />
        </div>
      )}
    </section>
  );
}
