/**
 * Theme application (src/ui/theme.ts). Light is the default and is never overridden by the
 * system dark setting; dark is an explicit opt-in from Settings. The choice is persisted in the
 * Dexie kv table by the store; it is also mirrored to localStorage purely so the very first
 * paint (before IndexedDB is readable) uses the right theme without a flash.
 */

export type ThemeMode = 'light' | 'dark';

const LOCAL_MIRROR_KEY = 'sanket-theme';
const THEME_COLOR: Record<ThemeMode, string> = {
  light: '#F7F8FA',
  dark: '#0F1115',
};

export function readInitialTheme(): ThemeMode {
  try {
    return localStorage.getItem(LOCAL_MIRROR_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.style.colorScheme = mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[mode]);
  try {
    localStorage.setItem(LOCAL_MIRROR_KEY, mode);
  } catch {
    // Storage blocked — theme still applies for this session.
  }
}
