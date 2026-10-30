import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { AllSectionId, siteContent, StorySectionId } from '../content';
import { soundEngine } from '../lib/audio';
import { gsap, EASINGS } from '../lib/gsap';
import {
  OrbExpression,
  ThemeMode,
  ViewMode,
} from '../lib/scroll';

interface NavProps {
  activeSectionId: AllSectionId;
  orbExpression: OrbExpression;
  viewMode: ViewMode;
  theme: ThemeMode;
  isMenuOpen: boolean;
  isMuted: boolean;
  showSpiralToggle?: boolean;
  onNavigateSection: (sectionId: StorySectionId) => void;
  onToggleViewMode?: (mode: ViewMode) => void;
  onToggleTheme: (nextTheme: ThemeMode) => void;
  onToggleMenu: () => void;
  onToggleMute: () => void;
  onLogoClick: () => void;
}

/**
 * Product-Story Navbar & Bottom-Left Section Counter (src/components/Nav.tsx)
 * -----------------------------------------------------------------------------
 * - Top-left: Round glossy logo orb ONLY (the SPIRAL | LIST toggle lives exclusively
 *   under the header block inside 06 USE CASES).
 * - Top-center: Floating centered pill nav with uppercase tracked labels generated
 *   from siteContent.sectionRegistry (HOME, PROBLEM, HOW IT WORKS, INTELLIGENCE,
 *   TECHNOLOGY, USE CASES, LIVE DEMO) and a GSAP-animated sliding capsule.
 * - Top-right: Dark pill CTA ("launch nova" + sliding arrow, magnetic hover),
 *   sun/moon theme toggle (circular clip-path reveal), and menu button.
 * - Bottom-left: Monospace section counter ("06 / 08  use cases") generated from
 *   siteContent.sectionRegistry.
 */
