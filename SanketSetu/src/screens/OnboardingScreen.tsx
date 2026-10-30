/**
 * First-run onboarding (src/screens/OnboardingScreen.tsx): three short steps.
 * 1. What the app does. 2. Why each permission is needed + the real OS request (native only).
 * 3. Name, optional PIN (skippable with a clear warning), language. Denied permissions never block
 * setup: the app still runs on the simulated mesh and says so.
 */

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Check, ExternalLink, KeyRound, MessageSquareLock, Radio, ShieldAlert, Siren } from 'lucide-react';
import { AppScreenId } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { BridgeLogo } from '../ui/Splash';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { MeshPermissionState } from '../transport/NearbyTransport';

interface OnboardingScreenProps {
  onCompleteNavigate: (screen: AppScreenId) => void;
}

const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Tamil'] as const;

const PERMISSION_ROWS: { key: keyof MeshPermissionState; title: string; why: string }[] = [
  { key: 'bluetoothScan', title: 'Find nearby phones', why: 'Bluetooth scan: discover other Sanket Setu phones with no internet.' },
  { key: 'bluetoothAdvertise', title: 'Be found by nearby phones', why: 'Bluetooth advertise: lets others see and relay through your phone.' },
  { key: 'bluetoothConnect', title: 'Connect to them', why: 'Bluetooth connect: opens the encrypted link used to exchange messages.' },
  { key: 'nearbyWifi', title: 'Faster transfers', why: 'Nearby Wi-Fi devices: switches to Wi-Fi Direct when it is available.' },
  { key: 'notifications', title: 'Keep relaying', why: 'Notifications: shows the "mesh active" notice that keeps the radio running with the screen off.' },
  { key: 'fineLocation', title: 'SOS location (optional)', why: 'Location is used only if you choose to attach it to an SOS. Exact position is sealed to verified responders.' },
];

