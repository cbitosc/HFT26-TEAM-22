import { Pictogram, pictogramFor } from '../ui/Pictogram';
import { useMemo, useState } from 'react';
import { Check, ChevronRight, Clock, Languages, MapPin, Radio, ShieldCheck } from 'lucide-react';
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
  { value: 'coarse', label: 'Approximate' },
  { value: 'precise', label: 'Precise, sealed' },
];
const locationHelp: Record<LocationPrecision, string> = {
  disabled: 'No location is sent.',
  coarse: 'Shares your area to within about 1 km.',
  precise: 'Shares an approximate area. Your exact position is sealed so only verified responders can read it.',
};

export function SOSComposerScreen({ onNavigate }: SOSComposerScreenProps) {
  const broadcastSOS = useMeshStore((s) => s.broadcastSOS);
  const alerts = useMeshStore((s) => s.alerts);
  const activeSosId = useMeshStore((s) => s.activeSosId);
  const cancelActiveSOS = useMeshStore((s) => s.cancelActiveSOS);
  const locationOptIn = useMeshStore((s) => s.locationOptIn);
  const lastSosLocationNote = useMeshStore((s) => s.lastSosLocationNote);
  const phonesNearby = useMeshStore((s) => s.peers.filter((p) => p.isDirectNeighbor).length);

  const [selectedPictogramId, setSelectedPictogramId] = useState('medical_trauma');
  const [pictoLang, setPictoLang] = useState<PictogramLanguage>('English');
  const [locPrecision, setLocPrecision] = useState<LocationPrecision>(locationOptIn);
  const [extraText, setExtraText] = useState('');

  const selectedPictogram = useMemo(
    () => QUICK_SOS_PICTOGRAMS.find((p) => p.id === selectedPictogramId) ?? QUICK_SOS_PICTOGRAMS[0],
    [selectedPictogramId],
  );
  // Only the SOS this phone sent and is still tracking. Never fall back to someone else's alert.
  const trackedSos = alerts.find((a) => a.id === activeSosId) ?? null;
  const responderAcks = trackedSos?.responderAcks ?? [];
  const reachedCount = trackedSos?.reachedNodeIds.length ?? 0;
  const firstAck = responderAcks[0];
  const verifiedAck = responderAcks.find((r) => r.verifiedCert);
  const onTheWay = responderAcks.find((r) => r.verifiedCert && r.status === 'RESPONDING');

  const sendSos = async () => {
    soundEngine.playSosSent();
    const extra = extraText.trim();
    await broadcastSOS({
      category: selectedPictogram.category,
      text: extra ? `${selectedPictogram.localized[pictoLang].template} ${extra}` : selectedPictogram.localized[pictoLang].template,
      headcount: 2,
      locationPrecision: locPrecision,
      pictogramId: selectedPictogram.id,
    });
    setExtraText('');
  };

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
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] " aria-hidden="true"><Pictogram name={pictogramFor(picto.id, picto.category)} className="h-8 w-8" /></span>
              <span className="min-w-0 text-base leading-snug font-semibold">{picto.localized[pictoLang].title}</span>
              {selected && <Check aria-hidden="true" className="ml-auto h-5 w-5 shrink-0" />}
            </button>
          );
        })}
      </div>

      <label className="mt-5 block">
        <span className="mb-2 block text-lg font-bold text-[var(--fg)]">Add a message <span className="text-base font-normal text-[var(--fg-secondary)]">(optional)</span></span>
        <textarea
          value={extraText}
          onChange={(e) => setExtraText(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="For example: second floor, two people"
          className="min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-base text-[var(--fg)] focus:border-[var(--fg)] focus:outline-none"
        />
      </label>

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
        <p className="mt-2 text-sm text-[var(--fg-secondary)]">{locationHelp[locPrecision]}</p>
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

      {trackedSos && (
        <section aria-labelledby="sos-status-title" className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 id="sos-status-title" className="mb-3 text-lg font-bold text-[var(--fg)]">Your SOS</h2>
          <ul className="flex flex-col gap-3">
            <li className="flex items-center gap-3 text-base font-semibold text-[var(--fg)]">
              <Radio aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--verified-ink)]" />
              Broadcasting
            </li>
            <li className="flex items-center gap-3 text-base font-semibold text-[var(--fg)]">
              {reachedCount > 0 ? <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--safe-ink)]" /> : <Clock aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--fg-secondary)]" />}
              Reached {reachedCount} {reachedCount === 1 ? 'phone' : 'phones'}
            </li>
            {firstAck && (
              <li className="flex items-center gap-3 text-base font-semibold text-[var(--fg)]">
                <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--safe-ink)]" />
                <span className="min-w-0 break-words">Acknowledged by {firstAck.responderName}</span>
              </li>
            )}
            {onTheWay && (
              <li className="flex items-center gap-3 text-base font-semibold text-[var(--fg)]">
                <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--verified-ink)]" />
                <span className="min-w-0 break-words">Responder on the way: {onTheWay.responderName}</span>
              </li>
            )}
            {verifiedAck && !onTheWay && (
              <li className="flex items-center gap-3 text-base font-semibold text-[var(--fg)]">
                <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--verified-ink)]" />
                <span className="min-w-0 break-words">Verified responder: {verifiedAck.responderName}</span>
              </li>
            )}
          </ul>
          {phonesNearby === 0 && !firstAck && (
            <p role="status" className="mt-3 rounded-xl bg-[var(--warn-tint)] px-3 py-2 text-base text-[var(--warn-ink)]">
              No phones nearby. Your SOS is saved and will send the moment a phone connects.
            </p>
          )}
          {lastSosLocationNote && <p className="mt-3 text-sm text-[var(--fg-secondary)]">{lastSosLocationNote}</p>}
        </section>
      )}

      <button type="button" onClick={() => onNavigate('alerts')} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-[var(--verified)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--verified)]">
        View alerts <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </section>
  );
}
