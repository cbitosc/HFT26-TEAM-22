/** SOS category pictograms (src/ui/Pictogram.tsx): one consistent 2px-stroke SVG set, 24x24, currentColor. */

import { memo } from 'react';

export type PictogramName = 'trapped' | 'fire' | 'flood' | 'medical' | 'collapse' | 'supplies' | 'safe';

const PATHS: Record<PictogramName, string[]> = {
  medical: ['M9 3h6v6h6v6h-6v6H9v-6H3V9h6z'],
  fire: ['M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2.5-4.5 0 2 .8 3 2 3 0-3-1-5.500.5-8.500z'],
  flood: ['M3 12c3-3 6 3 9 0s6 3 9 0', 'M3 18c3-3 6 3 9 0s6 3 9 0', 'M7 8l5-4 5 4'],
  collapse: ['M5 21V9l7-5 7 5v12', 'M12 9l-2 4 3 2-2 4'],
  trapped: ['M4 4h16v16H4z', 'M9 4v16', 'M15 4v16'],
  supplies: ['M12 3c4 5 6 7.500 6 10.500a6 6 0 0 1-12 0C6 10.500 8 8 12 3z'],
  safe: ['M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z', 'M8.500 12l2.500 2.500 4.500-5'],
};

const BY_TEMPLATE_ID: Record<string, PictogramName> = {
  medical_trauma: 'medical',
  trapped_collapse: 'collapse',
  trapped_flood: 'flood',
  fire_hazard: 'fire',
  need_supplies: 'supplies',
  marked_safe: 'safe',
};

export function pictogramFor(templateId: string, category?: string): PictogramName {
  return BY_TEMPLATE_ID[templateId] ?? (category && category in PATHS ? (category as PictogramName) : 'trapped');
}

export const Pictogram = memo(function Pictogram({ name, className = 'h-8 w-8' }: { name: PictogramName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
});