export function OnboardingScreen({ onCompleteNavigate }: OnboardingScreenProps) {
  const identity = useMeshStore((s) => s.identity);
  const completeOnboarding = useMeshStore((s) => s.completeOnboarding);
  const permissionState = useMeshStore((s) => s.permissionState);
  const checkMeshPermissions = useMeshStore((s) => s.checkMeshPermissions);
  const requestMeshPermissions = useMeshStore((s) => s.requestMeshPermissions);
  const openAppSettings = useMeshStore((s) => s.openAppSettings);
  const isNative = Capacitor.isNativePlatform();

  const [step, setStep] = useState(1);
  const [requesting, setRequesting] = useState(false);
  const [name, setName] = useState(identity.displayName.startsWith('SANKET-A') ? '' : identity.displayName);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [skipPin, setSkipPin] = useState(false);
  const [language, setLanguage] = useState<string>('English');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNative) void checkMeshPermissions();
  }, [isNative, checkMeshPermissions]);

  const grant = async () => {
    setRequesting(true);
    try {
      await requestMeshPermissions();
    } finally {
      setRequesting(false);
    }
  };

  const finish = async () => {
    setError(null);
    if (!name.trim()) return setError('Enter a name so others can recognise you.');
    if (!skipPin) {
      if (pin.trim().length < 4) return setError('Use a PIN of at least 4 characters, or choose "Skip PIN".');
      if (pin !== pinConfirm) return setError('The two PINs do not match.');
    }
    setSaving(true);
    try {
      await completeOnboarding({
        displayName: name,
        pin: skipPin ? undefined : pin,
        language,
        powerMode: 'active',
      });
      onCompleteNavigate('home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish setup.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-var(--header-h))] w-full max-w-lg flex-col gap-5 px-4 pt-6 pb-8">
      <p className="text-sm font-semibold text-[var(--fg-secondary)]" aria-live="polite">Step {step} of 3</p>

      {step === 1 && (
        <>
          <BridgeLogo className="mx-auto w-48" />
          <h1 className="text-[1.75rem] leading-tight font-bold text-[var(--fg)]">Messages and SOS when networks fail</h1>
          <ul className="flex flex-col gap-3">
            {[
              { icon: Radio, text: 'Phones talk directly to each other over Bluetooth and Wi-Fi Direct. No internet or cell signal needed.' },
              { icon: MessageSquareLock, text: 'If someone is out of range, nearby phones pass your message along. It is encrypted so relays cannot read it.' },
              { icon: Siren, text: 'SOS goes to everyone nearby and repeats until a verified responder acknowledges it.' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-base text-[var(--fg)]">
                <Icon aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[var(--verified-ink)]" />
                {text}
              </li>
            ))}
          </ul>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="text-[1.75rem] leading-tight font-bold text-[var(--fg)]">Permissions</h1>
          <p className="text-base text-[var(--fg-secondary)]">
            Android asks for these so phones can find each other. Nothing is sent to a server.
          </p>
          {!isNative && (
            <Card className="p-3 text-sm text-[var(--fg-secondary)]">
              Browser preview: Android permissions are not requested here. The simulated mesh still works.
            </Card>
          )}
          <ul className="flex flex-col gap-2">
            {PERMISSION_ROWS.map((row) => {
              const applicable = permissionState ? permissionState[row.key] !== undefined : true;
              const granted = Boolean(permissionState?.[row.key]);
              return (
                <li key={row.key}>
                  <Card className="flex items-start justify-between gap-3 p-3">
                    <span className="flex flex-col">
                      <span className="text-base font-semibold text-[var(--fg)]">{row.title}</span>
                      <span className="text-sm text-[var(--fg-secondary)]">{row.why}</span>
                    </span>
                    {isNative && (
                      <Badge tone={!applicable ? 'neutral' : granted ? 'safe' : 'warn'} icon={granted ? <Check aria-hidden="true" className="h-3 w-3" /> : undefined}>
                        {!applicable ? 'Not needed' : granted ? 'Allowed' : 'Not allowed'}
                      </Badge>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
          {isNative && permissionState && !permissionState.allGranted && (
            <div role="alert" className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--warn-tint)] p-3 text-sm text-[var(--warn-ink)]">
              <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              Without these permissions phones cannot find each other. You can continue and see the simulated mesh, and allow them later in Settings.
            </div>
          )}
          {isNative && (
            <div className="flex flex-wrap gap-3">
              <Button tone="primary" onClick={() => void grant()} disabled={requesting || permissionState?.allGranted}>
                {requesting ? 'Requesting…' : permissionState?.allGranted ? 'All allowed' : 'Allow permissions'}
              </Button>
              <Button onClick={() => void openAppSettings()}>
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                Open settings
              </Button>
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="text-[1.75rem] leading-tight font-bold text-[var(--fg)]">Your name and key</h1>
          <p className="text-base text-[var(--fg-secondary)]">
            Your phone creates its own signing and encryption keys. They never leave the device.
          </p>
          <label className="flex flex-col gap-1 text-base font-semibold text-[var(--fg)]">
            Name shown to others
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoComplete="off"
              className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-3 text-base font-normal text-[var(--fg)]" />
          </label>
          <label className="flex flex-col gap-1 text-base font-semibold text-[var(--fg)]">
            Language for SOS pictograms
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-3 text-base font-normal text-[var(--fg)]">
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>

          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <KeyRound aria-hidden="true" className="h-5 w-5 text-[var(--verified-ink)]" />
              <h2 className="text-lg font-bold text-[var(--fg)]">Protect keys with a PIN</h2>
            </div>
            {!skipPin ? (
              <>
                <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)}
                  placeholder="PIN (4+ characters)" aria-label="PIN"
                  className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--bg)] px-3 text-base text-[var(--fg)]" />
                <input type="password" inputMode="numeric" autoComplete="new-password" value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value)}
                  placeholder="Repeat PIN" aria-label="Repeat PIN"
                  className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--bg)] px-3 text-base text-[var(--fg)]" />
                <p className="text-sm text-[var(--fg-secondary)]">
                  You will enter this PIN each time you open the app. If you forget it, the keys cannot be recovered.
                </p>
                <Button onClick={() => setSkipPin(true)}>Skip PIN</Button>
              </>
            ) : (
              <>
                <div role="alert" className="rounded-[var(--radius-sm)] bg-[var(--warn-tint)] p-3 text-sm font-medium text-[var(--warn-ink)]">
                  Without a PIN, anyone who can read this phone&apos;s app storage could use your keys to send messages as you.
                </div>
                <Button onClick={() => setSkipPin(false)}>Set a PIN instead</Button>
              </>
            )}
          </Card>
          {error && <p role="alert" className="text-base font-semibold text-[var(--sos-ink)]">{error}</p>}
        </>
      )}

      <div className="mt-auto flex gap-3 pt-2">
        {step > 1 && <Button onClick={() => setStep(step - 1)} className="flex-1">Back</Button>}
        {step < 3 ? (
          <Button tone="primary" onClick={() => setStep(step + 1)} className="flex-1">Next</Button>
        ) : (
          <Button tone="primary" onClick={() => void finish()} disabled={saving} className="flex-1">
            {saving ? 'Creating keys…' : 'Finish setup'}
          </Button>
        )}
      </div>
    </section>
  );
}
