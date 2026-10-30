/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AppScreenId, MOBILE_TABS } from './content';
import { useReducedMotion } from './hooks/useReducedMotion';
import { soundEngine } from './lib/audio';
import {
  scrollState,
  setDiscreteState,
  setThemePreference,
  subscribeScrollStore,
  ThemeMode,
} from './lib/scroll';

import { Preloader } from './scenes/Preloader';
import { Grain } from './components/Grain';
import { CircularText } from './components/CircularText';
import { TopBar } from './app/TopBar';
import { BottomPillNav } from './app/BottomPillNav';

import { HomeScreen } from './screens/HomeScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { SOSComposerScreen } from './screens/SOSComposerScreen';
import { AlertsFeedScreen } from './screens/AlertsFeedScreen';
import { CirclesSafetyScreen } from './screens/CirclesSafetyScreen';
import { MeshMapScreen } from './screens/MeshMapScreen';
import { SimulatorScreen } from './screens/SimulatorScreen';
import { AIAssistantScreen } from './screens/AIAssistantScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useMeshStore } from './store/useMeshStore';

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

  const [uiState, setUiState] = useState<{
    theme: ThemeMode;
    isMuted: boolean;
  }>(() => ({
    theme: scrollState.theme,
    isMuted: scrollState.isMuted,
  }));

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

  // Subscribe to theme & mute state
  useEffect(() => {
    return subscribeScrollStore(() => {
      setUiState({
        theme: scrollState.theme,
        isMuted: scrollState.isMuted,
      });
    });
  }, []);

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

  const handleToggleTheme = (
    nextTheme: ThemeMode,
    ev?: React.MouseEvent
  ) => {
    const apply = () => setThemePreference(nextTheme);
    const docWithVt = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };

    if (
      !reducedMotion &&
      typeof docWithVt.startViewTransition === 'function' &&
      ev
    ) {
      const x = ev.clientX;
      const y = ev.clientY;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );
      const vt = docWithVt.startViewTransition(() => {
        apply();
      });
      vt.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endRadius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 450,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              pseudoElement: '::view-transition-new(root)',
            }
          );
        })
        .catch(() => {
          // fallback already applied
        });
    } else {
      apply();
    }
  };

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
        theme={uiState.theme}
        onToggleTheme={handleToggleTheme}
        isMuted={uiState.isMuted}
        onToggleMute={() => soundEngine.toggleMute()}
      />

      {/* Active Screen Content */}
      <main className="relative z-10 w-full">
        {activeScreen === 'home' && (
          <HomeScreen
            theme={uiState.theme}
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
