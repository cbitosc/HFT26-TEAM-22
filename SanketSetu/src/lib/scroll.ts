/**
 * Global Zustand-free Scroll, Pointer & Section-State Store (src/lib/scroll.ts)
 * -----------------------------------------------------------------------------
 * Plain module store read directly inside Three.js useFrame without causing
 * React re-renders at 60fps, plus lightweight pub/sub for discrete UI state.
 */

import { AllSectionId, StorySectionId } from '../content';
export type { AllSectionId, StorySectionId };

export type ViewMode = 'spiral' | 'list';
export type ThemeMode = 'light' | 'dark';
export type OrbExpression = 'neutral' | 'worried' | 'thinking' | 'happy';
export type DemoStatus = 'idle' | 'running' | 'success' | 'error';

export interface SceneWeights {
  scene1Orb: number;
  scene2Spiral: number;
  scene3Hero: number;
  scene4Stats: number;
  scene5Outro: number;
  activeScene: 1 | 2 | 3 | 4 | 5;
  heroBeatIndex: 0 | 1 | 2 | 3;
  heroLocalProgress: number;
  spiralLocalProgress: number;
}

export interface OrbGuideTarget {
  x: number;
  y: number;
  z: number;
  scale: number;
  expression: OrbExpression;
  ringSpeed: number;
}

export interface ScrollStoreState {
  // Continuous values (read inside useFrame)
  progress: number; // 0..1 overall page scroll
  dampedProgress: number; // 0..1 exponentially damped inside useFrame
  velocity: number; // normalized scroll velocity (-1..1)
  dampedVelocity: number;
  direction: 1 | -1;
  pointerX: number; // -1..1
  pointerY: number; // -1..1
  dampedPointerX: number;
  dampedPointerY: number;

  // Section-specific continuous progress values
  problemOrderProgress: number; // 0 (chaos) .. 1 (clean stack)
  pipelineProgress: number; // 0..1 across the 4-step pinned pipeline
  useCasesProgress: number; // 0..1 across the pinned 8-scenario Use Cases spiral
  showcaseSpiralWeight: number; // 0..1 visibility of 3D spiral gallery
  showcaseHeroWeight: number; // 0..1 visibility of 3D unfolding object
  showcaseHeroLocal: number; // 0..1 unfold progress of 3D hero object
  showcaseStatsWeight: number; // 0..1 visibility of 3D orbiting stats shapes

  // Master timeline normalized scene weights
  tlOrbExit: number;
  tlSpiralProgress: number;
  tlHeroProgress: number;
  tlStatsProgress: number;
  tlOutroProgress: number;

  // Discrete interactive states (notify UI subscribers)
  isPreloaderDone: boolean;
  hasScrolled: boolean;
  viewMode: ViewMode;
  theme: ThemeMode;
  selectedProjectId: string | null;
  hoveredProjectId: string | null;
  isMenuOpen: boolean;
  isMuted: boolean;
  activeScene: 1 | 2 | 3 | 4 | 5;
  activeSectionId: AllSectionId;
  orbExpression: OrbExpression;
  demoStatus: DemoStatus;
  pipelineStepIndex: 0 | 1 | 2 | 3;
  heroBeatIndex: 0 | 1 | 2 | 3;
}

const THEME_STORAGE_KEY = 'nova-theme-preference';

export function resolveInitialTheme(): ThemeMode {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 'light';
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
      return stored;
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial: ThemeMode = prefersDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', initial);
  return initial;
}

export const scrollState: ScrollStoreState = {
  progress: 0,
  dampedProgress: 0,
  velocity: 0,
  dampedVelocity: 0,
  direction: 1,
  pointerX: 0,
  pointerY: 0,
  dampedPointerX: 0,
  dampedPointerY: 0,

  problemOrderProgress: 0,
  pipelineProgress: 0,
  useCasesProgress: 0,
  showcaseSpiralWeight: 0,
  showcaseHeroWeight: 0,
  showcaseHeroLocal: 0.65,
  showcaseStatsWeight: 0,

  tlOrbExit: 0,
  tlSpiralProgress: 0,
  tlHeroProgress: 0,
  tlStatsProgress: 0,
  tlOutroProgress: 0,

  isPreloaderDone: false,
  hasScrolled: false,
  viewMode: 'spiral',
  theme: resolveInitialTheme(),
  selectedProjectId: 'incident-triage',
  hoveredProjectId: null,
  isMenuOpen: false,
  isMuted: true,
  activeScene: 1,
  activeSectionId: 'home',
  orbExpression: 'neutral',
  demoStatus: 'idle',
  pipelineStepIndex: 0,
  heroBeatIndex: 0,
};

