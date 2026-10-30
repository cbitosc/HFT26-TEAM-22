/** Accessible on/off switch row (src/ui/Toggle.tsx). State is shown as text ("On"/"Off"), not colour alone. */

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[56px] w-full items-center justify-between gap-4 px-1 py-2 text-left"
    >
      <span className="flex flex-col">
        <span className="text-base font-semibold text-[var(--fg)]">{label}</span>
        {description && (
          <span className="text-sm text-[var(--fg-secondary)]">{description}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-semibold text-[var(--fg-secondary)]">
          {checked ? 'On' : 'Off'}
        </span>
        <span
          aria-hidden="true"
          className={`relative h-7 w-12 rounded-full border ${
            checked
              ? 'border-[var(--verified)] bg-[var(--verified)]'
              : 'border-[var(--line)] bg-[var(--surface-2)]'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5.5 w-5.5 rounded-full bg-white shadow-[var(--shadow-1)] ${
              checked ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </span>
      </span>
    </button>
  );
}
