import { useEffect, useRef, useState } from 'react';
import { gsap, EASINGS } from '../lib/gsap';

/**
 * Custom Cursor (src/components/Cursor.tsx)
 * -----------------------------------------------------------------------------
 * Small dot with a lagging ring that expands over interactive items with a
 * label ([data-cursor]). Automatically disabled on touch / mobile (<768px).
 */
export function Cursor({ reducedMotion }: { reducedMotion: boolean }) {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState('');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (reducedMotion || typeof window === 'undefined') {
      setEnabled(false);
      return;
    }
    const update = () => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      setEnabled(!coarse && window.innerWidth >= 768);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [reducedMotion]);

  useEffect(() => {
    if (!enabled) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const ctx = gsap.context(() => {
      gsap.set([dot, ring], { xPercent: -50, yPercent: -50, opacity: 0 });

      const xDot = gsap.quickTo(dot, 'x', { duration: 0.08, ease: EASINGS.expoOut });
      const yDot = gsap.quickTo(dot, 'y', { duration: 0.08, ease: EASINGS.expoOut });
      const xRing = gsap.quickTo(ring, 'x', { duration: 0.38, ease: EASINGS.expoOut });
      const yRing = gsap.quickTo(ring, 'y', { duration: 0.38, ease: EASINGS.expoOut });

      let shown = false;

      const onMove = (e: MouseEvent) => {
        if (!shown) {
          shown = true;
          gsap.to([dot, ring], { opacity: 1, duration: 0.3, ease: EASINGS.expoOut });
        }
        xDot(e.clientX);
        yDot(e.clientY);
        xRing(e.clientX);
        yRing(e.clientY);

        const el = (e.target as HTMLElement | null)?.closest?.('[data-cursor]');
        if (el) {
          const text = el.getAttribute('data-cursor') || '';
          setLabel(text);
          gsap.to(ring, {
            width: 68,
            height: 68,
            backgroundColor: '#C6FF3D',
            borderColor: '#0B0B0B',
            duration: 0.32,
            ease: EASINGS.expoOut,
            overwrite: 'auto',
          });
          gsap.to(dot, { scale: 0, duration: 0.2, ease: EASINGS.expoOut });
        } else {
          setLabel('');
          gsap.to(ring, {
            width: 34,
            height: 34,
            backgroundColor: 'rgba(198, 255, 61, 0)',
            borderColor: 'var(--fg)',
            duration: 0.32,
            ease: EASINGS.expoOut,
            overwrite: 'auto',
          });
          gsap.to(dot, { scale: 1, duration: 0.2, ease: EASINGS.expoOut });
        }
      };

      window.addEventListener('mousemove', onMove, { passive: true });
      return () => window.removeEventListener('mousemove', onMove);
    });

    return () => ctx.revert();
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden select-none"
    >
      <div
        ref={ringRef}
        className="fixed top-0 left-0 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--fg)]/35 font-grotesk text-[11px] font-semibold text-[#0B0B0B] lowercase will-change-transform"
      >
        {label ? <span>{label}</span> : null}
      </div>
      <div
        ref={dotRef}
        className="fixed top-0 left-0 h-1.5 w-1.5 rounded-full bg-[var(--fg)] will-change-transform"
      />
    </div>
  );
}