export function setThemePreference(nextTheme: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', nextTheme);
  }
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    }
  } catch {
    // Ignore localStorage restrictions
  }
  setDiscreteState({ theme: nextTheme });
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeScrollStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyScrollStore(): void {
  listeners.forEach((l) => l());
}

export function setDiscreteState(partial: Partial<ScrollStoreState>): void {
  let changed = false;
  for (const key of Object.keys(partial) as (keyof ScrollStoreState)[]) {
    if (scrollState[key] !== partial[key]) {
      // @ts-expect-error dynamic assignment
      scrollState[key] = partial[key];
      changed = true;
    }
  }
  if (changed) {
    notifyScrollStore();
  }
}

/**
 * Pure frame-rate independent exponential damping (matches THREE.MathUtils.damp)
 */
export function dampValue(
  current: number,
  target: number,
  lambda: number,
  dt: number
): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(edge1 - edge0, 0.0001));
  return t * t * (3 - 2 * t);
}

/**
 * Computes the persistent 3D Glass Orb's target position, scale, face expression,
 * and ring rotation speed for the active product-story section.
 */
export function computeOrbGuideState(
  sectionId: AllSectionId,
  pipelineProgress: number,
  problemOrderProgress: number,
  demoStatus: DemoStatus,
  isMobile = false
): OrbGuideTarget {
  const mobileScale = isMobile ? 0.72 : 1;

  switch (sectionId) {
    case 'home':
      return {
        x: 0,
        y: -0.05,
        z: 0,
        scale: 0.84 * mobileScale,
        expression: 'neutral',
        ringSpeed: 0.5,
      };

    case 'problem': {
      const isRelieved = problemOrderProgress >= 0.55;
      return {
        x: isMobile ? 1.25 : 2.85,
        y: 1.28,
        z: -1.15,
        scale: 0.30 * mobileScale,
        expression: isRelieved ? 'happy' : 'worried',
        ringSpeed: isRelieved ? 0.6 : 1.45,
      };
    }

    case 'how-it-works': {
      const p = clamp01(pipelineProgress);
      const travelX = isMobile ? 1.25 : -2.9 + p * 0.35;
      return {
        x: Number(travelX.toFixed(3)),
        y: isMobile ? 1.28 : 1.32,
        z: -1.2,
        scale: 0.28 * mobileScale,
        expression: p > 0.75 ? 'happy' : 'thinking',
        ringSpeed: 1.35 + p * 0.8,
      };
    }

    case 'intelligence':
      return {
        x: isMobile ? -1.25 : 2.85,
        y: 1.28,
        z: -1.15,
        scale: 0.30 * mobileScale,
        expression: 'thinking',
        ringSpeed: 1.65,
      };

    case 'technology':
      return {
        x: isMobile ? 1.25 : -2.85,
        y: 1.28,
        z: -1.15,
        scale: 0.30 * mobileScale,
        expression: 'neutral',
        ringSpeed: 1.1,
      };

    case 'use-cases':
      // Orb slot: "corner-small" at top-right of the header area, >= 24px clearance from cards
      return {
        x: isMobile ? 1.35 : 3.05,
        y: isMobile ? 1.36 : 1.38,
        z: -1.35,
        scale: 0.24 * mobileScale,
        expression: 'happy',
        ringSpeed: 1.15,
      };

    case 'live-demo': {
      let expr: OrbExpression = 'neutral';
      let speed = 0.75;
      if (demoStatus === 'running') {
        expr = 'thinking';
        speed = 3.8;
      } else if (demoStatus === 'success') {
        expr = 'happy';
        speed = 1.25;
      } else if (demoStatus === 'error') {
        expr = 'worried';
        speed = 0.35;
      }
      return {
        x: isMobile ? 1.25 : 2.85,
        y: 1.28,
        z: -1.15,
        scale: 0.30 * mobileScale,
        expression: expr,
        ringSpeed: speed,
      };
    }

    case 'outro':
    default:
      return {
        x: 0,
        y: 0.02,
        z: 0,
        scale: 0.82 * mobileScale,
        expression: 'happy',
        ringSpeed: 0.65,
      };
  }
}

