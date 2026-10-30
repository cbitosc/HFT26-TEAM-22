import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ as = 'section', children, className = '', ...props }: HTMLAttributes<HTMLElement> & { as?: 'section' | 'article' | 'div'; children: ReactNode }) {
  const Element = as;
  return <Element {...props} className={`rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)] ${className}`}>{children}</Element>;
}
