/**
 * Messages & E2E Encrypted Thread Screen (src/screens/MessagesScreen.tsx)
 * Per §8.4:
 * - Conversation list with priority badges, hop distance, and TOFU verification status.
 * - Thread view with per-message status:
 *   PENDING -> SENT -> RELAYED (n hops) -> DELIVERED
 * - Click / long-press any message -> opens the 3-tab MessageInspectorModal (Route, Packet, Crypto).
 */

import React, { useMemo, useState } from 'react';
import { ShowMoreButton, usePagedList } from '../ui/paging';
import {
  CheckCheck,
  Clock,
  Eye,
  Lock,
  Radio,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useMeshStore } from '../store/useMeshStore';
import { PriorityLevel, StoredMessage } from '../mesh/types';
import { MessageInspectorModal } from '../components/MessageInspectorModal';

export function MessagesScreen() {
  const identity = useMeshStore((s) => s.identity);
  const peers = useMeshStore((s) => s.peers);
  const messages = useMeshStore((s) => s.messages);
  const activeConversationId = useMeshStore((s) => s.activeConversationId);
  const setActiveConversation = useMeshStore((s) => s.setActiveConversation);
  const sendDirectMessage = useMeshStore((s) => s.sendDirectMessage);

  const [draftText, setDraftText] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>(2);
  const [inspectedMsg, setInspectedMsg] = useState<StoredMessage | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const selectedPeerId =
    activeConversationId ?? peers[peers.length - 1]?.nodeId ?? 'BROADCAST';
  const selectedPeer = peers.find((p) => p.nodeId === selectedPeerId);

  const conversationMessages = useMemo(
    () => messages.filter((m) => m.conversationId === selectedPeerId),
    [messages, selectedPeerId]
  );
  const pagedMessages = usePagedList(conversationMessages, 30, true);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftText.trim() || selectedPeerId === 'BROADCAST') return;
    setSendError(null);
    try {
      const textToSend = draftText.trim();
      setDraftText('');
      await sendDirectMessage(selectedPeerId, textToSend, priority);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderDeliveryBadge = (msg: StoredMessage) => {
    switch (msg.deliveryState) {
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-blue)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-white">
            <CheckCheck className="h-3 w-3" />
            <span>
              DELIVERED ({msg.relayedHops} hop{msg.relayedHops === 1 ? '' : 's'})
            </span>
          </span>
        );
      case 'RELAYED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-lilac)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--on-fill)]">
            <Radio className="h-3 w-3" />
            <span>RELAYED ({msg.relayedHops} hops)</span>
          </span>
        );
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-green)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--on-fill)]">
            <span>SENT (1st hop)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--muted)]">
            <Clock className="h-3 w-3" />
            <span>PENDING (outbox queued)</span>
          </span>
        );
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-2 pb-28 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="type-mono-label text-[var(--muted)]">
            02 / 07 — end-to-end encrypted mesh threads
          </span>
          <h1 className="type-h2 mt-0.5 font-grotesk text-[var(--fg)] lowercase">
            x25519 + ed25519 store-and-forward messages
          </h1>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          <Lock className="h-3.5 w-3.5 text-[var(--verified-ink)]" />
          <span>relays read headers only, never plaintext</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Column: Peer Conversation List */}
        <div className="nova-card flex flex-col overflow-hidden lg:col-span-4">
          <div className="border-b border-[var(--line)] px-4 py-3 font-mono text-xs font-bold text-[var(--muted)] uppercase">
            mesh peers ({peers.length})
          </div>
          <div className="divide-y divide-[var(--line)]">
            {peers.map((peer) => {
              const isSelected = peer.nodeId === selectedPeerId;
              const threadMsgs = messages.filter(
                (m) => m.conversationId === peer.nodeId
              );
              const lastMsg = threadMsgs[threadMsgs.length - 1];

              return (
                <button
                  key={peer.nodeId}
                  type="button"
                  onClick={() => setActiveConversation(peer.nodeId)}
                  className={`flex min-h-[68px] w-full cursor-pointer flex-col justify-between p-3.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-[var(--surface-2)]'
                      : 'hover:bg-[var(--surface-2)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-grotesk text-sm font-bold text-[var(--fg)]">
                        {peer.displayName}
                      </span>
                      {peer.trustStatus === 'verified' ? (
                        <ShieldCheck
                          className="h-4 w-4 text-[var(--verified-ink)]"
                          aria-label="Verified Contact"
                        />
                      ) : peer.trustStatus === 'key_changed' ? (
                        <ShieldAlert
                          className="h-4 w-4 text-[var(--sos-ink)]"
                          aria-label="WARNING: Public key changed (TOFU alert)"
                        />
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                        peer.isDirectNeighbor
                          ? 'bg-[var(--accent-green)] text-[var(--on-fill)]'
                          : 'bg-[var(--accent-lilac)] text-[var(--on-fill)]'
                      }`}
                    >
                      {peer.hopsAway} {peer.hopsAway === 1 ? 'hop' : 'hops'}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-[var(--muted)]">
                      {lastMsg
                        ? lastMsg.text
                        : `Tap to message across ${peer.hopsAway} hop(s)`}
                    </p>
                    <span className="font-mono text-[10px] text-[var(--muted)]">
                      #{peer.nodeId.slice(0, 6)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Thread + Composer */}
        <div className="nova-card flex min-h-[460px] flex-col justify-between overflow-hidden lg:col-span-8">
          {/* Thread Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-grotesk text-base font-bold text-[var(--fg)]">
                  {selectedPeer
                    ? selectedPeer.displayName
                    : 'Broadcast Channel'}
                </h2>
                {selectedPeer && (
                  <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--fg)]">
                    {selectedPeer.trustStatus.toUpperCase()} ·{' '}
                    {selectedPeer.hopsAway} HOP(S)
                  </span>
                )}
              </div>
              <div className="font-mono text-[11px] text-[var(--muted)]">
                Node Fingerprint: #{selectedPeerId} · E2E X25519-XSalsa20-Poly1305
              </div>
            </div>
          </div>

          {/* Messages List */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {conversationMessages.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center text-center">
                <p className="font-grotesk text-base font-semibold text-[var(--fg)] lowercase">
                  no encrypted packets in this thread yet
                </p>
                <p className="mt-1 max-w-sm text-xs text-[var(--muted)]">
                  Send a message below. Even if {selectedPeer?.displayName} is 3 hops away or temporarily disconnected, Sanket will route or store-and-forward it automatically.
                </p>
              </div>
            ) : (
              <>
              <ShowMoreButton hiddenCount={pagedMessages.hiddenCount} onClick={pagedMessages.showMore} label="Show earlier messages" />
              {pagedMessages.visible.map((msg) => {
                const isOutbound = msg.senderId === identity.nodeId;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      isOutbound ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-lg rounded-2xl border p-3.5 ${
                        isOutbound
                          ? 'border-[var(--fg)]/20 bg-[var(--surface-2)]'
                          : 'border-[var(--line)] bg-[var(--surface)]'
                      }`}
                    >
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold text-[var(--muted)] uppercase">
                          {msg.senderName} · P{msg.priority}
                        </span>
                        {renderDeliveryBadge(msg)}
                      </div>

                      <p className="text-sm leading-relaxed text-[var(--fg)]">
                        {msg.text}
                      </p>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-2">
                        <span className="font-mono text-[10px] text-[var(--muted)]">
                          Route: {msg.route.join(' → ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setInspectedMsg(msg)}
                          className="flex cursor-pointer items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--fg)] transition-colors hover:border-[var(--fg)]"
                        >
                          <Eye className="h-3 w-3 text-[var(--verified-ink)]" />
                          <span>inspect route & crypto</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              </>
            )}
          </div>

          {/* Message Composer */}
          {selectedPeerId !== 'BROADCAST' && (
            <form
              onSubmit={handleSend}
              className="border-t border-[var(--line)] bg-[var(--surface-2)] p-3"
            >
              {sendError && (
                <div className="mb-2 rounded-xl bg-[var(--accent-coral)]/15 px-3 py-1.5 font-mono text-xs text-[var(--sos-ink)]">
                  {sendError}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Message Priority"
                  value={priority}
                  onChange={(e) =>
                    setPriority(Number(e.target.value) as PriorityLevel)
                  }
                  className="min-h-[48px] rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 font-mono text-xs font-bold text-[var(--fg)]"
                >
                  <option value={2}>P2 · Normal</option>
                  <option value={1}>P1 · Emergency</option>
                </select>

                <input
                  type="text"
                  maxLength={500}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder={`Encrypted message to ${
                    selectedPeer?.displayName ?? 'peer'
                  } (≤ 500 chars)...`}
                  className="min-h-[48px] flex-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--fg)] focus:border-[var(--fg)] focus:outline-none"
                />

                <button
                  type="submit"
                  className="flex min-h-[48px] cursor-pointer items-center gap-1.5 rounded-full bg-[var(--accent-green)] px-5 py-2.5 font-grotesk text-sm font-bold text-[var(--on-fill)] transition-transform active:scale-95"
                >
                  <Send className="h-4 w-4" />
                  <span>send</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* 3-Tab Packet / Route / Crypto Inspector Modal */}
      <MessageInspectorModal
        message={inspectedMsg}
        onClose={() => setInspectedMsg(null)}
      />
    </section>
  );
}
