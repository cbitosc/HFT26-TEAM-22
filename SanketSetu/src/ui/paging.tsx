/**
 * Simple list paging (src/ui/paging.tsx). Long lists (messages, alerts, peers) render one page at a
 * time with a "Show more" button instead of mounting every row — cheaper than virtualisation and
 * keeps natural scrolling and screen-reader order.
 */

import { useState } from 'react';

export function usePagedList<T>(items: T[], pageSize = 20, newestLast = false) {
  const [count, setCount] = useState(pageSize);
  const visible = newestLast
    ? items.slice(Math.max(0, items.length - count))
    : items.slice(0, count);
  return {
    visible,
    hiddenCount: Math.max(0, items.length - count),
    showMore: () => setCount((c) => c + pageSize),
  };
}

export function ShowMoreButton({
  hiddenCount,
  onClick,
  label = 'Show more',
}: {
  hiddenCount: number;
  onClick: () => void;
  label?: string;
}) {
  if (hiddenCount <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[48px] w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] text-sm font-semibold text-[var(--fg)]"
    >
      {label} ({hiddenCount})
    </button>
  );
}
