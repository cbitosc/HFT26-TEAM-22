/**
 * 3-Tab Message & Packet Inspector (src/components/MessageInspectorModal.tsx)
 * Packet inspector with route, packet, and crypto details:
 * - Tab 1: Route (hop path chain, delivery state, reached nodes receipts)
 * - Tab 2: Packet (wire header JSON, TTL, hops, priority, byte size)
 * - Tab 3: Crypto (live Ed25519 signature verification, X25519/Channel cipher suite, SHA-256 hash)
 */

import { BridgeChain, DeliveryBridge } from '../ui/BridgeStatus';
import { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Network,
  Route,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { StoredMessage } from '../mesh/types';
import { verifyPacketSignature } from '../crypto/sign';
import { sanketContent } from '../content';
import { utf8ToBytes } from '../crypto/identity';

interface MessageInspectorModalProps {
  message: StoredMessage | null;
  onClose: () => void;
}

export function MessageInspectorModal({
  message,
  onClose,
}: MessageInspectorModalProps) {
  const [activeTab, setActiveTab] = useState<'route' | 'packet' | 'crypto'>(
    'route'
  );
  const [copied, setCopied] = useState(false);
  const [liveVerified, setLiveVerified] = useState<boolean | null>(null);

  if (!message) return null;

  const wireBytes = utf8ToBytes(JSON.stringify(message.packet)).byteLength;
  const isSigValid =
    liveVerified !== null
      ? liveVerified
      : verifyPacketSignature(message.packet);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(message.packet, null, 2)
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleRunLiveVerify = () => {
    const valid = verifyPacketSignature(message.packet);
    setLiveVerified(valid);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cryptographic Packet & Route Inspector"
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-3 sm:p-6"
    >
      <div className="nova-card flex max-h-[88svh] w-full max-w-2xl flex-col overflow-hidden border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-3)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <span className="type-mono-label text-[var(--muted)]">
              packet inspector · id #{message.id.slice(0, 12)}
            </span>
            <h3 className="font-grotesk text-lg font-bold text-[var(--fg)]">
              {message.packet.type} packet · {wireBytes} bytes (limit 4096 B)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[var(--line)] text-[var(--fg)] hover:bg-[var(--surface-2)]"
            aria-label="Close Packet Inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 3-Tab Selector (Route / Packet / Crypto) */}
        <div className="grid grid-cols-3 gap-1.5 border-b border-[var(--line)] bg-[var(--surface-2)] p-2">
          <button
            type="button"
            onClick={() => setActiveTab('route')}
            className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 font-mono text-xs font-bold uppercase transition-colors ${
              activeTab === 'route'
                ? 'bg-[var(--surface)] text-[var(--fg)] shadow-xs'
                : 'text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            <Route className="h-3.5 w-3.5" />
            <span>{sanketContent.inspectorTabs.route}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('packet')}
            className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 font-mono text-xs font-bold uppercase transition-colors ${
              activeTab === 'packet'
                ? 'bg-[var(--surface)] text-[var(--fg)] shadow-xs'
                : 'text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            <span>{sanketContent.inspectorTabs.packet}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('crypto')}
            className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 font-mono text-xs font-bold uppercase transition-colors ${
              activeTab === 'crypto'
                ? 'bg-[var(--surface)] text-[var(--fg)] shadow-xs'
                : 'text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>{sanketContent.inspectorTabs.crypto}</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'route' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div>
                  <div className="type-mono-label text-[var(--muted)]">
                    delivery state machine
                  </div>
                  <div className="mt-1 font-grotesk text-xl font-bold text-[var(--fg)]">
                    {message.deliveryState}
                    {message.relayedHops > 0
                      ? ` (${message.relayedHops} hop${
                          message.relayedHops > 1 ? 's' : ''
                        })`
                      : ''}
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 font-mono text-xs font-bold ${
                    message.deliveryState === 'DELIVERED'
                      ? 'bg-[var(--accent-blue)] text-white'
                      : message.deliveryState === 'RELAYED'
                        ? 'bg-[var(--accent-lilac)] text-[var(--on-fill)]'
                        : message.deliveryState === 'SENT'
                          ? 'bg-[var(--accent-green)] text-[var(--on-fill)]'
                          : 'bg-[var(--surface)] text-[var(--muted)]'
                  }`}
                >
                  {message.deliveryState}
                </span>
              </div>

              <div className="rounded-2xl border border-[var(--line)] p-4">
                <DeliveryBridge state={message.deliveryState} hops={message.relayedHops} />
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-[var(--fg-secondary)]">
                  Relay path ({message.route.length} node{message.route.length === 1 ? '' : 's'})
                </div>
                <div className="rounded-2xl border border-[var(--line)] p-4">
                  <BridgeChain route={message.route} selfId={undefined} />
                </div>
              </div>

              {/* Signed ACK / Relay Receipts */}
              <div className="rounded-2xl border border-[var(--line)] p-4">
                <div className="type-mono-label text-[var(--muted)]">
                  signed ack / relay receipts (lower bound)
                </div>
                <p className="mt-1 text-sm text-[var(--fg)]">
                  {message.reachedNodes.length > 0
                    ? `Verified signed receipts from ${message.reachedNodes.length} node(s): ${message.reachedNodes.join(', ')}`
                    : 'Awaiting signed relay or recipient ACK packets...'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'packet' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
                  <div className="font-mono text-[10px] text-[var(--muted)] uppercase">
                    type / prio
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-[var(--fg)]">
                    {message.packet.type} · P{message.packet.prio}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
                  <div className="font-mono text-[10px] text-[var(--muted)] uppercase">
                    ttl / hops
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-[var(--fg)]">
                    TTL {message.packet.ttl} · HOPS {message.packet.hops}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
                  <div className="font-mono text-[10px] text-[var(--muted)] uppercase">
                    source node
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-[var(--fg)]">
                    {message.packet.src}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
                  <div className="font-mono text-[10px] text-[var(--muted)] uppercase">
                    destination
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-[var(--fg)]">
                    {message.packet.dst}
                  </div>
                </div>
              </div>

              <div className="relative rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="type-mono-label text-[var(--muted)]">
                    wire packet envelope (json ≤ 4kb)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 font-mono text-xs font-semibold text-[var(--fg)]"
                  >
                    <Copy className="h-3 w-3" />
                    <span>{copied ? 'copied!' : 'copy json'}</span>
                  </button>
                </div>
                <pre className="max-h-60 overflow-auto font-mono text-xs leading-relaxed text-[var(--fg)]">
                  {JSON.stringify(message.packet, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'crypto' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div className="flex items-center gap-3">
                  {isSigValid ? (
                    <ShieldCheck className="h-7 w-7 text-[var(--verified-ink)]" />
                  ) : (
                    <ShieldAlert className="h-7 w-7 text-[var(--sos-ink)]" />
                  )}
                  <div>
                    <div className="font-grotesk text-base font-bold text-[var(--fg)]">
                      {isSigValid
                        ? 'Ed25519 Detached Signature VALID'
                        : 'Signature Verification FAILED'}
                    </div>
                    <div className="font-mono text-xs text-[var(--muted)]">
                      Cipher: {message.cipherSuite}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRunLiveVerify}
                  className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full bg-[var(--accent-green)] px-4 py-2 font-mono text-xs font-bold text-[var(--on-fill)]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>re-verify signature</span>
                </button>
              </div>

              <div className="space-y-2.5 rounded-2xl border border-[var(--line)] p-4 font-mono text-xs">
                <div>
                  <span className="text-[var(--muted)]">
                    Sender Ed25519 Public Key (base64):
                  </span>
                  <div className="mt-0.5 break-all text-[var(--fg)]">
                    {message.packet.srcSignPub}
                  </div>
                </div>
                <div>
                  <span className="text-[var(--muted)]">
                    Sender X25519 ECDH Public Key (base64):
                  </span>
                  <div className="mt-0.5 break-all text-[var(--fg)]">
                    {message.packet.srcBoxPub}
                  </div>
                </div>
                <div>
                  <span className="text-[var(--muted)]">
                    24-Byte XSalsa20 Nonce (base64):
                  </span>
                  <div className="mt-0.5 break-all text-[var(--fg)]">
                    {message.packet.nonce}
                  </div>
                </div>
                <div>
                  <span className="text-[var(--muted)]">
                    Ed25519 Signature (64 bytes base64):
                  </span>
                  <div className="mt-0.5 break-all text-[var(--fg)]">
                    {message.packet.sig}
                  </div>
                </div>
                <div>
                  <span className="text-[var(--muted)]">
                    Packet Digest (SHA-512/256 hex):
                  </span>
                  <div className="mt-0.5 break-all text-[var(--verified-ink)]">
                    {message.packetHashHex}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
