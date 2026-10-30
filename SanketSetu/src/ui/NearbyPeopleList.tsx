/**
 * People list (src/ui/NearbyPeopleList.tsx): built only from phones this one has actually heard
 * from (signed HELLOs), never from fixtures. Plain language: "connected directly" or "reached
 * through N phones".
 */

import { memo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useMeshStore } from '../store/useMeshStore';
import { timeAgo } from '../lib/timeAgo';
import { Badge } from './Badge';
import { Card } from './Card';
import type { PeerNode } from '../mesh/types';

const Row = memo(function Row({ peer, onSelect }: { peer: PeerNode; onSelect?: (id: string) => void }) {
  const via = Math.max(0, peer.hopsAway - 1);
  const body = (
    <span className="flex min-w-0 flex-1 flex-col text-left">
      <span className="flex items-center gap-2">
        <span className="truncate text-base font-semibold text-[var(--fg)]">{peer.displayName}</span>
        {peer.trustStatus === 'verified' && (
          <ShieldCheck aria-label="Identity verified with QR" className="h-4 w-4 shrink-0 text-[var(--verified-ink)]" />
        )}
        {peer.trustStatus === 'key_changed' && <Badge tone="sos">Key changed</Badge>}
      </span>
      <span className="text-sm text-[var(--fg-secondary)]">
        {peer.isDirectNeighbor ? 'Connected directly' : `Reached through ${via} phone${via === 1 ? '' : 's'}`} · seen {timeAgo(peer.lastSeenTs)}
      </span>
    </span>
  );
  return onSelect ? (
    <button type="button" onClick={() => onSelect(peer.nodeId)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2">
      {body}
    </button>
  ) : (
    <div className="flex min-h-[64px] items-center gap-3 px-4 py-2">{body}</div>
  );
});

export function NearbyPeopleList({ onSelect }: { onSelect?: (nodeId: string) => void }) {
  const peers = useMeshStore((s) => s.peers);
  if (peers.length === 0) return null;
  return (
    <Card className="divide-y divide-[var(--line)] overflow-hidden">
      {peers.map((p) => (
        <Row key={p.nodeId} peer={p} onSelect={onSelect} />
      ))}
    </Card>
  );
}