/**
 * Returns the harmonious background tint color for the active section
 * (all light in default light mode, culminating in the dark finale).
 */
export function getSectionTintHex(
  sectionId: AllSectionId,
  theme: ThemeMode
): string {
  if (sectionId === 'outro') {
    return '#0A0A0A';
  }
  if (theme === 'dark') {
    switch (sectionId) {
      case 'home':
        return '#0a0a0a';
      case 'problem':
        return '#110d18';
      case 'how-it-works':
        return '#0d130a';
      case 'intelligence':
        return '#0a1018';
      case 'technology':
        return '#0e0e12';
      case 'use-cases':
        return '#0c0d14';
      case 'live-demo':
        return '#0c0e10';
      default:
        return '#0a0a0a';
    }
  }

  // Light theme harmonious section tints
  switch (sectionId) {
    case 'home':
      return '#F6F4EF'; // Warm off-white
    case 'problem':
      return '#F2EEFA'; // Pale lilac
    case 'how-it-works':
      return '#F1F6E6'; // Pale lime
    case 'intelligence':
      return '#ECF2FA'; // Pale blue
    case 'technology':
      return '#FFFFFF'; // Crisp white
    case 'use-cases':
      return '#F6F4EF'; // Warm editorial ivory
    case 'live-demo':
      return '#F5F3EC'; // Warm studio stone
    default:
      return '#F6F4EF';
  }
}

/**
 * Pure computation of scene weights and sub-progresses from normalized scroll (0..1).
 */
export function getSceneWeights(progress: number): SceneWeights {
  const p = clamp01(progress);

  const scene1Orb = 1 - smoothstep(0.11, 0.17, p);
  const scene2Spiral =
    smoothstep(0.12, 0.18, p) * (1 - smoothstep(0.41, 0.47, p));
  const scene3Hero =
    smoothstep(0.42, 0.48, p) * (1 - smoothstep(0.70, 0.75, p));
  const scene4Stats =
    smoothstep(0.71, 0.76, p) * (1 - smoothstep(0.86, 0.90, p));
  const scene5Outro = smoothstep(0.86, 0.92, p);

  const spiralLocalProgress = clamp01((p - 0.15) / (0.44 - 0.15));
  const heroLocalProgress = clamp01((p - 0.45) / (0.72 - 0.45));

  let heroBeatIndex: 0 | 1 | 2 | 3 = 0;
  if (heroLocalProgress >= 0.75) heroBeatIndex = 3;
  else if (heroLocalProgress >= 0.5) heroBeatIndex = 2;
  else if (heroLocalProgress >= 0.25) heroBeatIndex = 1;

  let activeScene: 1 | 2 | 3 | 4 | 5 = 1;
  if (p >= 0.88) activeScene = 5;
  else if (p >= 0.73) activeScene = 4;
  else if (p >= 0.45) activeScene = 3;
  else if (p >= 0.15) activeScene = 2;

  return {
    scene1Orb,
    scene2Spiral,
    scene3Hero,
    scene4Stats,
    scene5Outro,
    activeScene,
    heroBeatIndex,
    heroLocalProgress,
    spiralLocalProgress,
  };
}

/**
 * Computes target 3D position, rotation, curvature bend, and backface alpha
 * for a scenario card plane in the 06 USE CASES section.
 *
 * - Keeps every plane oriented toward the camera (rotY clamped to [-0.46, 0.46])
 *   so THREE.FrontSide never shows a mirrored backface.
 * - Fits the active cluster cleanly in the middle stage between the top
 *   header/toggle and the bottom detail dock.
 * - Fades cards on the back of the helix smoothly via backAlpha.
 */
