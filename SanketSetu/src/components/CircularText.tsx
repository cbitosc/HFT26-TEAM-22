import { useEffect, useRef } from 'react';
import { siteContent } from '../content';
import { gsap } from '../lib/gsap';
import { scrollState } from '../lib/scroll';

/**
 * Circular Rotating Text Label (src/components/CircularText.tsx)
 * -----------------------------------------------------------------------------
 * Text-on-path circular rotating label ("nova engine • 2025 •") in the bottom-left
 * corner, slowly rotating continuously and speeding up with scroll velocity.
 */
export function CircularText({ reducedMotion }: { reducedMotion: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (reducedMotion || !svgRef.current) return;

    let rotation = 0;
    const tick = (_time: number, deltaTime: number) => {
      if (!svgRef.current) return;
      const dt = Math.min(deltaTime / 1000, 0.05);
      const velocityBoost = Math.abs(scrollState.dampedVelocity) * 220;
      rotation = (rotation + (24 + velocityBoost) * dt) % 360;
      svgRef.current.style.transform = `rotate(${rotation.toFixed(2)}deg)`;
    };

    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
    };
  }, [reducedMotion]);

  const repeatedText = `${siteContent.chrome.circularText}${siteContent.chrome.circularText}`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-2 left-4 z-[var(--z-hud)] flex h-14 w-14 items-center justify-center select-none"
    >
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className="h-full w-full overflow-visible will-change-transform"
      >
        <defs>
          <path
            id="nova-circle-text-path"
            d="M 50, 50 m -36, 0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0"
          />
        </defs>
        <text
          fill="var(--muted)"
          className="font-grotesk text-[9.2px] font-medium tracking-[0.18em] lowercase"
        >
          <textPath href="#nova-circle-text-path" startOffset="0%">
            {repeatedText}
          </textPath>
        </text>
      </svg>
      <span className="absolute h-2 w-2 rounded-full border border-[var(--fg)]/30 bg-[var(--accent)]" />
    </div>
  );
}
