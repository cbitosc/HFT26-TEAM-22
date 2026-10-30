import { useEffect, useRef } from 'react';
import { siteContent } from '../content';
import { soundEngine } from '../lib/audio';
import { gsap, EASINGS } from '../lib/gsap';

interface MenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateProgress: (targetProgress: number) => void;
  onNavigateSection?: (sectionId: string) => void;
}

/**
 * Full-Screen Menu Overlay (src/components/Menu.tsx)
 * -----------------------------------------------------------------------------
 * Opens via clip-path circle expansion from the top-right menu button.
 * Large lowercase links stagger in; closing reverses the timeline.
 */
export function Menu({
  isOpen,
  onClose,
  onNavigateProgress,
  onNavigateSection,
}: MenuProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const footerRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const ctx = gsap.context(() => {
      const links = linkRefs.current.filter(Boolean) as HTMLButtonElement[];

      gsap.set(overlay, {
        clipPath: 'circle(0% at calc(100% - 48px) 36px)',
        pointerEvents: 'none',
      });
      gsap.set(links, { yPercent: 100, opacity: 0 });
      gsap.set(footerRef.current, { opacity: 0, y: 12 });

      const tl = gsap.timeline({ paused: true });

      tl.to(
        overlay,
        {
          clipPath: 'circle(150% at calc(100% - 48px) 36px)',
          duration: 0.78,
          ease: EASINGS.inOut,
          onStart: () => {
            overlay.style.pointerEvents = 'auto';
          },
          onReverseComplete: () => {
            overlay.style.pointerEvents = 'none';
          },
        },
        0
      );

      tl.to(
        links,
        {
          yPercent: 0,
          opacity: 1,
          duration: 0.68,
          stagger: 0.06,
          ease: EASINGS.expoOut,
        },
        0.22
      );

      tl.to(
        footerRef.current,
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: EASINGS.expoOut,
        },
        0.4
      );

      tlRef.current = tl;
    }, overlayRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (isOpen) {
      tl.play();
    } else {
      tl.reverse();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-hidden={!isOpen}
      aria-label="Scene navigation menu"
      className="bg-subtle-grid fixed inset-0 z-40 flex flex-col justify-between bg-[var(--bg)] px-6 py-24 md:px-16"
    >
      <div className="my-auto mx-auto flex w-full max-w-4xl flex-col items-center gap-3 text-center">
        {siteContent.menu.links.map((item, idx) => (
          <div key={item.label} className="split-line-mask py-1">
            <button
              ref={(el) => {
                linkRefs.current[idx] = el;
              }}
              type="button"
              onClick={() => {
                soundEngine.playTick(820, 0.04);
                onClose();
                if (item.sectionId && onNavigateSection) {
                  onNavigateSection(item.sectionId);
                } else {
                  onNavigateProgress(item.progressTarget);
                }
              }}
              onMouseEnter={() => soundEngine.playTick(600, 0.02)}
              data-cursor={siteContent.chrome.cursorInspectLabel}
              className="group flex cursor-pointer flex-col items-center gap-1 rounded-2xl px-6 py-1 font-grotesk text-4xl font-semibold tracking-tight text-[var(--fg)] lowercase transition-colors hover:bg-[var(--accent)] hover:text-[#0B0B0B] md:text-6xl"
            >
              <span>{item.label}</span>
              <span className="font-serif-editorial text-base font-normal italic text-[var(--muted)] group-hover:text-[#0B0B0B]">
                {item.caption}
              </span>
            </button>
          </div>
        ))}
      </div>

      <div
        ref={footerRef}
        className="mx-auto flex w-full max-w-5xl items-center justify-between border-t border-[var(--line)] pt-6 font-grotesk text-xs text-[var(--muted)] lowercase"
      >
        <span>{siteContent.menu.footerNote}</span>
        <span>{siteContent.brand.year}</span>
      </div>
    </div>
  );
}
