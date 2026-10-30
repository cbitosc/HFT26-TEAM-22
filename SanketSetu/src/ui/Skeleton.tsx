/** Static loading placeholder (src/ui/Skeleton.tsx). Deliberately not animated — no shimmer loop. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-[var(--radius-sm)] bg-[var(--surface-2)] ${className}`}
    />
  );
}
