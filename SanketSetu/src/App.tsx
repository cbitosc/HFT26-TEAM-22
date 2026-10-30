/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { AppScreenId, MOBILE_TABS } from './content';
import { useReducedMotion } from './hooks/useReducedMotion';
import { Skeleton } from './ui/Skeleton';
import { Splash } from './ui/Splash';
import { PinUnlockScreen } from './screens/PinUnlockScreen';
import { TopBar } from './app/TopBar';
import { BottomPillNav } from './app/BottomPillNav';
import { useMeshStore } from './store/useMeshStore';
import { Button } from './ui/Button';

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
const MeshQualityScreen = lazy(() =>
  import('./screens/MeshQualityScreen').then((m) => ({ default: m.MeshQualityScreen }))
);
const SettingsScreen = lazy(() =>
  import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))
);

function ScreenLoadingFallback() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-4" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
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
    'quality',
    'settings',
    'onboarding',
  ];
  return validIds.includes(clean as AppScreenId) ? (clean as AppScreenId) : null;
}

export default function App() {
  const reducedMotion = useReducedMotion();
  const initMeshApp = useMeshStore((s) => s.initMeshApp);

  const [activeScreen, setActiveScreen] = useState<AppScreenId>(() => {
    if (typeof window !== 'undefined') {
      return resolveScreenFromHash(window.location.hash) ?? 'home';
    }
    return 'home';
  });

  const [splashDone, setSplashDone] = useState(false);
  const locked = useMeshStore((s) => s.locked);
  const initReady = useMeshStore((s) => s.initReady);
  const onboardingDone = useMeshStore((s) => s.onboardingDone);
  const theme = useMeshStore((s) => s.theme);
  const setTheme = useMeshStore((s) => s.setTheme);
  const isSaverMode = useMeshStore((s) => s.metrics.powerMode === 'saver');
  const darkSuggestionDismissed = useMeshStore((s) => s.darkSuggestionDismissed);
  const dismissDarkSuggestion = useMeshStore((s) => s.dismissDarkSuggestion);
  const permissionState = useMeshStore((s) => s.permissionState);
  const openAppSettings = useMeshStore((s) => s.openAppSettings);
  const showDarkSuggestion = isSaverMode && theme === 'light' && !darkSuggestionDismissed;

  // Initialize mesh engine, virtual 4-node chain, and Dexie store once on mount
  useEffect(() => {
    void initMeshApp();
  }, [initMeshApp]);

  // Hash routing (#/, #/messages, #/sos, #/alerts, #/circles, #/map, #/simulator, #/ai, #/settings)
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
      window.scrollTo({ top: 0 });
    }
  };

  if (!splashDone) {
    return <Splash onDone={() => setSplashDone(true)} />;
  }
  if (locked) {
    return <PinUnlockScreen />;
  }
  // First run: onboarding is the whole screen (no nav) until setup is finished.
  if (initReady && !onboardingDone) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--fg)]">
        <Suspense fallback={<ScreenLoadingFallback />}>
          <OnboardingScreen onCompleteNavigate={handleNavigate} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[var(--bg)] text-[var(--fg)]">
      <TopBar onNavigate={handleNavigate} />

      {permissionState && !permissionState.allGranted && (
        <div role="alert" className="mx-auto flex w-full flex-wrap items-center justify-between gap-2 border-b border-[var(--warn-ink)]/30 bg-[var(--warn-tint)] px-4 py-2.5">
          <p className="text-sm font-semibold text-[var(--warn-ink)]">Nearby permissions are off. The app can still show the simulator, but real radio connections are unavailable.</p>
          <Button type="button" tone="neutral" onClick={() => void openAppSettings()} className="min-h-12">Open settings</Button>
        </div>
      )}

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
              className="min-h-[48px] rounded-full bg-[var(--fg)] px-4 text-sm font-semibold text-[var(--bg)]"
            >
              Use dark mode
            </button>
            <button
              type="button"
              onClick={dismissDarkSuggestion}
              className="min-h-[48px] rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--fg)]"
            >
              Not now
            </button>
          </span>
        </div>
      )}

      {/* Bottom padding = nav height + safe-area inset + breathing room, so the fixed nav never covers content. */}
      <main
        className="relative w-full"
        style={{ paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + 24px)' }}
      >
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
          {activeScreen === 'quality' && <MeshQualityScreen />}
          {activeScreen === 'ai' && <AIAssistantScreen />}
          {activeScreen === 'settings' && <SettingsScreen />}
        </Suspense>
      </main>

      <BottomPillNav activeScreen={activeScreen} onNavigate={handleNavigate} />
    </div>
  );
}
