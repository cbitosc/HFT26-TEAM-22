/**
 * Home (src/screens/HomeScreen.tsx): a guided state screen. One sentence says exactly what is
 * happening ("Looking for phones nearby...", "Connected to 2 phones...", "Allow Bluetooth..."), the
 * hold-to-send SOS button sits right under it, and the next step is one tap away. Everything shown
 * comes from the real engine state; in Demo mode the same words describe simulated phones and the
 * amber banner above says so.
 */

import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Bluetooth, Check, MessageSquare, Radar, Radio, Siren } from 'lucide-react';
import { AppScreenId } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { HoldToSendButton } from '../ui/HoldToSendButton';
import { Button } from '../ui/Button';
import { soundEngine } from '../lib/audio';
import { ThemeMode } from '../ui/theme';

interface HomeScreenProps {
  theme: ThemeMode;
  reducedMotion: boolean;
  onNavigate: (screen: AppScreenId) => void;
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const appMode = useMeshStore((s) => s.appMode);
  const directPhones = useMeshStore((s) => s.peers.reduce((n, peer) => n + Number(peer.isDirectNeighbor), 0));
  const queuedCount = useMeshStore((s) => s.outbox.length);
  const permissionState = useMeshStore((s) => s.permissionState);
  const requestMeshPermissions = useMeshStore((s) => s.requestMeshPermissions);
  const openAppSettings = useMeshStore((s) => s.openAppSettings);
  const activeSosId = useMeshStore((s) => s.activeSosId);
  const broadcastSOS = useMeshStore((s) => s.broadcastSOS);
  const cancelActiveSOS = useMeshStore((s) => s.cancelActiveSOS);
  const sendImSafeToCircle = useMeshStore((s) => s.sendImSafeToCircle);
  const circleId = useMeshStore((s) => s.circles[0]?.circleId ?? 'circle-nearby');
  const [safeSent, setSafeSent] = useState(false);
  const [granting, setGranting] = useState(false);

  const isNative = Capacitor.isNativePlatform();
  const needsPermission = appMode === 'real' && isNative && permissionState !== null && !permissionState.allGranted;
  const noRadio = appMode === 'real' && !isNative;

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

  const grant = async () => {
    setGranting(true);
    try {
      await requestMeshPermissions();
    } finally {
      setGranting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-3">
      {/* Status sentence: what is happening right now, and what to do about it. */}
      <div role="status" aria-live="polite" className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--verified-ink)]"
        >
          {needsPermission ? (
            <Bluetooth className="h-6 w-6" />
          ) : noRadio ? (
            <Radio className="h-6 w-6" />
          ) : directPhones > 0 ? (
            <Check className="h-6 w-6 text-[var(--safe-ink)]" />
          ) : (
            <Radar className="h-6 w-6 motion-safe:animate-pulse" />
          )}
        </span>
        <div className="min-w-0">
          {needsPermission ? (
            <>
              <h1 className="text-xl leading-snug font-bold text-[var(--fg)]">Allow Bluetooth and Nearby devices to find people</h1>
              <p className="mt-1 text-base text-[var(--fg-secondary)]">Nothing is sent to the internet.</p>
            </>
          ) : noRadio ? (
            <>
              <h1 className="text-xl leading-snug font-bold text-[var(--fg)]">This device has no phone radio</h1>
              <p className="mt-1 text-base text-[var(--fg-secondary)]">Install the Android app on two phones, or try Demo mode in Settings.</p>
            </>
          ) : directPhones > 0 ? (
            <>
              <h1 className="text-xl leading-snug font-bold text-[var(--fg)]">
                Connected to {directPhones} {directPhones === 1 ? 'phone' : 'phones'}.
              </h1>
              <p className="mt-1 text-base text-[var(--fg-secondary)]">You can chat or send SOS.</p>
            </>
          ) : (
            <>
              <h1 className="text-xl leading-snug font-bold text-[var(--fg)]">Looking for phones nearby...</h1>
              <p className="mt-1 text-base text-[var(--fg-secondary)]">Ask someone nearby to open Sanket Setu.</p>
            </>
          )}
        </div>
      </div>

      {needsPermission && (
        <div className="grid grid-cols-2 gap-2">
          <Button tone="primary" onClick={() => void grant()} disabled={granting}>
            {granting ? 'Asking…' : 'Grant'}
          </Button>
          <Button onClick={() => void openAppSettings()}>Open settings</Button>
        </div>
      )}

      {activeSosId ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-[var(--sos)] bg-[var(--sos-tint)] p-4 text-center">
          <div className="flex items-center gap-2 text-lg font-bold text-[var(--sos-ink)]">
            <Siren aria-hidden="true" className="h-5 w-5" />
            Your SOS is active
          </div>
          <p className="text-sm text-[var(--fg-secondary)]">It keeps sending until someone acknowledges it.</p>
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onNavigate('sos')}
              className="min-h-12 rounded-xl bg-[var(--sos)] px-3 font-semibold text-[var(--on-sos)]"
            >
              See status
            </button>
            <button
              type="button"
              onClick={cancelActiveSOS}
              className="min-h-12 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 font-semibold text-[var(--fg)]"
            >
              Cancel SOS
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <HoldToSendButton onConfirm={sendSos} diameter={188} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => onNavigate('messages')}>
          <MessageSquare aria-hidden="true" className="h-5 w-5" />
          Chat
        </Button>
        <Button onClick={() => onNavigate('sos')}>
          <Siren aria-hidden="true" className="h-5 w-5" />
          SOS options
        </Button>
      </div>

      {queuedCount > 0 && (
        <p className="text-center text-sm text-[var(--fg-secondary)]">
          {queuedCount} {queuedCount === 1 ? 'message is' : 'messages are'} waiting for a nearby phone.
        </p>
      )}

      <button
        type="button"
        onClick={() => void sendSafeCheckIn()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--safe)] bg-[var(--safe-tint)] px-4 text-base font-semibold text-[var(--safe-ink)]"
      >
        <Check aria-hidden="true" className="h-5 w-5" />
        {safeSent ? 'Safe check-in sent' : "I'm safe"}
      </button>
    </section>
  );
}