export function computeSpiralCardTransform(
  index: number,
  total: number,
  spiralScrollProgress: number,
  listBlend: number,
  radius = 2.05,
  verticalSpacing = 0.26,
  angleStep = 0.78
): {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  bend: number;
  backAlpha: number;
} {
  const safeTotal = Math.max(1, total);
  const scrollIndexOffset = clamp01(spiralScrollProgress) * Math.max(0, safeTotal - 1);
  const relIndex = index - scrollIndexOffset;

  const theta = relIndex * angleStep;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  // Center the active cluster at y = -0.10 so it sits cleanly between header/toggle and bottom dock
  const spiralX = sinTheta * radius;
  const spiralZ = cosTheta * 1.35 - 0.55;
  const spiralY = -0.10 - relIndex * verticalSpacing;

  // Keep front face oriented toward camera (-0.42..0.42 rad) so text is always readable left-to-right
  const spiralRotY = -sinTheta * 0.36;
  const spiralRotZ = -relIndex * 0.018;

  // Cards on the far side of the helix (cosTheta < 0) fade smoothly
  const spiralBackAlpha = clamp01(0.22 + (cosTheta + 1) * 0.45);

  // List mode: clean background cascade behind the interactive DOM list
  const listX = (index % 2 === 0 ? -1 : 1) * 1.65;
  const listY = 0.1 - relIndex * 0.45;
  const listZ = -1.1;
  const listRotY = (index % 2 === 0 ? 1 : -1) * 0.08;

  const x = spiralX + (listX - spiralX) * listBlend;
  const y = spiralY + (listY - spiralY) * listBlend;
  const z = spiralZ + (listZ - spiralZ) * listBlend;
  const rotY = spiralRotY + (listRotY - spiralRotY) * listBlend;
  const rotZ = spiralRotZ * (1 - listBlend);
  const bend = (1 - listBlend) * 0.16;
  const backAlpha = spiralBackAlpha * (1 - listBlend * 0.65);

  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    z: Number(z.toFixed(4)),
    rotX: 0,
    rotY: Number(rotY.toFixed(4)),
    rotZ: Number(rotZ.toFixed(4)),
    bend: Number(bend.toFixed(4)),
    backAlpha: Number(backAlpha.toFixed(4)),
  };
}

/**
 * Computes the unfolding hinge angle and object orientation for Scene 3's Hero 3D Object.
 */
export function computeHeroUnfoldState(localProgress: number): {
  entryY: number;
  tiltX: number;
  rotateY: number;
  hingeAngleRad: number;
  innerGlowIntensity: number;
} {
  const p = clamp01(localProgress);
  const entryT = smoothstep(0.0, 0.28, p);
  const unfoldT = smoothstep(0.18, 0.82, p);

  const entryY = (1 - entryT) * 2.2;
  const tiltX = 0.48 - unfoldT * 0.08;
  const rotateY = -0.32 + p * 0.56;
  const hingeAngleRad = unfoldT * 2.58;
  const innerGlowIntensity = smoothstep(0.25, 0.75, p);

  return {
    entryY: Number(entryY.toFixed(4)),
    tiltX: Number(tiltX.toFixed(4)),
    rotateY: Number(rotateY.toFixed(4)),
    hingeAngleRad: Number(hingeAngleRad.toFixed(4)),
    innerGlowIntensity: Number(innerGlowIntensity.toFixed(4)),
  };
}

/**
 * Reads CSS variables from :root so 3D materials mirror src/index.css automatically.
 */
export function readCssThemePalette() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      bg: '#F6F4EF',
      fg: '#0B0B0B',
      muted: '#6B6B66',
      green: '#C6FF3D',
      lilac: '#B79CFF',
      blue: '#2D5BFF',
      coral: '#FF6A4D',
    };
  }
  const style = getComputedStyle(document.documentElement);
  return {
    bg: style.getPropertyValue('--bg').trim() || '#F6F4EF',
    fg: style.getPropertyValue('--fg').trim() || '#0B0B0B',
    muted: style.getPropertyValue('--muted').trim() || '#6B6B66',
    green:
      style.getPropertyValue('--accent').trim() ||
      style.getPropertyValue('--accent-green').trim() ||
      '#C6FF3D',
    lilac:
      style.getPropertyValue('--accent-2').trim() ||
      style.getPropertyValue('--accent-lilac').trim() ||
      '#B79CFF',
    blue:
      style.getPropertyValue('--accent-3').trim() ||
      style.getPropertyValue('--accent-blue').trim() ||
      '#2D5BFF',
    coral:
      style.getPropertyValue('--accent-4').trim() ||
      style.getPropertyValue('--accent-coral').trim() ||
      '#FF6A4D',
  };
}
