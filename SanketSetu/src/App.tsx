/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AppScreenId, MOBILE_TABS } from './content';
import { useReducedMotion } from './hooks/useReducedMotion';
import { soundEngine } from './lib/audio';
import { setDiscreteState } from "./lib/scroll";
import { ThemeMode } from "./ui/theme";

import { Preloader } from './scenes/Preloader';
import { Grain } from './components/Grain';
import { CircularText } from './components/CircularText';
import { TopBar } from './app/TopBar';
import { BottomPillNav } from './app/BottomPillNav';
import { useMeshStore } from './store/useMeshStore';

// Lazy-loaded per route: HomeScreen alone pulls in the Three.js/R3F Orb (~500KB+ gzipped), so
// keeping every screen out of the main entry chunk means that cost is only paid for the routes
// that are actually visited, and screens other than Home never download it at all.
const HomeScreen = lazy(() =>
  import('./screens/HomeScreen').then((m) => ({ default: m.HomeScreen }))
);
const OnboardingScreen = lazy(() =>
  import('./screens/OnboardingScreen').then((m) => ({ default: m.OnboardingScreen }))
);
const MessagesScreen = lazy(() =>
  import('./screens/MessagesScreen').then((m) => ({ default: m.MessagesScreen }))
);
const SOSComposerScreen = lazy(() =>
  import('./screens/SOSComposerScreen').then((m) => ({ default: m.SOSComposerScreen }))
);
const AlertsFeedScreen = lazy(() =>
  import('./screens/AlertsFeedScreen').then((m) => ({ default: m.AlertsFeedScreen }))
);
const CirclesSafetyScreen = lazy(() =>
  import('./screens/CirclesSafetyScreen').then((m) => ({ default: m.CirclesSafetyScreen }))
);
const MeshMapScreen = lazy(() =>
  import('./screens/MeshMapScreen').then((m) => ({ default: m.MeshMapScreen }))
);
const SimulatorScreen = lazy(() =>
  import('./screens/SimulatorScreen').then((m) => ({ default: m.SimulatorScreen }))
);
const AIAssistantScreen = lazy(() =>
  import('./screens/AIAssistantScreen').then((m) => ({ default: m.AIAssistantScreen }))
);
const SettingsScreen = lazy(() =>
  import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))
);

function ScreenLoadingFallback() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent-green)]"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}

function resolveScreenFromHash(hash: string): AppScreenId | null {
  const clean = hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (!clean) return null;
  const validIds: AppScreenId[] = [
    'home',
    'messages',
    'sos',
    'alerts',
    'circles',
    'map',
    'ai',
    'simulator',
    'settings',
    'onboarding',
  ];
  return validIds.includes(clean as AppScreenId) ? (clean as AppScreenId) : null;
}

