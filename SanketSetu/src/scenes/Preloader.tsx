import { useEffect, useRef, useState } from 'react';
import { siteContent } from '../content';
import { gsap, EASINGS } from '../lib/gsap';
import { setDiscreteState } from '../lib/scroll';

interface PreloaderProps {
  reducedMotion: boolean;
  onComplete: () => void;
}

/**
 * SCENE 0 – Preloader (src/scenes/Preloader.tsx)
 * -----------------------------------------------------------------------------
 * Black screen. A flat, colorful geometric logo block (rounded rectangle
 * containing a dark circle, an acid green circle, and a coral rotated square
 * on lilac/blue panels) assembles: shapes slide, scale and snap into place
 * with staggered elastic ease while "i'm nova" types in letter by letter.
 * Holds 600ms, then morphs/scales into the glossy 3D orb that becomes the
 * top-left nav logo.
 */
export function Preloader({ reducedMotion, onComplete }: PreloaderProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const lilacPanelRef = useRef<HTMLDivElement>(null);
  const bluePanelRef = useRef<HTMLDivElement>(null);
  const darkCircleRef = useRef<HTMLDivElement>(null);
  const greenCircleRef = useRef<HTMLDivElement>(null);
  const coralSquareRef = useRef<HTMLDivElement>(null);
  const orbMorphGlowRef = useRef<HTMLDivElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDiscreteState({ isPreloaderDone: true });
    setIsFinished(true);
    onComplete();
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (reducedMotion || params.get('autostart') === '1') {
      finish();
      return;
    }

    const ctx = gsap.context(() => {
      const chars = charRefs.current.filter(Boolean) as HTMLSpanElement[];

      gsap.set(lilacPanelRef.current, { xPercent: -110, scale: 0.8 });
      gsap.set(bluePanelRef.current, { xPercent: 110, scale: 0.8 });
      gsap.set(darkCircleRef.current, { scale: 0, y: -36 });
      gsap.set(greenCircleRef.current, { scale: 0, x: -28, y: 28 });
      gsap.set(coralSquareRef.current, { scale: 0, rotation: -65, x: 32 });
      gsap.set(orbMorphGlowRef.current, { opacity: 0, scale: 0.4 });
      gsap.set(chars, { opacity: 0, y: 8 });

      const tl = gsap.timeline({
        onComplete: () => finish(),
      });

      // 1. Geometric panels & shapes snap into place with staggered elastic ease
      tl.to(
        [lilacPanelRef.current, bluePanelRef.current],
        {
          xPercent: 0,
          scale: 1,
          duration: 0.72,
          stagger: 0.08,
          ease: 'elastic.out(1, 0.65)',
        },
        0.05
      );

      tl.to(
        [darkCircleRef.current, greenCircleRef.current, coralSquareRef.current],
        {
          scale: 1,
          x: 0,
          y: 0,
          rotation: (i) => (i === 2 ? 45 : 0),
          duration: 0.82,
          stagger: 0.1,
          ease: 'elastic.out(1.05, 0.52)',
        },
        0.22
      );

      // 2. Tiny caption below types in letter by letter ("i'm nova")
      tl.to(
        chars,
        {
          opacity: 1,
          y: 0,
          duration: 0.25,
          stagger: 0.055,
          ease: EASINGS.expoOut,
        },
        0.38
      );

      // 3. Hold 600ms, then morph block into glossy round orb and fly toward center/top-left
      const morphStart = 1.55;

      tl.to(
        chars,
        {
          opacity: 0,
          y: -6,
          duration: 0.3,
          ease: EASINGS.inOut,
        },
        morphStart
      );

      tl.to(
        blockRef.current,
        {
          borderRadius: '9999px',
          width: 72,
          height: 72,
          scale: 0.65,
          duration: 0.62,
          ease: EASINGS.inOut,
        },
        morphStart
      );

      tl.to(
        orbMorphGlowRef.current,
        {
          opacity: 1,
          scale: 1,
          duration: 0.45,
          ease: EASINGS.expoOut,
        },
        morphStart + 0.1
      );

      // Fly the morphed orb to the top-left nav logo coordinate while revealing Scene 1's 3D orb
      const targetX = -(window.innerWidth * 0.5 - 44);
      const targetY = -(window.innerHeight * 0.5 - 40);

      tl.to(
        blockRef.current,
        {
          x: targetX,
          y: targetY,
          scale: 0.52,
          duration: 0.72,
          ease: EASINGS.inOut,
        },
        morphStart + 0.52
      );

      tl.to(
        overlayRef.current,
        {
          opacity: 0,
          duration: 0.55,
          ease: EASINGS.inOut,
        },
        morphStart + 0.65
      );
    }, overlayRef);

    return () => ctx.revert();
  }, [reducedMotion]);

  if (isFinished) return null;

  const captionLetters = siteContent.preloader.caption.split('');

  return (
    <div
      ref={overlayRef}
      role="status"
      aria-live="polite"
      aria-label={siteContent.preloader.caption}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg)] select-none"
    >
      {/* Geometric Logo Block that assembles and morphs into the glossy orb */}
      <div
        ref={blockRef}
        className="relative flex h-28 w-36 items-center justify-center overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface-elevated)] shadow-2xl will-change-transform"
      >
        {/* Left Lilac Panel */}
        <div
          ref={lilacPanelRef}
          className="absolute inset-y-0 left-0 w-1/2 bg-[var(--accent-lilac)]"
        />
        {/* Right Electric Blue Panel */}
        <div
          ref={bluePanelRef}
          className="absolute inset-y-0 right-0 w-1/2 bg-[var(--accent-blue)]"
        />

        {/* Dark Circle */}
        <div
          ref={darkCircleRef}
          className="relative z-10 -ml-5 h-12 w-12 rounded-full bg-[var(--bg)] shadow-md"
        />

        {/* Acid Green Circle */}
        <div
          ref={greenCircleRef}
          className="relative z-20 -ml-3 mt-4 h-9 w-9 rounded-full bg-[var(--accent-green)] shadow-md"
        />

        {/* Coral Rotated Square */}
        <div
          ref={coralSquareRef}
          className="relative z-10 -ml-2 -mt-4 h-8 w-8 rounded-md bg-[var(--accent-coral)] shadow-md"
        />

        {/* Glossy 3D Orb Morph Overlay */}
        <div
          ref={orbMorphGlowRef}
          className="pointer-events-none absolute inset-0 z-30 rounded-full"
          style={{
            background:
              'radial-gradient(circle at 35% 30%, #ffffff 0%, var(--accent-green) 28%, var(--accent-blue) 68%, #0a0a0a 100%)',
          }}
        />
      </div>

      {/* Letter-by-letter typed caption ("i'm nova") */}
      <div className="mt-5 flex items-center justify-center font-grotesk text-sm tracking-tight text-[var(--fg)] lowercase">
        {captionLetters.map((char, idx) => (
          <span
            key={idx}
            ref={(el) => {
              charRefs.current[idx] = el;
            }}
            className="inline-block"
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={finish}
        className="fixed bottom-6 right-6 cursor-pointer text-xs text-[var(--muted)] lowercase transition-colors hover:text-[var(--fg)]"
      >
        {siteContent.preloader.skipLabel}
      </button>
    </div>
  );
}
