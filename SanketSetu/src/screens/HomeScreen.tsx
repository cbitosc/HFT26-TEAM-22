import { useState } from 'react';
import { Check, Radio } from 'lucide-react';
import { AppScreenId } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { HoldToSendButton } from '../ui/HoldToSendButton';
import { MeshOrb, MeshOrbState } from '../ui/MeshOrb';
import { StatCard } from '../ui/StatCard';
import { Badge } from '../ui/Badge';
import { soundEngine } from '../lib/audio';
import { ThemeMode } from '../ui/theme';

interface HomeScreenProps {
  theme: ThemeMode;
  reducedMotion: boolean;
  onNavigate: (screen: AppScreenId) => void;
}

/** Emergency-first home. The persistent connectivity/power strip sits directly under the header. */
export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const meshPeerCount = useMeshStore((s) => s.peers.length);
  const directPeerCount = useMeshStore((s) => s.peers.reduce((n, peer) => n + Number(peer.isDirectNeighbor), 0));
  const realRadioPeerCount = useMeshStore((s) => s.realRadioPeerCount);
  const queuedCount = useMeshStore((s) => s.outbox.length);
  const deliveredCount = useMeshStore((s) => s.messages.filter((message) => message.deliveryState === 'DELIVERED').length);
  const powerMode = useMeshStore((s) => s.metrics.powerMode);
  const peers = useMeshStore((s) => s.peers);
  const activeSosId = useMeshStore((s) => s.activeSosId);
  const broadcastSOS = useMeshStore((s) => s.broadcastSOS);
  const cancelActiveSOS = useMeshStore((s) => s.cancelActiveSOS);
  const sendImSafeToCircle = useMeshStore((s) => s.sendImSafeToCircle);
  const circleId = useMeshStore((s) => s.circles[0]?.circleId ?? 'circle-nearby');
  const [safeSent, setSafeSent] = useState(false);

  const orbState: MeshOrbState = activeSosId
    ? 'sos'
    : directPeerCount > 0
      ? 'connected'
      : 'scanning';

  const sendSos = () => {
    soundEngine.playSosSent();
    void broadcastSOS({
      category: 'medical',
      text: 'Emergency SOS. Immediate assistance requested.',
      headcount: 1,
    });
  };

  const sendSafeCheckIn = async () => {
    soundEngine.playSelectChord();
    await sendImSafeToCircle(circleId, 'SAFE', "I'm safe. Check-in sent from Sanket Setu.");
    setSafeSent(true);
    window.setTimeout(() => setSafeSent(false), 3000);
  };

  const peersAreSimulated = realRadioPeerCount === 0;

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 pt-2 sm:px-6">
      <p className="text-center text-sm font-medium text-[var(--fg-secondary)]">
        Works with no internet or cell signal.
      </p>

      {activeSosId ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-[var(--sos)] bg-[var(--sos-tint)] p-4 text-center">
          <div className="flex items-center gap-2 text-lg font-bold text-[var(--sos-ink)]">
            <Radio aria-hidden="true" className="h-5 w-5" />
            SOS is active
          </div>
          <p className="text-sm text-[var(--fg-secondary)]">Open the tracker to check for responder updates.</p>
          <div className="flex w-full flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate('sos')}
              className="min-h-12 flex-1 rounded-xl bg-[var(--sos)] px-4 font-semibold text-[var(--on-sos)]"
            >
              View SOS tracker
            </button>
            <button
              type="button"
              onClick={cancelActiveSOS}
              className="min-h-12 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 font-semibold text-[var(--fg)]"
            >
              Cancel SOS
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <HoldToSendButton onConfirm={sendSos} diameter={196} />
        </div>
      )}

      <button
        type="button"
        onClick={() => void sendSafeCheckIn()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--safe)] bg-[var(--safe-tint)] px-4 text-base font-semibold text-[var(--safe-ink)]"
      >
        <Check aria-hidden="true" className="h-5 w-5" />
        {safeSent ? 'Safe check-in sent' : "I'm Safe"}
      </button>

      <div className="grid grid-cols-2 gap-2" aria-label="Mesh summary">
        <StatCard
          label="Peers"
          value={peersAreSimulated ? meshPeerCount : realRadioPeerCount}
          simulated={peersAreSimulated}
        />
        <StatCard label="Queue" value={queuedCount} />
        <StatCard label="Delivered" value={deliveredCount} simulated />
        <StatCard label="Power" value={powerMode[0].toUpperCase() + powerMode.slice(1)} simulated />
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-[var(--line)] pt-4">
        <Badge tone="neutral">Mesh visual · decorative</Badge>
        <MeshOrb state={orbState} peers={peers} />
      </div>
    </section>
  );
}
