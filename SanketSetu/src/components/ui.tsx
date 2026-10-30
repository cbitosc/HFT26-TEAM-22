import React, { useRef } from 'react';
import { gsap, EASINGS } from '../lib/gsap';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  magnetic?: boolean;
  children: React.ReactNode;
}

/**
 * Shared Button Component (src/components/ui.tsx)
 * -----------------------------------------------------------------------------
 * Variants:
 * - primary: dark pill (#0B0B0B fill, #F6F4EF text; inverts cleanly in dark mode)
 * - accent: lime pill (--accent fill, #0B0B0B text, crisp border)
 * - secondary: white/surface pill with 1px border (--surface, --fg text)
 * - ghost: subtle transparent pill with hover fill
 * Includes optional magnetic hover, press scale 0.97, and 3px lilac focus ring.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  magnetic = false,
  className = '',
  children,
  onMouseMove,
  onMouseLeave,
  ...rest
}: ButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (magnetic && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dx = (e.clientX - (rect.left + rect.width * 0.5)) * 0.24;
      const dy = (e.clientY - (rect.top + rect.height * 0.5)) * 0.24;
      gsap.to(btnRef.current, {
        x: dx,
        y: dy,
        duration: 0.25,
        ease: EASINGS.expoOut,
        overwrite: 'auto',
      });
    }
    onMouseMove?.(e);
  };

  const handleLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (magnetic && btnRef.current) {
      gsap.to(btnRef.current, {
        x: 0,
        y: 0,
        duration: 0.65,
        ease: EASINGS.elasticReturn,
        overwrite: 'auto',
      });
    }
    onMouseLeave?.(e);
  };

  const sizeClass =
    size === 'sm'
      ? 'px-3.5 py-1.5 text-[10px]'
      : size === 'lg'
      ? 'px-6 py-3.5 text-xs'
      : 'px-4 py-2 text-[11px]';

  const variantClass =
    variant === 'primary'
      ? 'bg-[var(--bg-inverse)] text-[var(--bg)] border border-[var(--bg-inverse)] hover:bg-[var(--accent)] hover:text-[#0B0B0B] hover:border-[#0B0B0B] shadow-[var(--shadow-1)]'
      : variant === 'accent'
      ? 'bg-[var(--accent)] text-[#0B0B0B] border border-[#0B0B0B] hover:brightness-105 shadow-[var(--shadow-1)]'
      : variant === 'secondary'
      ? 'bg-[var(--surface)] text-[var(--fg)] border border-[var(--line)] hover:border-[var(--fg)] shadow-[var(--shadow-1)]'
      : 'bg-transparent text-[var(--muted)] border border-transparent hover:text-[var(--fg)] hover:bg-[var(--surface-2)]';

  return (
    <button
      ref={btnRef}
      type="button"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--r-pill)] font-mono font-semibold tracking-[0.14em] uppercase transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--accent-2)] disabled:pointer-events-none disabled:opacity-50 ${sizeClass} ${variantClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export type PillAccent = 'default' | 'lime' | 'lilac' | 'blue' | 'coral' | 'peach' | 'dark';

interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  accent?: PillAccent;
  dot?: boolean;
  children: React.ReactNode;
}

/**
 * Shared Pill Component (src/components/ui.tsx)
 * -----------------------------------------------------------------------------
 * Used across all 8 sections for section index tags, scenario domain tags,
 * metric badges, and tech stack chips.
 */
export function Pill({
  accent = 'default',
  dot = false,
  className = '',
  children,
  ...rest
}: PillProps) {
  const accentStyle =
    accent === 'lime'
      ? 'bg-[var(--accent)] text-[#0B0B0B] border-[#0B0B0B]/25'
      : accent === 'lilac'
      ? 'bg-[#E6DDFF] text-[#0B0B0B] border-[#0B0B0B]/20'
      : accent === 'blue'
      ? 'bg-[#DCE6FF] text-[#0B0B0B] border-[#0B0B0B]/20'
      : accent === 'coral'
      ? 'bg-[#FFE0D9] text-[#0B0B0B] border-[#0B0B0B]/20'
      : accent === 'peach'
      ? 'bg-[#FFEAD9] text-[#0B0B0B] border-[#0B0B0B]/20'
      : accent === 'dark'
      ? 'bg-[#0B0B0B] text-[#F6F4EF] border-[#0B0B0B]'
      : 'bg-[var(--surface)] text-[var(--fg)] border-[var(--line)]';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-[var(--r-pill)] border px-3 py-1 type-mono-label shadow-[var(--shadow-1)] ${accentStyle} ${className}`}
      {...rest}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full border border-[#0B0B0B]/25 bg-[var(--accent)]"
        />
      ) : null}
      {children}
    </span>
  );
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  children: React.ReactNode;
}

/**
 * Shared Surface Card Component (src/components/ui.tsx)
 * -----------------------------------------------------------------------------
 * Solid --surface background, 1px --line border, --shadow-1, and optional
 * -3px hover lift with --shadow-2.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, className = '', children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={`nova-card ${interactive ? 'nova-card-interactive' : ''} ${className}`}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