export function Nav({
  activeSectionId,
  theme,
  isMenuOpen,
  isMuted,
  onNavigateSection,
  onToggleTheme,
  onToggleMenu,
  onToggleMute,
  onLogoClick,
}: NavProps) {
  const headerRef = useRef<HTMLElement>(null);
  const navPillRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const launchBtnRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const themeRevealRef = useRef<HTMLDivElement>(null);
  const [isHidden, setIsHidden] = useState(false);

  // Hide nav on scroll down, show on scroll up
  useEffect(() => {
    let lastScrollY = window.scrollY;
    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY;
      if (currentY < 120) {
        setIsHidden(false);
      } else if (delta > 10 && !isMenuOpen) {
        setIsHidden(true);
      } else if (delta < -8) {
        setIsHidden(false);
      }
      lastScrollY = currentY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isMenuOpen]);

  // Animate sliding capsule behind active nav item with GSAP expo.out
  useEffect(() => {
    const targetId: StorySectionId =
      activeSectionId === 'outro' ? 'live-demo' : activeSectionId;
    const activeBtn = itemRefs.current[targetId];
    const capsule = capsuleRef.current;
    if (!activeBtn || !capsule) return;

    const updateCapsule = () => {
      const left = activeBtn.offsetLeft;
      const width = activeBtn.offsetWidth;
      gsap.to(capsule, {
        x: left,
        width,
        duration: 0.55,
        ease: EASINGS.expoOut,
        overwrite: 'auto',
      });
    };

    updateCapsule();
    window.addEventListener('resize', updateCapsule);
    return () => window.removeEventListener('resize', updateCapsule);
  }, [activeSectionId]);

  const handleMagneticMove = (
    e: React.MouseEvent<HTMLButtonElement>,
    ref: React.RefObject<HTMLButtonElement | null>
  ) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width / 2)) * 0.28;
    const dy = (e.clientY - (rect.top + rect.height / 2)) * 0.28;
    gsap.to(ref.current, {
      x: dx,
      y: dy,
      duration: 0.25,
      ease: EASINGS.expoOut,
      overwrite: 'auto',
    });
  };

  const handleMagneticLeave = (ref: React.RefObject<HTMLButtonElement | null>) => {
    if (!ref.current) return;
    gsap.to(ref.current, {
      x: 0,
      y: 0,
      duration: 0.75,
      ease: EASINGS.elasticReturn,
      overwrite: 'auto',
    });
  };

  const handleThemeSwitch = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    soundEngine.playTick(nextTheme === 'light' ? 760 : 520, 0.035);

    const btn = themeBtnRef.current;
    const reveal = themeRevealRef.current;
    if (!btn || !reveal) {
      onToggleTheme(nextTheme);
      return;
    }

    const rect = btn.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width * 0.5);
    const cy = Math.round(rect.top + rect.height * 0.5);
    const targetBg = nextTheme === 'dark' ? '#0a0a0a' : '#F6F4EF';

    let switched = false;
    gsap.killTweensOf(reveal);
    gsap.set(reveal, {
      opacity: 1,
      backgroundColor: targetBg,
      clipPath: `circle(0% at ${cx}px ${cy}px)`,
    });

    gsap.to(reveal, {
      clipPath: `circle(150% at ${cx}px ${cy}px)`,
      duration: 0.62,
      ease: EASINGS.inOut,
      onUpdate: function () {
        if (!switched && this.progress() >= 0.42) {
          switched = true;
          onToggleTheme(nextTheme);
        }
      },
      onComplete: () => {
        if (!switched) {
          onToggleTheme(nextTheme);
        }
        gsap.to(reveal, {
          opacity: 0,
          duration: 0.28,
          ease: EASINGS.expoOut,
        });
      },
    });
  };

  // Resolve current section counter info from single sectionRegistry
  const currentRegistryEntry =
    siteContent.sectionRegistry.find((item) => item.id === activeSectionId) ??
    siteContent.sectionRegistry[0];

  return (
    <>
      {/* Circular Clip-Path Reveal Veil for Theme Switch */}
      <div
        ref={themeRevealRef}
        aria-hidden="true"
        className="bg-subtle-grid pointer-events-none fixed inset-0 z-[45] opacity-0"
      />

      {/* Top Chrome Bar (Hides on scroll down, shows on scroll up) */}
      <header
        ref={headerRef}
        className={`pointer-events-none fixed inset-x-0 top-0 z-[var(--z-nav)] flex items-center justify-between px-4 py-3.5 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:px-8 ${
          isHidden && !isMenuOpen ? '-translate-y-28' : 'translate-y-0'
        }`}
      >
        {/* Top-Left: Glossy Logo Orb ONLY */}
        <div className="pointer-events-auto flex items-center">
          <button
            type="button"
            onClick={() => {
              soundEngine.playTick(540, 0.03);
              onLogoClick();
            }}
            aria-label={siteContent.brand.name}
            data-cursor={siteContent.brand.name}
            className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--line)] shadow-[var(--shadow-1)] transition-transform duration-300 hover:scale-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--accent-2)]"
            style={{
              background:
                'radial-gradient(circle at 32% 28%, #ffffff 0%, var(--accent) 28%, var(--accent-3) 68%, #0B0B0B 100%)',
            }}
          >
            <span className="sr-only">{siteContent.brand.name}</span>
          </button>
        </div>

        {/* Center: Floating White Pill Nav with Sliding Capsule (Desktop >=1024px) */}
        <nav
          ref={navPillRef}
          aria-label="Product story sections"
          className="pointer-events-auto relative hidden items-center rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)]/95 p-1 shadow-[var(--shadow-2)] backdrop-blur-xl lg:flex"
        >
          {/* Sliding Active Capsule */}
          <span
            ref={capsuleRef}
            aria-hidden="true"
            className="pointer-events-none absolute top-1 bottom-1 left-0 z-0 rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]"
            style={{ width: 68 }}
          />

          {siteContent.nav.items.map((item) => {
            const isActive = activeSectionId === item.id;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[item.id] = el;
                }}
                type="button"
                aria-current={isActive ? 'location' : undefined}
                onClick={() => {
                  soundEngine.playTick(680, 0.03);
                  onNavigateSection(item.id);
                }}
                data-cursor={item.sectionName}
                className={`relative z-10 cursor-pointer rounded-[var(--r-pill)] px-3 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--accent-2)] xl:px-3.5 xl:text-[11px] ${
                  item.isAccentCoral
                    ? 'text-[var(--accent-4)]'
                    : isActive
                    ? 'text-[var(--fg)]'
                    : 'text-[var(--muted)] hover:text-[var(--fg)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Top-Right Controls: Dark "launch nova" CTA + Sun/Moon Theme Pill + Menu Pill */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Dark Pill CTA: "launch nova" + sliding arrow */}
          <button
            ref={launchBtnRef}
            type="button"
            onClick={() => {
              soundEngine.playTick(840, 0.04);
              onNavigateSection('live-demo');
            }}
            onMouseMove={(e) => handleMagneticMove(e, launchBtnRef)}
            onMouseLeave={() => handleMagneticLeave(launchBtnRef)}
            data-cursor={siteContent.chrome.cursorInspectLabel}
            className="group hidden cursor-pointer items-center gap-2 rounded-[var(--r-pill)] bg-[var(--bg-inverse)] px-4 py-2 font-grotesk text-xs font-semibold text-[var(--bg)] lowercase shadow-[var(--shadow-1)] transition-all hover:bg-[var(--accent)] hover:text-[#0B0B0B] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--accent-2)] sm:flex"
          >
            <span>{siteContent.chrome.launchCtaLabel}</span>
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
              strokeWidth={1.75}
            />
          </button>

          {/* Theme Toggle (Sun / Moon Pill) */}
          <button
            ref={themeBtnRef}
            type="button"
            onClick={handleThemeSwitch}
            aria-label={siteContent.chrome.themeToggleAriaLabel}
            data-cursor={
              theme === 'light'
                ? siteContent.chrome.themeDarkLabel
                : siteContent.chrome.themeLightLabel
            }
            className="flex cursor-pointer items-center gap-1.5 rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-grotesk text-xs font-medium text-[var(--fg)] lowercase shadow-[var(--shadow-1)] backdrop-blur-md transition-colors hover:bg-[var(--accent)] hover:text-[#0B0B0B] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--accent-2)]"
          >
            {theme === 'light' ? (
              <Sun className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <Moon className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            <span className="hidden md:inline">
              {theme === 'light'
                ? siteContent.chrome.themeLightLabel
                : siteContent.chrome.themeDarkLabel}
            </span>
          </button>

          {/* Pill "menu" Button with a Dot */}
          <button
            ref={menuBtnRef}
            type="button"
            onClick={() => {
              soundEngine.playTick(isMenuOpen ? 460 : 880, 0.04);
              onToggleMenu();
            }}
            onMouseMove={(e) => handleMagneticMove(e, menuBtnRef)}
            onMouseLeave={() => handleMagneticLeave(menuBtnRef)}
            data-cursor={
              isMenuOpen
                ? siteContent.chrome.menuCloseLabel
                : siteContent.chrome.menuOpenLabel
            }
            className="flex cursor-pointer items-center gap-2 rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 font-grotesk text-xs font-semibold text-[var(--fg)] lowercase shadow-[var(--shadow-1)] backdrop-blur-md transition-colors hover:bg-[var(--accent)] hover:text-[#0B0B0B] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--accent-2)]"
          >
            <span>
              {isMenuOpen
                ? siteContent.chrome.menuCloseLabel
                : siteContent.chrome.menuOpenLabel}
            </span>
            <span
              className={`h-2 w-2 rounded-full transition-colors ${
                isMenuOpen ? 'bg-[var(--accent-4)]' : 'bg-[var(--accent)]'
              }`}
            />
          </button>
        </div>
      </header>

      {/* Bottom-Left: Monospace Section Counter ("06 / 08  use cases") */}
      <div
        aria-live="polite"
        data-testid="section-hud-counter"
        className="pointer-events-none fixed bottom-4 left-20 z-[var(--z-hud)] hidden items-center gap-2.5 rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-1.5 font-mono text-[11px] text-[var(--fg)] shadow-[var(--shadow-1)] md:flex"
      >
        <span className="rounded-[var(--r-pill)] bg-[var(--accent)] px-2 py-0.5 font-semibold text-[#0B0B0B]">
          {currentRegistryEntry.counterIndex} / {siteContent.chrome.totalSectionsCount}
        </span>
        <span className="tracking-tight text-[var(--fg)] lowercase">
          {currentRegistryEntry.sectionName}
        </span>
      </div>

      {/* Bottom-Right: Circular Mute / Unmute Button */}
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={siteContent.chrome.muteAriaLabel}
        aria-pressed={!isMuted}
        data-cursor={isMuted ? siteContent.chrome.soundOnLabel : siteContent.chrome.soundOffLabel}
        className="fixed bottom-3.5 right-6 z-[var(--z-hud)] flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--accent)] hover:text-[#0B0B0B] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--accent-2)] md:right-10"
      >
        {isMuted ? (
          <VolumeX className="h-[18px] w-[18px]" strokeWidth={1.75} />
        ) : (
          <Volume2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
        )}
      </button>
    </>
  );
}
