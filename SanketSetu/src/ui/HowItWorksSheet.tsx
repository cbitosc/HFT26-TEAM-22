/**
 * "How it works" (src/ui/HowItWorksSheet.tsx): four short panels in plain language. Opened from
 * More > Help and from the Chat empty state. No jargon: the technical terms live in Radio
 * diagnostics and the Packet Inspector.
 */

import { useState } from 'react';
import { Bluetooth, Lock, Share2, Siren } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';

const PANELS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Bluetooth,
    title: 'Phones find each other',
    body: 'Sanket Setu uses Bluetooth and Wi-Fi Direct to connect to phones within about 30 to 100 metres. No internet, no SIM, no account.',
  },
  {
    icon: Share2,
    title: 'Messages hop along',
    body: 'If someone is out of range, phones in between pass your message along until it arrives. Each phone only handles a few messages at a time.',
  },
  {
    icon: Lock,
    title: 'Private stays private',
    body: 'Private messages are encrypted for one person. Phones that pass them along cannot read them. Everyone-nearby messages are meant for all.',
  },
  {
    icon: Siren,
    title: 'SOS keeps trying',
    body: 'Hold the SOS button for 3 seconds. It repeats until a nearby phone confirms it got it. A tick next to a name means that person acknowledged.',
  },
];

export function HowItWorksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const panel = PANELS[i];
  const Icon = panel.icon;
  const last = i === PANELS.length - 1;
  return (
    <Sheet
      open={open}
      title="How it works"
      onClose={() => {
        setI(0);
        onClose();
      }}
    >
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-sm font-semibold text-[var(--fg-secondary)]" aria-live="polite">
          {i + 1} of {PANELS.length}
        </p>
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)]">
            <Icon aria-hidden="true" className="h-7 w-7 text-[var(--verified-ink)]" />
          </span>
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-[var(--fg)]">{panel.title}</h3>
            <p className="mt-1 text-base text-[var(--fg)]">{panel.body}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
            Back
          </Button>
          <Button
            type="button"
            tone="primary"
            onClick={() => {
              if (last) {
                setI(0);
                onClose();
              } else setI(i + 1);
            }}
          >
            {last ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
