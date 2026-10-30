/**
 * Thumb-Reachable Floating Bottom Pill Navigation (src/app/BottomPillNav.tsx)
 * Per §7 & §8:
 * Converts NOVA's floating centered pill nav into a mobile-first bottom tab pill
 * with ≥ 48px touch targets, semantic accent indicators, and section counter ("01 / 08").
 */

import {
  AlertTriangle,
  Bot,
  Cpu,
  HeartHandshake,
  Home,
  MessageSquareLock,
  Network,
  RadioTower,
} from 'lucide-react';
import { AppScreenId, MOBILE_TABS } from '../content';
import { useMeshStore } from '../store/useMeshStore';

interface BottomPillNavProps {
  activeScreen: AppScreenId;
  onNavigate: (screen: AppScreenId) => void;
}

export function BottomPillNav({
  activeScreen,
  onNavigate,
}: BottomPillNavProps) {
  const alerts = useMeshStore((s) => s.alerts);
  const messages = useMeshStore((s) => s.messages);
  const activeSosId = useMeshStore((s) => s.activeSosId);

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledgedByMe).length;
  const activeTabMeta =
    MOBILE_TABS.find((t) => t.id === activeScreen) ?? MOBILE_TABS[0];

  const renderIcon = (id: AppScreenId) => {
    switch (id) {
      case 'home':
        return <Home className="h-4 w-4" />;
      case 'messages':
        return <MessageSquareLock className="h-4 w-4" />;
      case 'sos':
        return <RadioTower className="h-4 w-4" />;
      case 'alerts':
        return <AlertTriangle className="h-4 w-4" />;
      case 'circles':
        return <HeartHandshake className="h-4 w-4" />;
      case 'map':
        return <Network className="h-4 w-4" />;
      case 'simulator':
        return <Cpu className="h-4 w-4" />;
      case 'ai':
        return <Bot className="h-4 w-4" />;
      default:
        return <Home className="h-4 w-4" />;
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center pb-3 px-2 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2">
        {/* Bottom-Left NOVA Section Index Counter */}
        <div className="pointer-events-auto hidden items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 font-mono text-[11px] font-semibold tracking-wider text-[var(--fg)] uppercase shadow-[var(--shadow-1)] xl:flex">
          <span className="text-[var(--muted)]">
            {activeTabMeta.counterIndex} / 08
          </span>
          <span>{activeTabMeta.shortLabel}</span>
        </div>

        {/* Centered Thumb-Reachable Floating Pill Bar */}
        <nav
          aria-label="Primary Mobile Navigation"
          className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center justify-between gap-1 overflow-x-auto rounded-full border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-2)]"
        >
          {MOBILE_TABS.map((tab) => {
            const isActive = activeScreen === tab.id;
            const isSos = tab.id === 'sos';

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                className={`relative flex min-h-[48px] min-w-[48px] flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 font-mono text-[10px] font-bold tracking-wider uppercase transition-all sm:flex-row sm:gap-1.5 sm:text-[11px] ${
                  isSos
                    ? isActive || activeSosId
                      ? 'bg-[var(--accent-coral)] text-white shadow-sm'
                      : 'bg-[var(--accent-coral)]/15 text-[var(--sos-ink)] hover:bg-[var(--accent-coral)]/25'
                    : isActive
                      ? 'bg-[var(--fg)] text-[var(--bg)] shadow-xs'
                      : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]'
                }`}
              >
                {renderIcon(tab.id)}
                <span>{tab.shortLabel}</span>

                {tab.id === 'alerts' && unacknowledgedAlerts > 0 && (
                  <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent-coral)] px-1 text-[9px] font-bold text-white">
                    {unacknowledgedAlerts}
                  </span>
                )}

                {tab.id === 'messages' && messages.length > 0 && !isActive && (
                  <span className="ml-0.5 hidden h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent-lilac)] px-1 text-[9px] font-bold text-[var(--on-fill)] sm:inline-flex">
                    {messages.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
