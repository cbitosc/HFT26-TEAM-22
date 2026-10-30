/**
 * Launch splash (src/ui/Splash.tsx). Pure SVG + CSS, no libraries, no WebGL.
 * Sequence (~1.2 s): two node dots appear -> a bridge arc draws between them -> a packet dot hops
 * across three nodes -> the wordmark and tagline fade in. The status line below shows the REAL init
 * step reported by the store. It ends when init is actually ready (minimum 0.8 s, maximum 3 s) and
 * can be skipped by tapping. With prefers-reduced-motion the logo is static.
 */

import { useEffect, useRef } from 'react';
import { useMeshStore } from '../store/useMeshStore';
import { useReducedMotion } from '../hooks/useReducedMotion';

const MIN_MS = 800;
const MAX_MS = 3000;

export function BridgeLogo({ className = '', animate = false }: { className?: string; animate?: boolean }) {
  return (
    <svg viewBox="0 0 240 110" className={`${className} ${animate ? 'splash-anim' : ''}`} role="img" aria-label="Sanket Setu logo: two nodes joined by a bridge arc">
      <path className="splash-arc" d="M40 78 Q120 -2 200 78" fill="none" stroke="var(--verified)" strokeWidth="6" strokeLinecap="round" pathLength={1} />
      <line x1="20" y1="88" x2="220" y2="88" stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
      <circle className="splash-node splash-node-1" cx="40" cy="78" r="11" fill="var(--verified)" />
      <circle className="splash-node splash-node-2" cx="200" cy="78" r="11" fill="var(--verified)" />
      <circle className="splash-node splash-node-3" cx="120" cy="24" r="9" fill="var(--relay-ink)" />
      <circle className="splash-packet" cx="40" cy="78" r="6" fill="var(--sos)" />
    </svg>
  );
}

export function Splash({ onDone }: { onDone: () => void }) {
  const step = useMeshStore((s) => s.initStep);
  const ready = useMeshStore((s) => s.initReady);
  const reduced = useReducedMotion();
  const startedAt = useRef(Date.now());
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_MS - (Date.now() - startedAt.current));
    const t = window.setTimeout(finish, wait);
    return () => window.clearTimeout(t);
  }, [ready]);

  useEffect(() => {
    const t = window.setTimeout(finish, MAX_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <button
      type="button"
      onClick={finish}
      aria-label="Starting Sanket Setu. Tap to skip."
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-[var(--bg)] px-6 text-center"
    >
      <BridgeLogo className="w-56" animate={!reduced} />
      <div className={reduced ? '' : 'splash-text'}>
        <p className="text-[2rem] leading-tight font-bold text-[var(--fg)]">Sanket Setu</p>
        <p className="text-base text-[var(--fg-secondary)]">Works with no internet.</p>
      </div>
      <p role="status" className="absolute bottom-[calc(32px+var(--safe-bottom))] text-sm text-[var(--fg-secondary)]">
        {step}…
      </p>
    </button>
  );
}
