/**
 * Chat (src/screens/MessagesScreen.tsx): two places to talk.
 * - "Everyone nearby": a shared channel that reaches every phone in range and is passed along.
 * - "Nearby people": phones that have actually introduced themselves (signed HELLO); tap one for a
 *   private end-to-end encrypted thread.
 * Messages sent while no phone is connected wait in the outbox ("Waiting for a nearby phone") and go
 * out by themselves when a phone connects. Status text is plain language (src/lib/deliveryLabel.ts).
 * The composer is sticky above the bottom nav so the keyboard never hides it.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock, Info, Search, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useMeshStore } from '../store/useMeshStore';
import { StoredMessage } from '../mesh/types';
import { MessageInspectorModal } from '../components/MessageInspectorModal';
import { HowItWorksSheet } from '../ui/HowItWorksSheet';
import { NearbyPeopleList } from '../ui/NearbyPeopleList';
import { deliveryLabel } from '../lib/deliveryLabel';
import { timeAgo } from '../lib/timeAgo';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ShowMoreButton, usePagedList } from '../ui/paging';

type Tab = 'everyone' | 'people';

function StatusLine({ msg }: { msg: StoredMessage }) {
  const waiting = msg.deliveryState === 'PENDING';
  const Icon = waiting ? Clock : Check;
  return (
    <span className="flex items-center gap-1 text-sm text-[var(--fg-secondary)]">
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      {deliveryLabel(msg.deliveryState, msg.relayedHops)}
    </span>
  );
}

function Bubble({ msg, mine, showSender, onInspect }: { msg: StoredMessage; mine: boolean; showSender: boolean; onInspect: () => void }) {
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 ${
          mine ? 'border-[var(--line)] bg-[var(--surface-2)]' : 'border-[var(--line)] bg-[var(--surface)]'
        }`}
      >
        {showSender && !mine && <p className="text-sm font-bold text-[var(--fg)]">{msg.senderName}</p>}
        <p className="text-base break-words text-[var(--fg)]">{msg.text}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {mine ? <StatusLine msg={msg} /> : <span className="text-sm text-[var(--fg-secondary)]">{timeAgo(msg.timestamp)}</span>}
          <button
            type="button"
            onClick={onInspect}
            aria-label="Message details"
            className="flex min-h-12 min-w-12 items-center justify-center text-[var(--fg-secondary)]"
          >
            <Info aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MessagesScreen() {
  const identity = useMeshStore((s) => s.identity);
  const peers = useMeshStore((s) => s.peers);
  const messages = useMeshStore((s) => s.messages);
  const activeConversationId = useMeshStore((s) => s.activeConversationId);
  const setActiveConversation = useMeshStore((s) => s.setActiveConversation);
  const sendDirectMessage = useMeshStore((s) => s.sendDirectMessage);
  const sendBroadcastMessage = useMeshStore((s) => s.sendBroadcastMessage);
  const phonesNearby = useMeshStore((s) => s.peers.filter((p) => p.isDirectNeighbor).length);

  const privateId = activeConversationId && activeConversationId !== 'BROADCAST' ? activeConversationId : null;
  const [tab, setTab] = useState<Tab>(privateId ? 'people' : 'everyone');
  const [draft, setDraft] = useState('');
  const [inspected, setInspected] = useState<StoredMessage | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const inPrivateThread = tab === 'people' && privateId !== null;
  const threadId = inPrivateThread ? privateId : 'BROADCAST';
  const person = peers.find((p) => p.nodeId === privateId);
  const personName = person?.displayName ?? messages.find((m) => m.conversationId === privateId && m.direction === 'inbound')?.senderName ?? 'this phone';

  const thread = useMemo(() => messages.filter((m) => m.conversationId === threadId), [messages, threadId]);
  const paged = usePagedList(thread, 30, true);
  const showComposer = tab === 'everyone' || inPrivateThread;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.length, threadId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSendError(null);
    setDraft('');
    try {
      if (inPrivateThread && privateId) await sendDirectMessage(privateId, text, 2);
      else await sendBroadcastMessage(text, 2);
    } catch (err) {
      setDraft(text);
      setSendError(err instanceof Error ? err.message : String(err));
    }
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    if (next === 'everyone') setActiveConversation('BROADCAST');
    else setActiveConversation(null);
  };

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col px-4 pt-3">
      {inPrivateThread ? (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveConversation(null)}
            aria-label="Back to nearby people"
            className="flex h-12 w-12 items-center justify-center rounded-full text-[var(--fg)]"
          >
            <ArrowLeft aria-hidden="true" className="h-6 w-6" />
          </button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 truncate text-xl font-bold text-[var(--fg)]">
              {personName}
              {person?.trustStatus === 'verified' && <ShieldCheck aria-label="Verified" className="h-5 w-5 text-[var(--verified-ink)]" />}
              {person?.trustStatus === 'key_changed' && <ShieldAlert aria-label="Key changed" className="h-5 w-5 text-[var(--sos-ink)]" />}
            </h1>
            <p className="text-sm text-[var(--fg-secondary)]">Private. Only {personName} can read this.</p>
          </div>
        </div>
      ) : (
        <>
          <h1 className="mb-2 text-2xl font-bold text-[var(--fg)]">Chat</h1>
          <div role="tablist" aria-label="Chat" className="mb-3 grid grid-cols-2 gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-1">
            {([
              ['everyone', 'Everyone nearby'],
              ['people', `Nearby people${peers.length ? ` (${peers.length})` : ''}`],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => switchTab(id)}
                className={`min-h-12 rounded-full px-2 text-base font-semibold ${
                  tab === id ? 'bg-[var(--surface)] text-[var(--fg)] shadow-[var(--shadow-1)]' : 'text-[var(--fg-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'people' && !inPrivateThread && (
        peers.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-5 py-8 text-center">
            <Search aria-hidden="true" className="h-8 w-8 text-[var(--fg-secondary)]" />
            <p className="text-lg font-bold text-[var(--fg)]">No phones nearby yet.</p>
            <p className="text-base text-[var(--fg-secondary)]">
              Ask a friend to open Sanket Setu and stay within about 30 to 100 m.
            </p>
            <Button type="button" onClick={() => setHelpOpen(true)}>How it works</Button>
          </Card>
        ) : (
          <NearbyPeopleList onSelect={(id) => setActiveConversation(id)} />
        )
      )}

      {showComposer && (
        <>
          {tab === 'everyone' && (
            <p className="mb-2 text-sm text-[var(--fg-secondary)]">
              {phonesNearby > 0
                ? `Everyone within range sees this. ${phonesNearby} phone${phonesNearby === 1 ? '' : 's'} connected.`
                : 'No phones nearby yet. Messages wait here and send when a phone connects.'}
            </p>
          )}
          <div className="flex min-h-[40vh] flex-col gap-3 pb-3">
            {thread.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 px-5 py-8 text-center">
                <p className="text-lg font-bold text-[var(--fg)]">
                  {tab === 'everyone' ? 'Nothing here yet.' : `Say hello to ${personName}.`}
                </p>
                <p className="text-base text-[var(--fg-secondary)]">
                  {tab === 'everyone' && phonesNearby === 0
                    ? 'Ask a friend to open Sanket Setu and stay within about 30 to 100 m.'
                    : 'Type below. You will see when it is sent.'}
                </p>
                {tab === 'everyone' && <Button type="button" onClick={() => setHelpOpen(true)}>How it works</Button>}
              </Card>
            ) : (
              <>
                <ShowMoreButton hiddenCount={paged.hiddenCount} onClick={paged.showMore} label="Show earlier messages" />
                {paged.visible.map((m) => (
                  <Bubble
                    key={m.id}
                    msg={m}
                    mine={m.senderId === identity.nodeId}
                    showSender={tab === 'everyone'}
                    onInspect={() => setInspected(m)}
                  />
                ))}
              </>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={submit}
            className="sticky z-20 -mx-4 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-2"
            style={{ bottom: 'calc(var(--nav-h) + var(--safe-bottom))' }}
          >
            {sendError && <p role="alert" className="mb-2 text-sm font-semibold text-[var(--sos-ink)]">{sendError}</p>}
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={500}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label={tab === 'everyone' ? 'Message to everyone nearby' : `Private message to ${personName}`}
                placeholder={tab === 'everyone' ? 'Message everyone nearby' : `Message ${personName}`}
                className="min-h-12 min-w-0 flex-1 rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 text-base text-[var(--fg)] focus:border-[var(--fg)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Send"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--verified)] text-[var(--on-verified)] disabled:opacity-50"
              >
                <Send aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
          </form>
        </>
      )}

      <MessageInspectorModal message={inspected} onClose={() => setInspected(null)} />
      <HowItWorksSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}
