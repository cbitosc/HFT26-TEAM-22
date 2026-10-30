/**
 * Radio diagnostics (src/screens/RadioDiagnosticsScreen.tsx): live view of the real Nearby radio so a
 * failed two-phone test can be explained. REAL mode only. Polls the native plugin every 1.5 s.
 * Technical terms (TTL, seen-cache, priority) are allowed here and in the Packet Inspector only.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { getRadioDiagnostics, useMeshStore } from '../store/useMeshStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { DemoGate } from '../ui/DemoGate';

type Diag = NonNullable<Awaited<ReturnType<typeof getRadioDiagnostics>>>;

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-sm text-[var(--fg-secondary)]">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-right text-sm font-semibold break-words text-[var(--fg)]">
        {ok === true && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--verified-ink)]" />}
        {ok === false && <X aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--sos)]" />}
        {value}
      </span>
    </div>
  );
}

const yn = (b: boolean | undefined) => (b ? 'yes' : 'no');
const clock = (ms: number) => new Date(ms).toLocaleTimeString();

export function formatDiagnostics(d: Diag): string {
  const n = d.native;
  const lines: string[] = [];
  lines.push(`Sanket Setu radio diagnostics @ ${new Date().toISOString()}`);
  if (n) {
    lines.push(`sdk=${n.sdkInt} node=${n.nodeId} service=${n.serviceId} power=${n.powerMode}`);
    lines.push(`bluetooth=${yn(n.bluetoothEnabled)} wifi=${yn(n.wifiEnabled)} location=${yn(n.locationServicesEnabled)} fgs=${yn(n.foregroundService)}`);
    lines.push(`permissions=${JSON.stringify(n.permissions)}`);
    lines.push(`advertising=${yn(n.advertising.active)} err=${n.advertising.error ? `${n.advertising.error.code} ${n.advertising.error.message}` : 'none'}`);
    lines.push(`discovering=${yn(n.discovery.active)} err=${n.discovery.error ? `${n.discovery.error.code} ${n.discovery.error.message}` : 'none'}`);
    lines.push(`found=${n.discovered.length} ${JSON.stringify(n.discovered)}`);
    lines.push(`connected=${n.connected.length} ${JSON.stringify(n.connected)}`);
    lines.push(`native sent=${n.sentCount} received=${n.receivedCount} sendFailures=${n.sendFailures}`);
    lines.push(`--- native log ---`, ...n.log);
  } else {
    lines.push('native diagnostics unavailable');
  }
  lines.push(`js startAttempts=${d.js.startAttempts} lastStartError=${d.js.lastStartError ?? 'none'}`);
  lines.push(`js sent=${d.js.sent} received=${d.js.received} lastSent=${JSON.stringify(d.js.lastSent)} lastReceived=${JSON.stringify(d.js.lastReceived)}`);
  lines.push(`outbox=${d.outboxSize} lastDrop=${d.lastDrop ? `${d.lastDrop.reason} (${d.lastDrop.detail})` : 'none'}`);
  return lines.join('\n');
}

export function RadioDiagnosticsScreen() {
  const appMode = useMeshStore((s) => s.appMode);
  const ensureRadio = useMeshStore((s) => s.ensureRadio);
  const requestMeshPermissions = useMeshStore((s) => s.requestMeshPermissions);
  const openAppSettings = useMeshStore((s) => s.openAppSettings);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setDiag(await getRadioDiagnostics());
  }, []);

  useEffect(() => {
    if (appMode !== 'real') return;
    void refresh();
    const t = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(t);
  }, [appMode, refresh]);

  if (appMode !== 'real') return <DemoGate what="Radio diagnostics" />;

  const copy = async () => {
    if (!diag) return;
    try {
      await navigator.clipboard.writeText(formatDiagnostics(diag));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const n = diag?.native ?? null;
  const perms = n?.permissions;
  const permRows: Array<[string, boolean | undefined]> = perms
    ? [
        ['Bluetooth scan', perms.bluetoothScan],
        ['Bluetooth advertise', perms.bluetoothAdvertise],
        ['Bluetooth connect', perms.bluetoothConnect],
        ['Nearby Wi-Fi devices', perms.nearbyWifi],
        ['Location (Android 12 and older)', perms.fineLocation],
        ['Notifications', perms.notifications],
      ].filter(([, v]) => v !== undefined) as Array<[string, boolean]>
    : [];

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-4">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Radio diagnostics</h1>
      <p className="text-sm text-[var(--fg-secondary)]">Live state of the Bluetooth and Wi-Fi Direct radio. Share this when two phones do not connect.</p>

      {!diag && <p role="status" className="text-base text-[var(--fg-secondary)]">Reading radio state…</p>}
      {diag && !n && (
        <Card className="p-4">
          <p className="text-base font-semibold text-[var(--fg)]">No native radio on this device.</p>
          <p className="mt-1 text-sm text-[var(--fg-secondary)]">This is a browser or an unsupported device. Install the Android app on two phones to test.</p>
        </Card>
      )}

      {diag && n && (
        <>
          <Card className="divide-y divide-[var(--line)] px-4 py-2">
            <h2 className="py-2 text-base font-bold text-[var(--fg)]">Permissions</h2>
            {permRows.map(([label, v]) => (
              <Row key={label} label={label} value={v ? 'granted' : 'missing'} ok={Boolean(v)} />
            ))}
            <Row label="Bluetooth switched on" value={yn(n.bluetoothEnabled)} ok={n.bluetoothEnabled} />
            <Row label="Wi-Fi switched on" value={yn(n.wifiEnabled)} ok={n.wifiEnabled} />
            <Row label="Location services" value={yn(n.locationServicesEnabled)} ok={n.locationServicesEnabled} />
          </Card>

          <Card className="divide-y divide-[var(--line)] px-4 py-2">
            <h2 className="py-2 text-base font-bold text-[var(--fg)]">Nearby Connections</h2>
            <Row label="Foreground service" value={yn(n.foregroundService)} ok={n.foregroundService} />
            <Row label="Advertising" value={yn(n.advertising.active)} ok={n.advertising.active} />
            {n.advertising.error && <Row label="Advertising error" value={`${n.advertising.error.code}: ${n.advertising.error.message}`} ok={false} />}
            <Row label="Discovering" value={yn(n.discovery.active)} ok={n.discovery.active} />
            {n.discovery.error && <Row label="Discovery error" value={`${n.discovery.error.code}: ${n.discovery.error.message}`} ok={false} />}
            {diag.js.lastStartError && <Row label="Last start error" value={diag.js.lastStartError} ok={false} />}
            <Row label="Start attempts" value={String(diag.js.startAttempts)} />
            <Row label="Endpoints found" value={String(n.discovered.length)} />
            <Row label="Endpoints connected" value={String(n.connected.length)} ok={n.connected.length > 0} />
            {n.connected.map((c) => (
              <Row key={c.endpointId} label={c.name || c.endpointId} value={c.nodeId ?? 'node id unknown'} />
            ))}
          </Card>

          <Card className="divide-y divide-[var(--line)] px-4 py-2">
            <h2 className="py-2 text-base font-bold text-[var(--fg)]">Traffic</h2>
            <Row
              label="Last payload sent"
              value={n.lastSent ? `${clock(n.lastSent.at)}, ${n.lastSent.bytes} B to ${n.lastSent.peer}` : 'none yet'}
            />
            <Row
              label="Last payload received"
              value={n.lastReceived ? `${clock(n.lastReceived.at)}, ${n.lastReceived.bytes} B from ${n.lastReceived.peer}` : 'none yet'}
            />
            <Row label="Sent / received / failed" value={`${n.sentCount} / ${n.receivedCount} / ${n.sendFailures}`} />
            <Row label="Outbox (waiting to send)" value={String(diag.outboxSize)} />
            <Row
              label="Last dropped packet"
              value={diag.lastDrop ? `${diag.lastDrop.reason}: ${diag.lastDrop.detail}` : 'none'}
            />
          </Card>

          <Card className="px-4 py-3">
            <h2 className="pb-2 text-base font-bold text-[var(--fg)]">Recent radio log</h2>
            <pre className="max-h-64 overflow-auto text-xs leading-relaxed whitespace-pre-wrap text-[var(--fg-secondary)]">{n.log.slice(-40).join('\n') || 'empty'}</pre>
          </Card>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" tone="primary" onClick={() => void copy()} disabled={!diag}>
          <Copy aria-hidden="true" className="h-5 w-5" />
          {copied ? 'Copied' : 'Copy diagnostics'}
        </Button>
        <Button type="button" onClick={() => void ensureRadio().then(refresh)}>Restart radio</Button>
        <Button type="button" onClick={() => void requestMeshPermissions().then(refresh)}>Ask permissions</Button>
        <Button type="button" onClick={() => void openAppSettings()}>Open settings</Button>
      </div>
    </section>
  );
}
