/**
 * Press-and-hold SOS trigger (src/ui/HoldToSendButton.tsx).
 * The progress ring is a single CSS transition on stroke-dashoffset, so holding costs zero React
 * re-renders per frame (the previous implementation called setState on every animation frame).
 * Works with touch, mouse, and keyboard (hold Space/Enter). Vibrates on start and on send where
 * the platform supports it.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertOctagon } from 'lucide-react';

const HOLD_MS = 3000;
const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface HoldToSendButtonProps {
  onConfirm: () => void;
  disabled?: boolean;
  /** Visible label when idle. */
  label?: string;
  /** Diameter in CSS pixels; clamps to the viewport width on small screens. */
  diameter?: number;
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration unsupported — the visual + text state still conveys progress.
  }
}

export function HoldToSendButton({
  onConfirm,
  disabled = false,
  label = 'Send SOS',
  diameter = 220,
}: HoldToSendButtonProps) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | null>(null);

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  };

  const start = () => {
    if (disabled || timerRef.current !== null) return;
    setHolding(true);
    vibrate(30);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      vibrate([80, 60, 160]);
      onConfirm();
    }, HOLD_MS);
  };

  useEffect(() => cancel, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label}. Press and hold for 3 seconds.`}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') cancel();
        }}
        className="relative flex touch-none items-center justify-center rounded-full bg-[var(--sos)] text-[var(--on-sos)] shadow-[var(--shadow-2)] select-none disabled:opacity-50"
        style={{ width: `min(${diameter}px, 68vw)`, height: `min(${diameter}px, 68vw)` }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full -rotate-90"
        >
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="4" />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            style={{
              strokeDashoffset: holding ? 0 : CIRCUMFERENCE,
              transition: holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : 'none',
            }}
          />
        </svg>
        <span className="relative flex flex-col items-center gap-1 px-6 text-center">
          <AlertOctagon aria-hidden="true" className="h-10 w-10" />
          <span className="text-[1.75rem] leading-tight font-bold">SOS</span>
          <span className="text-sm font-semibold">{holding ? 'Keep holding…' : label}</span>
        </span>
      </button>
      <p className="text-sm font-medium text-[var(--fg-secondary)]" aria-live="polite">
        {holding ? 'Release to cancel' : 'Hold 3 seconds'}
      </p>
    </div>
  );
}
