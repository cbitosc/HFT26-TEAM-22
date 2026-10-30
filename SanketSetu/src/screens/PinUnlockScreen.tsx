/** PIN gate (src/screens/PinUnlockScreen.tsx): shown at launch when a PIN vault exists. */
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useMeshStore } from '../store/useMeshStore';
import { Button } from '../ui/Button';

export function PinUnlockScreen() {
  const unlockWithPin = useMeshStore((s) => s.unlockWithPin);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await unlockWithPin(pin);
    setBusy(false);
    if (!ok) {
      setError('That PIN is not correct.');
      setPin('');
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-6">
      <Lock aria-hidden="true" className="h-10 w-10 text-[var(--verified-ink)]" />
      <h1 className="text-[1.75rem] leading-tight font-bold text-[var(--fg)]">Enter your PIN</h1>
      <p className="text-base text-[var(--fg-secondary)]">Your keys are locked. Messages keep arriving only after you unlock.</p>
      <input type="password" inputMode="numeric" autoFocus autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)}
        aria-label="PIN" className="min-h-14 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-4 text-xl text-[var(--fg)]" />
      {error && <p role="alert" className="text-base font-semibold text-[var(--sos-ink)]">{error}</p>}
      <Button tone="primary" type="submit" disabled={busy || pin.length < 4}>{busy ? 'Unlocking…' : 'Unlock'}</Button>
    </form>
  );
}
