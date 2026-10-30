export function EmptyState({ title, children }: { title: string; children: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-center">
    <h2 className="text-lg font-bold text-[var(--fg)]">{title}</h2>
    <p className="mt-1 max-w-md text-base text-[var(--fg-secondary)]">{children}</p>
  </div>;
}
