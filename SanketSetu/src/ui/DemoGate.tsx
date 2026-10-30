/** Shown in REAL mode in place of screens that only make sense with simulated phones. */
import { useMeshStore } from '../store/useMeshStore';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export function DemoGate({ what }: { what: string }) {
  const setAppMode = useMeshStore((s) => s.setAppMode);
  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-6">
      <EmptyState title={`${what} needs Demo mode`}>
        This screen uses simulated phones, so it is hidden while you are using real radio. Demo mode shows made-up phones and messages. Nothing in it is real.
      </EmptyState>
      <Button tone="primary" onClick={() => void setAppMode('demo')}>Switch to Demo mode</Button>
    </section>
  );
}
