import { useMemo, useState } from 'react';
import { Check, ChevronRight, Languages, MapPin, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  AppScreenId,
  PictogramLanguage,
  QUICK_SOS_PICTOGRAMS,
} from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { LocationPrecision } from '../mesh/types';
import { soundEngine } from '../lib/audio';
import { HoldToSendButton } from '../ui/HoldToSendButton';

interface SOSComposerScreenProps {
  onNavigate: (screen: AppScreenId) => void;
}

const languages: PictogramLanguage[] = ['English', 'Hindi', 'Telugu', 'Tamil'];
const languageNames: Record<PictogramLanguage, string> = {
  English: 'English', Hindi: 'हिन्दी', Telugu: 'తెలుగు', Tamil: 'தமிழ்',
};
const locationOptions: { value: LocationPrecision; label: string }[] = [
  { value: 'disabled', label: 'None' },
  { value: 'coarse', label: 'Coarse' },
  { value: 'precise', label: 'Precise, sealed' },
];

export function SOSComposerScreen({ onNavigate }: SOSComposerScreenProps) {
  const broadcastSOS = useMeshStore((s) => s.broadcastSOS);
  const alerts = useMeshStore((s) => s.alerts);
  const activeSosId = useMeshStore((s) => s.activeSosId);
  const cancelActiveSOS = useMeshStore((s) => s.cancelActiveSOS);
  const locationOptIn = useMeshStore((s) => s.locationOptIn);
  const simulatedLat = useMeshStore((s) => s.simulatedLat);
  const simulatedLng = useMeshStore((s) => s.simulatedLng);

  const [selectedPictogramId, setSelectedPictogramId] = useState('medical_trauma');
  const [pictoLang, setPictoLang] = useState<PictogramLanguage>('English');
  const [locPrecision, setLocPrecision] = useState<LocationPrecision>(locationOptIn);

  const selectedPictogram = useMemo(
    () => QUICK_SOS_PICTOGRAMS.find((p) => p.id === selectedPictogramId) ?? QUICK_SOS_PICTOGRAMS[0],
    [selectedPictogramId],
  );
  const trackedSos = alerts.find((a) => a.id === activeSosId) ?? alerts[0] ?? null;
  const responderAcks = trackedSos?.responderAcks ?? [];
  const reachedCount = trackedSos?.reachedNodeIds.length ?? 0;
  const acknowledged = responderAcks.length > 0;
  const enRoute = responderAcks.find((r) => r.status === 'RESPONDING');

  const sendSos = async () => {
    soundEngine.playSosSent();
    await broadcastSOS({
      category: selectedPictogram.category,
      text: selectedPictogram.localized[pictoLang].template,
      headcount: 2,
      locationPrecision: locPrecision,
      pictogramId: selectedPictogram.id,
    });
  };

  const stages = [
    { label: 'Broadcast', detail: trackedSos ? 'SOS sent to nearby peers' : 'Waiting to send', done: !!trackedSos },
    { label: `Reached ${reachedCount}`, detail: reachedCount ? 'Peers reported receipt' : 'No peer receipt yet', done: reachedCount > 0 },
    { label: 'Acknowledged', detail: acknowledged ? 'Responder acknowledgement received' : 'Waiting for a responder', done: acknowledged },
    { label: 'Responder en route', detail: enRoute ? `${enRoute.responderName} · ${enRoute.hops} hops` : 'Waiting for dispatch', done: !!enRoute },
  ];

  return (
    <section className="mx-auto w-full max-w-xl px-4 pt-3 pb-8 sm:px-6">
      <header className="mb-5">
        <h1 className="text-[28px] leading-tight font-bold text-[var(--fg)]">Send an SOS</h1>
        <p className="mt-1 text-base text-[var(--fg-secondary)]">Choose what you need, then hold to send.</p>
      </header>

      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--fg)]">What is happening?</h2>
        <label className="flex min-h-12 items-center gap-2 text-sm font-medium text-[var(--fg-secondary)]">
          <Languages aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Pictogram language</span>
          <select
            value={pictoLang}
            onChange={(event) => setPictoLang(event.target.value as PictogramLanguage)}
            className="min-h-12 max-w-36 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-base text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--verified)]"
          >
            {languages.map((language) => <option key={language} value={language}>{languageNames[language]}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {QUICK_SOS_PICTOGRAMS.map((picto) => {
          const selected = selectedPictogram.id === picto.id;
          return (
            <button
              key={picto.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelectedPictogramId(picto.id)}
              className={`flex min-h-24 items-center gap-3 rounded-2xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--verified)] ${selected ? 'border-[var(--sos)] bg-[var(--sos-tint)] text-[var(--sos-ink)]' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--fg)]'}`}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-3xl" aria-hidden="true">{picto.glyph}</span>
              <span className="min-w-0 text-base leading-snug font-semibold">{picto.localized[pictoLang].title}</span>
              {selected && <Check aria-hidden="true" className="ml-auto h-5 w-5 shrink-0" />}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-[var(--fg)]">
          <MapPin aria-hidden="true" className="h-5 w-5" /> Location
        </h2>
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1.5">
          {locationOptions.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={locPrecision === value}
              onClick={() => setLocPrecision(value)}
              className={`min-h-12 rounded-xl px-1.5 text-sm leading-tight font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--verified)] ${locPrecision === value ? 'bg-[var(--fg)] text-[var(--bg)]' : 'text-[var(--fg-secondary)]'}`}
            >{label}</button>
          ))}
        </div>
        {locPrecision !== 'disabled' && (
          <p className="mt-2 text-sm text-[var(--fg-secondary)]">
            {locPrecision === 'coarse'
              ? `Approximate area: ${simulatedLat.toFixed(2)}, ${simulatedLng.toFixed(2)}`
              : 'Approximate area is shared; precise coordinates are sealed for a trusted responder.'}
          </p>
        )}
      </div>

      <div className="my-6 flex justify-center">
        <HoldToSendButton onConfirm={() => void sendSos()} diameter={208} label="Hold to send" />
      </div>
      {activeSosId && (
        <button
          type="button"
          onClick={cancelActiveSOS}
          className="mx-auto mb-6 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-5 text-base font-semibold text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--verified)]"
        >Cancel active SOS <ChevronRight aria-hidden="true" className="h-4 w-4 rotate-180" /></button>
      )}

      <section aria-labelledby="sos-progress-title" className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <h2 id="sos-progress-title" className="mb-3 text-lg font-bold text-[var(--fg)]">SOS progress</h2>
        <ol className="space-y-4">
          {stages.map((stage, index) => (
            <li key={stage.label} className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${stage.done ? 'border-[var(--safe)] bg-[var(--safe-tint)] text-[var(--safe-ink)]' : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg-secondary)]'}`} aria-label={stage.done ? 'Complete' : 'Pending'}>
                {stage.done ? <Check aria-hidden="true" className="h-4 w-4" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[var(--fg)]">{stage.label}</div>
                <div className="text-sm text-[var(--fg-secondary)]">{stage.detail}</div>
              </div>
              <span className="pt-1 text-sm font-medium text-[var(--fg-secondary)]">{stage.done ? 'Done' : 'Waiting'}</span>
            </li>
          ))}
        </ol>
        {responderAcks.map((ack) => (
          <div key={ack.ackPacketId} className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3 text-sm">
            <span className="font-semibold text-[var(--fg)]">{ack.responderName}</span>
            {ack.verifiedCert ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--verified-tint)] px-2.5 py-1 font-semibold text-[var(--verified)]"><ShieldCheck aria-hidden="true" className="h-4 w-4" /> Verified responder</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-tint)] px-2.5 py-1 font-semibold text-[var(--warning)]"><ShieldAlert aria-hidden="true" className="h-4 w-4" /> Unverified responder</span>
            )}
            <span className="text-[var(--fg-secondary)]">{ack.status} · {ack.hops} hops</span>
          </div>
        ))}
      </section>

      <button type="button" onClick={() => onNavigate('alerts')} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-[var(--verified)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--verified)]">
        View alerts <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </section>
  );
}
