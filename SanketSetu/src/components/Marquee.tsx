import { useEffect, useRef } from 'react';
import { siteContent } from '../content';
import { gsap, EASINGS } from '../lib/gsap';
import { scrollState } from '../lib/scroll';

/**
 * Velocity-Reversing Flat Keyword Marquee (src/components/Marquee.tsx)
 * -----------------------------------------------------------------------------
 * Runs across the bottom of Scene 4 as flat lowercase text that reverses
 * direction and accelerates with scroll velocity.
 */
export function Marquee({ reducedMotion }: { reducedMotion: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion || !trackRef.current) return;

    const ctx = gsap.context(() => {
      const tween = gsap.to(trackRef.current, {
        xPercent: -50,
        duration: 24,
        ease: 'none',
        repeat: -1,
        modifiers: {
          xPercent: gsap.utils.wrap(-50, 0),
        },
      });

      const tick = () => {
        const dir = scrollState.direction;
        const speedBoost = 1 + Math.min(Math.abs(scrollState.dampedVelocity) * 3.5, 4);
        gsap.to(tween, {
          timeScale: dir * speedBoost,
          duration: 0.25,
          ease: EASINGS.expoOut,
          overwrite: 'auto',
        });
      };

      gsap.ticker.add(tick);
      return () => {
        gsap.ticker.remove(tick);
      };
    });

    return () => ctx.revert();
  }, [reducedMotion]);

  const items = [
    ...siteContent.scene4Stats.marqueeKeywords,
    ...siteContent.scene4Stats.marqueeKeywords,
  ];

  return (
    <div className="w-full overflow-hidden border-y border-[var(--line)] py-3.5">
      <div
        ref={trackRef}
        className="flex w-max items-center gap-10 whitespace-nowrap will-change-transform"
      >
        {items.map((word, idx) => (
          <div key={`${word}-${idx}`} className="flex items-center gap-10">
            <span className="font-grotesk text-lg font-medium tracking-tight text-[var(--fg)] lowercase opacity-85 md:text-xl">
              {word}
            </span>
            <span className="h-2 w-2 rounded-full border border-[var(--fg)]/20 bg-[var(--accent)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
