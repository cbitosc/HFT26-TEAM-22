/** REAL-mode "map": the phones this one can currently reach, from real HELLOs only. */
import { useMeshStore } from '../store/useMeshStore';
import { EmptyState } from '../ui/EmptyState';
import { NearbyPeopleList } from '../ui/NearbyPeopleList';

export function NearbyMapScreen() {
  const count = useMeshStore((s) => s.peers.length);
  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-4">
      <h1 className="text-[1.75rem] leading-tight font-bold text-[var(--fg)]">Phones nearby</h1>
      {count === 0 ? (
        <EmptyState title="No phones nearby yet">
          Ask a friend to open Sanket Setu and stay within about 30–100 m. They will appear here when connected.
        </EmptyState>
      ) : (
        <NearbyPeopleList />
      )}
    </section>
  );
}
