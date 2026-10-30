import { useEffect, useRef } from 'react';
import { Pill } from '../components/ui';
import {
  bindVariableProximityChars,
  gsap,
  SplitText,
} from '../lib/gsap';

interface SectionHeaderProps {
  indexLabel: string;
  headlineLead: string;
  chromeWord: string;
  outlineWord: string;
  headlineTail?: string;
  serifSubline?: string;
  reducedMotion: boolean;
  align?: 'center' | 'left';
  compact?: boolean;
}

/**
 * Global Section System Header (src/sections/SectionHeader.tsx)
 * -----------------------------------------------------------------------------
 * Shared header block across every product-story section:
 * 1) Shared <Pill dot> index pill ("06 — use cases") ABOVE the headline
 * 2) Variable-type headline split per letter with cursor-proximity weight/width,
 *    mixing solid, outline, and optional chrome word
 * 3) Optional italic serif subtitle (max-width: 62ch, centered or left)
 */
export function SectionHeader({
  indexLabel,
  headlineLead,
  chromeWord,
  outlineWord,
  headlineTail,
  serifSubline,
  reducedMotion,
  align = 'center',
  compact = false,
}: SectionHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!titleRef.current || !headerRef.current) return;

    let unbindProximity = () => {};

    const ctx = gsap.context(() => {
      const split = new SplitText(titleRef.current, {
        type: 'words,chars',
        wordsClass: 'split-word',
        charsClass: 'split-char',
      });

      if (!reducedMotion) {
        gsap.fromTo(
          split.chars,
          { y: 24, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            stagger: 0.014,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: headerRef.current,
              start: 'top 85%',
              once: true,
            },
          }
        );

        unbindProximity = bindVariableProximityChars(split.chars, reducedMotion);
      }

      return () => {
        unbindProximity();
        split.revert();
      };
    }, headerRef);

    return () => {
      unbindProximity();
      ctx.revert();
    };
  }, [reducedMotion]);

  const isLeft = align === 'left';

  return (
    <div
      ref={headerRef}
      className={`relative z-[var(--z-header)] flex flex-col ${
        isLeft ? 'items-start text-left' : 'mx-auto items-center text-center'
      } ${compact ? 'mb-2 md:mb-3' : 'mb-5 md:mb-8'} max-w-5xl`}
    >
      <div className="mb-2.5">
        <Pill dot>{indexLabel}</Pill>
      </div>

      <h2
        ref={titleRef}
        className={`font-grotesk ${
          compact ? 'text-statement-compact' : 'text-statement-lg'
        } font-semibold text-[var(--fg)] lowercase`}
      >
        <span className="text-treatment-solid">{headlineLead} </span>
        {chromeWord ? (
          <span className="text-treatment-chrome">{chromeWord} </span>
        ) : null}
        <span className="text-treatment-outline">{outlineWord}</span>
        {headlineTail ? (
          <span className="text-treatment-solid"> {headlineTail}</span>
        ) : null}
      </h2>

      {serifSubline ? (
        <p
          className={`mt-2 max-w-[62ch] font-serif-editorial ${
            compact ? 'text-base md:text-lg' : 'text-lg md:text-xl'
          } italic text-[var(--muted)]`}
        >
          {serifSubline}
        </p>
      ) : null}
    </div>
  );
}
