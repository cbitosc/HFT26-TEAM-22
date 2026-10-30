import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonTone = 'primary' | 'danger' | 'neutral' | 'plain';

const toneClass: Record<ButtonTone, string> = {
  primary: 'bg-[var(--verified)] text-[var(--on-verified)]',
  danger: 'bg-[var(--sos)] text-[var(--on-sos)]',
  neutral: 'border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)]',
  plain: 'text-[var(--fg)]',
};

export function Button({
  tone = 'neutral',
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; children: ReactNode }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50 ${toneClass[tone]} ${className}`}
    >
      {children}
    </button>
  );
}
