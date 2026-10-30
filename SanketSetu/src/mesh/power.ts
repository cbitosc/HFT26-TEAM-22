/**
 * Battery Efficiency & Adaptive Discovery Controller (src/mesh/power.ts)
 * Per §6:
 * - Three power modes:
 *   1. Active (continuous discovery, 100% duty cycle)
 *   2. Balanced (duty-cycled: 10s scan / 20s sleep, adaptive)
 *   3. Saver (long sleep: 5s scan / 45s sleep, wake on user action or incoming SOS)
 * - Auto-switch by battery level: <30% -> Balanced, <15% -> Saver.
 * - Adaptive discovery: more peers nearby -> reduce scan frequency; no peers -> exponential backoff.
 * - UI/rendering battery: WebGL orb throttles DPR/FPS in Balanced and swaps to static CSS orb in Saver
 *   or when not on the Home screen.
 */

import { PowerMode } from './types';

export interface PowerScheduleConfig {
  mode: PowerMode;
  scanWindowMs: number;
  sleepWindowMs: number;
  dutyCyclePct: number;
  relayOnlyEmergency: boolean;
  orbRenderPolicy: {
    pauseWebGL: boolean;
    maxDpr: number;
    targetFps: 60 | 30 | 0;
  };
}

/**
 * Determines the recommended power mode based on battery percentage and charging state.
 */
export function resolveAutoPowerMode(
  batteryPct: number,
  isCharging: boolean,
  userPreferredMode: PowerMode
): PowerMode {
  if (isCharging) {
    return userPreferredMode;
  }
  if (batteryPct < 15) {
    return 'saver';
  }
  if (batteryPct < 30 && userPreferredMode === 'active') {
    return 'balanced';
  }
  return userPreferredMode;
}

/**
 * Computes scan/sleep windows and WebGL rendering budget for the active power mode and peer count.
 */
export function computePowerSchedule(
  mode: PowerMode,
  batteryPct: number,
  connectedPeerCount: number,
  consecutiveEmptyScans = 0
): PowerScheduleConfig {
  if (mode === 'saver' || batteryPct < 15) {
    return {
      mode: 'saver',
      scanWindowMs: 5000,
      sleepWindowMs: 45000,
      dutyCyclePct: 10,
      relayOnlyEmergency: true,
      orbRenderPolicy: {
        pauseWebGL: true,
        maxDpr: 1.0,
        targetFps: 0,
      },
    };
  }

  if (mode === 'balanced' || batteryPct < 30) {
    // Adaptive adjustment: if many peers already connected or repeated empty scans, stretch sleep window
    const backoffMultiplier =
      connectedPeerCount >= 3
        ? 1.5
        : Math.min(2.5, Math.pow(1.25, Math.min(consecutiveEmptyScans, 4)));
    const scanWindowMs = 10000;
    const sleepWindowMs = Math.round(20000 * backoffMultiplier);
    const dutyCyclePct = Math.round(
      (scanWindowMs / (scanWindowMs + sleepWindowMs)) * 100
    );

    return {
      mode: 'balanced',
      scanWindowMs,
      sleepWindowMs,
      dutyCyclePct,
      relayOnlyEmergency: false,
      orbRenderPolicy: {
        pauseWebGL: false,
        maxDpr: 1.25,
        targetFps: 30,
      },
    };
  }

  // Active mode
  return {
    mode: 'active',
    scanWindowMs: 30000,
    sleepWindowMs: 0,
    dutyCyclePct: 100,
    relayOnlyEmergency: false,
    orbRenderPolicy: {
      pauseWebGL: false,
      maxDpr: 1.6,
      targetFps: 60,
    },
  };
}
