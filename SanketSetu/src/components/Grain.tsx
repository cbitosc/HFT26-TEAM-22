/**
 * Full-page Subtle Grain & Faint 1px Grid Overlay (src/components/Grain.tsx)
 * -----------------------------------------------------------------------------
 * 1px grid lines at rgba(0,0,0,0.06) on light (:root) and multiply-blended
 * SVG fractal noise at ~5% opacity.
 */
export function Grain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden select-none"
    >
      {/* Faint 1px Grid Overlay (rgba(0,0,0,0.06) on light) */}
      <div className="bg-subtle-grid absolute inset-0" />

      {/* Multiply-Blended Film Grain Noise at ~5% Opacity */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.05] mix-blend-multiply">
        <filter id="nova-webgl-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.82"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#nova-webgl-grain)" />
      </svg>
    </div>
  );
}
