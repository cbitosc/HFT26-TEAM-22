import React, { forwardRef } from 'react';

export interface SectionProps {
  id: string;
  sectionName?: string;
  pinned?: boolean;
  themeOverride?: 'light' | 'dark';
  ariaLabel?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}

/**
 * Shared Section Layout Shell (src/components/Section.tsx)
 * -----------------------------------------------------------------------------
 * Enforces the global section contract across every section:
 * - CSS Grid: grid-template-rows: [header] auto [body] minmax(0, 1fr)
 * - Safe-zone paddings:
 *   padding-top: calc(var(--nav-h) + clamp(12px, 2.5svh, 28px))
 *   padding-inline: clamp(16px, 5vw, 80px)
 *   padding-bottom: calc(var(--hud-safe) + clamp(12px, 3svh, 32px))
 * - Pinned sections: height: 100svh; overflow: hidden; children min-height: 0
 * - Non-pinned sections: min-height: 100svh; content grows safely above HUD zone
 */
export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  {
    id,
    sectionName,
    pinned = false,
    themeOverride,
    ariaLabel,
    header,
    children,
    className = '',
    headerClassName = '',
    bodyClassName = '',
  },
  ref
) {
  return (
    <section
      id={id}
      ref={ref}
      data-section={sectionName ?? id}
      data-section-id={id}
      data-pinned={pinned ? 'true' : 'false'}
      data-theme={themeOverride}
      aria-label={ariaLabel ?? sectionName ?? id}
      className={`nova-section-shell ${className}`}
    >
      {header ? (
        <header className={`nova-section-header ${headerClassName}`}>
          {header}
        </header>
      ) : (
        <div className="nova-section-header" aria-hidden="true" />
      )}

      <div className={`nova-section-body ${bodyClassName}`}>{children}</div>
    </section>
  );
});
