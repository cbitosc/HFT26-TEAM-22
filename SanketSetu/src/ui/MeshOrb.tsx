/**
 * Mesh status visual (src/ui/MeshOrb.tsx). Decorative only — the same information is always shown
 * as text elsewhere on screen.
 *
 * Default: a static CSS gradient orb with peer dots placed by CSS transforms (no animation, no GPU
 * canvas). The Three.js orb loads only when the user turns on "3D visuals" in Settings, and even
 * then falls back to this CSS orb while the app is backgrounded, in Saver mode, or when the user
 * prefers reduced motion. Never rendered on the SOS screen (callers simply don't include it).
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { useMeshStore } from '../store/useMeshStore';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { PeerNode } from '../mesh/types';

export type MeshOrbState = 'scanning' | 'connected' | 'sos';

const MeshOrbStage3D = lazy(() =>
  import('../scenes/MeshOrbStage').then((m) => ({ default: m.MeshOrbStage }))
);

const MAX_DOTS = 6;

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

function CssOrb({ state, peers }: { state: MeshOrbState; peers: PeerNode[] }) {
  const fill =
    state === 'sos'
      ? 'radial-gradient(circle at 35% 30%, var(--sos-tint), var(--sos) 70%)'
      : state === 'connected'
        ? 'radial-gradient(circle at 35% 30%, var(--verified-tint), var(--relay) 55%, var(--verified) 100%)'
        : 'radial-gradient(circle at 35% 30%, var(--surface), var(--relay-tint) 45%, var(--relay) 100%)';

  const dots = peers.slice(0, MAX_DOTS);
  return (
    <div aria-hidden="true" className="relative flex h-44 w-44 items-center justify-center">
      <div className="h-28 w-28 rounded-full shadow-[var(--shadow-2)]" style={{ background: fill }} />
      {dots.map((peer, i) => {
        const angle = (360 / dots.length) * i - 90;
        return (
          <span
            key={peer.nodeId}
            className={`absolute h-3.5 w-3.5 rounded-full border-2 border-[var(--surface)] ${
              peer.isDirectNeighbor ? 'bg-[var(--verified)]' : 'bg-[var(--relay-ink)]'
            }`}
            style={{ transform: `rotate(${angle}deg) translateX(76px)` }}
          />
        );
      })}
    </div>
  );
}

export function MeshOrb({ state, peers }: { state: MeshOrbState; peers: PeerNode[] }) {
  const visuals3D = useMeshStore((s) => s.visuals3D);
  const theme = useMeshStore((s) => s.theme);
  const powerMode = useMeshStore((s) => s.metrics.powerMode);
  const batteryPct = useMeshStore((s) => s.metrics.batteryPct);
  const reducedMotion = useReducedMotion();
  const visible = usePageVisible();

  const css = <CssOrb state={state} peers={peers} />;
  const allow3D = visuals3D && visible && !reducedMotion && powerMode !== 'saver' && batteryPct >= 15;
  if (!allow3D) return css;

  return (
    <Suspense fallback={css}>
      <MeshOrbStage3D
        orbState={state}
        peers={peers}
        powerMode={powerMode}
        batteryPct={batteryPct}
        theme={theme}
        isHomeScreen={true}
        reducedMotion={reducedMotion}
      />
    </Suspense>
  );
}
