/**
 * Bottom navigation (src/app/BottomPillNav.tsx): exactly five items — Home, Chat, SOS (centre,
 * coral, raised), Alerts (with unread count), More. "More" opens a sheet with the remaining
 * screens. Every item is >= 48px with a text label, and the bar respects the bottom safe-area
 * inset. Solid surface, no blur. Uses narrow selectors (counts, not whole arrays).
 */

import { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Bot,
  ChevronRight,
  Cpu,
  Gauge,
  HeartHandshake,
  Home,
  Map as MapIcon,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AppScreenId } from '../content';
import { useMeshStore } from '../store/useMeshStore';
import { Sheet } from '../ui/Sheet';

interface BottomPillNavProps {
  activeScreen: AppScreenId;
  onNavigate: (screen: AppScreenId) => void;
}

const MORE_ITEMS: { id: AppScreenId; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'circles', label: 'Safety circles', hint: 'Check in with family and groups', icon: HeartHandshake },
  { id: 'map', label: 'Mesh map', hint: 'Nearby nodes and hazards (simulated)', icon: MapIcon },
  { id: 'simulator', label: 'Simulator', hint: 'Test the mesh without phones', icon: Cpu },
  { id: 'quality', label: 'Mesh quality', hint: 'Latency, delivery and drops, measured', icon: Gauge },
  { id: 'ai', label: 'AI assistant', hint: 'Optional, online only', icon: Bot },
  { id: 'settings', label: 'Settings', hint: 'Power, display, keys, responder', icon: Settings },
  { id: 'onboarding', label: 'Setup & permissions', hint: 'Name, PIN, Android permissions', icon: ShieldCheck },
];

const MORE_IDS = new Set<AppScreenId>(MORE_ITEMS.map((m) => m.id));

function NavItem({
  label,
  icon: Icon,
  active,
  onClick,
  badge,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-[56px] min-w-[48px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
        active ? 'text-[var(--verified-ink)]' : 'text-[var(--fg-secondary)]'
      }`}
    >
      <span className="relative">
        <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1.5 -right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--sos)] px-1 text-[0.6875rem] font-bold text-[var(--on-sos)] tabular-nums">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span>{label}</span>
      {active && <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--verified)]" />}
    </button>
  );
}

export function BottomPillNav({ activeScreen, onNavigate }: BottomPillNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const unreadAlerts = useMeshStore(
    (s) => s.alerts.filter((a) => !a.acknowledgedByMe).length
  );
  const sosActive = useMeshStore((s) => s.activeSosId !== null);

  const go = (id: AppScreenId) => {
    setMoreOpen(false);
    onNavigate(id);
  };

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-[var(--surface)]"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="mx-auto flex h-[var(--nav-h)] max-w-lg items-stretch px-1">
          <NavItem label="Home" icon={Home} active={activeScreen === 'home'} onClick={() => go('home')} />
          <NavItem label="Chat" icon={MessageSquare} active={activeScreen === 'messages'} onClick={() => go('messages')} />

          <div className="flex flex-1 items-start justify-center">
            <button
              type="button"
              onClick={() => go('sos')}
              aria-current={activeScreen === 'sos' ? 'page' : undefined}
              aria-label={sosActive ? 'SOS, active — open tracker' : 'SOS'}
              className="-mt-5 flex h-16 w-16 flex-col items-center justify-center rounded-full border-4 border-[var(--surface)] bg-[var(--sos)] text-[var(--on-sos)] shadow-[var(--shadow-2)]"
            >
              <AlertOctagon aria-hidden="true" className="h-6 w-6" />
              <span className="text-xs leading-tight font-bold">SOS</span>
            </button>
          </div>

          <NavItem
            label="Alerts"
            icon={AlertTriangle}
            active={activeScreen === 'alerts'}
            onClick={() => go('alerts')}
            badge={unreadAlerts}
          />
          <NavItem label="More" icon={Menu} active={MORE_IDS.has(activeScreen)} onClick={() => setMoreOpen(true)} />
        </div>
      </nav>

      <Sheet open={moreOpen} title="More" onClose={() => setMoreOpen(false)}>
        <ul className="divide-y divide-[var(--line)]">
          {MORE_ITEMS.map(({ id, label, hint, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => go(id)}
                aria-current={activeScreen === id ? 'page' : undefined}
                className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)]">
                  <Icon aria-hidden="true" className="h-5 w-5 text-[var(--fg)]" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-semibold text-[var(--fg)]">{label}</span>
                  <span className="text-sm text-[var(--fg-secondary)]">{hint}</span>
                </span>
                <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--fg-secondary)]" />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