export default function App() {
  const reducedMotion = useReducedMotion();
  const initMeshApp = useMeshStore((s) => s.initMeshApp);

  const [isPreloading, setIsPreloading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      setDiscreteState({ isPreloaderDone: true });
      return false;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDiscreteState({ isPreloaderDone: true });
      return false;
    }
    return true;
  });

  const [activeScreen, setActiveScreen] = useState<AppScreenId>(() => {
    if (typeof window !== 'undefined') {
      return resolveScreenFromHash(window.location.hash) ?? 'home';
    }
    return 'home';
  });

  const theme = useMeshStore((s) => s.theme);
  const setTheme = useMeshStore((s) => s.setTheme);
  const isSaverMode = useMeshStore((s) => s.metrics.powerMode === 'saver');
  const darkSuggestionDismissed = useMeshStore((s) => s.darkSuggestionDismissed);
  const dismissDarkSuggestion = useMeshStore((s) => s.dismissDarkSuggestion);
  const showDarkSuggestion = isSaverMode && theme === 'light' && !darkSuggestionDismissed;
  const [isMuted, setIsMuted] = useState(() => soundEngine.isMuted());

  // Initialize mesh engine, virtual 4-node chain, and Dexie store once on mount
  useEffect(() => {
    void initMeshApp();
  }, [initMeshApp]);

  // Failsafe timer so Preloader never blocks the screen beyond 2.8s
  useEffect(() => {
    if (!isPreloading) return;
    const timer = window.setTimeout(() => {
      setDiscreteState({ isPreloaderDone: true });
      setIsPreloading(false);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [isPreloading]);

  useEffect(() => soundEngine.subscribe(() => setIsMuted(soundEngine.isMuted())), []);

  // Sync Hash Routing (#/home, #/messages, #/sos, #/alerts, #/circles, #/map, #/simulator, #/ai, #/settings)
  useEffect(() => {
    const onHashChange = () => {
      const target = resolveScreenFromHash(window.location.hash);
      if (target) {
        setActiveScreen(target);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleNavigate = (screen: AppScreenId) => {
    setActiveScreen(screen);
    if (typeof window !== 'undefined') {
      const tab = MOBILE_TABS.find((t) => t.id === screen);
      const nextHash = tab ? `#${tab.path}` : `#/${screen}`;
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Instant theme switch — no View Transition / clip-path animation.
  const handleToggleTheme = (nextTheme: ThemeMode) => setTheme(nextTheme);

  return (
    <div className="relative min-h-screen w-full bg-[var(--bg)] text-[var(--fg)] transition-colors duration-500">
      {/* SCENE 0: Splash Preloader ("i'm sanket setu") */}
      {isPreloading && (
        <Preloader
          reducedMotion={reducedMotion}
          onComplete={() => setIsPreloading(false)}
        />
      )}

      {/* Subtle Full-Page Multiply Film Grain & Faint 1px Structural Grid */}
      <Grain />

      {/* Top Status & Theme Bar */}
      <TopBar
        activeScreen={activeScreen}
        onNavigate={handleNavigate}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        isMuted={isMuted}
        onToggleMute={() => soundEngine.toggleMute()}
      />

      {showDarkSuggestion && (
        <div
          role="status"
          className="mx-auto mt-2 flex w-[calc(100%-32px)] max-w-3xl flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--warn-tint)] px-4 py-3"
        >
          <span className="text-sm font-medium text-[var(--warn-ink)]">
            Battery saver is on. Dark mode can save power on OLED screens.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className="min-h-[44px] rounded-full bg-[var(--fg)] px-4 text-sm font-semibold text-[var(--bg)]"
            >
              Use dark mode
            </button>
            <button
              type="button"
              onClick={dismissDarkSuggestion}
              className="min-h-[44px] rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--fg)]"
            >
              Not now
            </button>
          </span>
        </div>
      )}

      {/* Active Screen Content */}
      <main className="relative z-10 w-full">
        <Suspense fallback={<ScreenLoadingFallback />}>
          {activeScreen === 'home' && (
            <HomeScreen
              theme={theme}
              reducedMotion={reducedMotion}
              onNavigate={handleNavigate}
            />
          )}
          {activeScreen === 'onboarding' && (
            <OnboardingScreen onCompleteNavigate={handleNavigate} />
          )}
          {activeScreen === 'messages' && <MessagesScreen />}
          {activeScreen === 'sos' && (
            <SOSComposerScreen onNavigate={handleNavigate} />
          )}
          {activeScreen === 'alerts' && (
            <AlertsFeedScreen onNavigate={handleNavigate} />
          )}
          {activeScreen === 'circles' && (
            <CirclesSafetyScreen onNavigate={handleNavigate} />
          )}
          {activeScreen === 'map' && (
            <MeshMapScreen onNavigate={handleNavigate} />
          )}
          {activeScreen === 'simulator' && <SimulatorScreen />}
          {activeScreen === 'ai' && <AIAssistantScreen />}
          {activeScreen === 'settings' && <SettingsScreen />}
        </Suspense>
      </main>

      {/* Bottom-Right Rotating Circular Badge */}
      <CircularText reducedMotion={reducedMotion} />

      {/* Thumb-Reachable Floating Bottom Tab Pill Navigation */}
      <BottomPillNav
        activeScreen={activeScreen}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
