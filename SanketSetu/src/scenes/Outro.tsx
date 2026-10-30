import React, { useEffect, useRef } from 'react';
import { ArrowUp, ArrowUpRight } from 'lucide-react';
import { Section } from '../components/Section';
import { Pill } from '../components/ui';
import { siteContent } from '../content';
import { soundEngine } from '../lib/audio';
import {
  bindVariableProximityChars,
  gsap,
  SplitText,
  EASINGS,
} from '../lib/gsap';

/**
 * SECTION 08 – FINALE / OUTRO (src/scenes/Outro.tsx)
 * -----------------------------------------------------------------------------
 * Inverts to dark (#0A0A0A) using the shared <Section> contract (pinned 100svh).
 * The 3D Glass Orb returns to center stage in the persistent <Canvas>.
 */
export function OutroDOMOverlay({
  reducedMotion,
  onRestartScroll,
}: {
  activeScene?: number;
  reducedMotion: boolean;
  onRestartScroll: () => void;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const innerRevealRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const magneticBtnRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const section = containerRef.current;
    const headline = headlineRef.current;
    if (!section || !headline) return;

    let unbindProximity = () => {};

    const ctx = gsap.context(() => {
      if (innerRevealRef.current && !reducedMotion) {
        gsap.fromTo(
          innerRevealRef.current,
          { y: 24, opacity: 0.35 },
          {
            y: 0,
            opacity: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top 90%',
              end: 'top 25%',
              scrub: true,
            },
          }
        );
      }

      if (reducedMotion) {
        gsap.set(headline, { opacity: 1, y: 0 });
        return;
      }

      const split = new SplitText(headline, {
        type: 'words,chars',
        wordsClass: 'split-word',
        charsClass: 'split-char',
      });

      gsap.fromTo(
        split.chars,
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          stagger: 0.018,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 85%',
            once: true,
          },
        }
      );

      unbindProximity = bindVariableProximityChars(split.chars, reducedMotion);

      return () => {
        unbindProximity();
        split.revert();
      };
    }, containerRef);

    return () => {
      unbindProximity();
      ctx.revert();
    };
  }, [reducedMotion]);

  const handleMagneticMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (reducedMotion || !magneticBtnRef.current) return;
    const rect = magneticBtnRef.current.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width / 2)) * 0.32;
    const dy = (e.clientY - (rect.top + rect.height / 2)) * 0.32;
    gsap.to(magneticBtnRef.current, {
      x: dx,
      y: dy,
      duration: 0.28,
      ease: EASINGS.expoOut,
      overwrite: 'auto',
    });
  };

  const handleMagneticLeave = () => {
    if (reducedMotion || !magneticBtnRef.current) return;
    gsap.to(magneticBtnRef.current, {
      x: 0,
      y: 0,
      duration: 0.75,
      ease: EASINGS.elasticReturn,
      overwrite: 'auto',
    });
  };

  const headlineWords = siteContent.scene5Outro.headline.split(' ');

  const finaleHeader = (
    <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
      <div className="mb-2.5">
        <Pill accent="lime">{siteContent.scene5Outro.kicker}</Pill>
      </div>

      <h2
        ref={headlineRef}
        className="orb-overlap-legible font-grotesk text-statement-compact max-w-5xl font-semibold text-[#F6F4EF] lowercase"
      >
        {headlineWords.map((word, idx) => {
          let treatment = 'text-treatment-solid';
          if (idx === 0) {
            treatment = 'text-treatment-outline';
          } else if (idx === 2) {
            treatment = 'text-treatment-chrome';
          }
          return (
            <span key={`outro-w-${idx}`} className={treatment}>
              {word}
              {idx < headlineWords.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </h2>
    </div>
  );

  return (
    <Section
      id="outro"
      ref={containerRef}
      sectionName="finale"
      pinned
      themeOverride="dark"
      ariaLabel={siteContent.scene5Outro.headline}
      className="border-t border-white/10 bg-transparent text-[#F6F4EF]"
      header={finaleHeader}
      bodyClassName="justify-between items-center text-center"
    >
      {/* Open center stage for the converging 3D Glass Orb */}
      <div className="pointer-events-none flex-1 min-h-0 w-full" aria-hidden="true" />

      {/* Bottom CTA & Footer Links Dock */}
      <div
        ref={innerRevealRef}
        className="relative z-[var(--z-header)] flex w-full max-w-4xl flex-col items-center gap-5"
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            ref={magneticBtnRef}
            href={siteContent.scene5Outro.ctaHref}
            onMouseMove={handleMagneticMove}
            onMouseLeave={handleMagneticLeave}
            onMouseEnter={() => soundEngine.playTick(740, 0.03)}
            data-cursor={siteContent.chrome.cursorInspectLabel}
            className="inline-flex items-center gap-2.5 rounded-[var(--r-pill)] border-2 border-[#0B0B0B] bg-[var(--accent)] px-7 py-3.5 font-mono text-xs font-bold tracking-[0.18em] text-[#0B0B0B] uppercase shadow-[0_12px_40px_rgba(198,255,61,0.3)] transition-all hover:bg-white hover:text-[#0B0B0B] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--accent-2)] will-change-transform"
          >
            <span>{siteContent.scene5Outro.ctaButtonLabel}</span>
            <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </a>

          <button
            type="button"
            onClick={() => {
              soundEngine.playTick(620, 0.03);
              onRestartScroll();
            }}
            className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--r-pill)] border border-white/25 bg-[#141418] px-6 py-3.5 font-mono text-xs tracking-[0.16em] text-[#F6F4EF] uppercase transition-all hover:bg-white/15 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--accent-2)]"
          >
            <span>back to top</span>
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex w-full flex-col items-center justify-between gap-2 border-t border-white/15 pt-4 sm:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-6">
            {siteContent.scene5Outro.socials.map((soc) => (
              <a
                key={soc.label}
                href={soc.href}
                onClick={(e) => {
                  e.preventDefault();
                  soundEngine.playTick(620, 0.03);
                  onRestartScroll();
                }}
                data-cursor={siteContent.chrome.cursorInspectLabel}
                className="font-mono text-xs tracking-[0.16em] text-[#F6F4EF]/80 uppercase transition-colors hover:text-[#C6FF3D]"
              >
                {soc.label}
              </a>
            ))}
          </div>

          <p className="font-serif-editorial text-lg italic text-[#F6F4EF]/80">
            {siteContent.scene5Outro.serifSignoff}
          </p>
        </div>
      </div>
    </Section>
  );
}
