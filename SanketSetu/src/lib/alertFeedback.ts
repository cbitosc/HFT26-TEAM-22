/**
 * Incoming-alert feedback (src/lib/alertFeedback.ts): vibration, an alarm tone that ignores the
 * "sounds" setting (an SOS must never be silent by accident), and a native high-priority
 * notification when the app is not on screen. Pure side effects; each is best effort.
 */

import { Capacitor } from '@capacitor/core';
import { SOS_CATEGORIES } from '../content';
import { NearbyMeshNative } from '../transport/NearbyTransport';
import { soundEngine } from './audio';
import type { StoredSOSAlert } from '../mesh/types';

export function categoryLabel(id: string): string {
  const label = SOS_CATEGORIES.find((c) => c.id === id)?.label ?? id;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function hopsLabel(hops: number): string {
  if (hops <= 1) return 'Connected directly';
  const via = hops - 1;
  return `Passed along by ${via} phone${via === 1 ? '' : 's'}`;
}

/** Plain-language location line for an alert, or null when none was shared. */
export function alertLocationLabel(a: StoredSOSAlert): string | null {
  if (a.unsealedPreciseLocation) {
    const p = a.unsealedPreciseLocation;
    return `Exact location: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} (within ${Math.round(p.accuracyMeters)} m)`;
  }
  if (a.locationPrecision !== 'disabled' && a.lat !== undefined && a.lng !== undefined) {
    return `Approximate area: ${a.lat.toFixed(2)}, ${a.lng.toFixed(2)}`;
  }
  return null;
}

export function alertIncoming(alert: StoredSOSAlert): void {
  try {
    navigator.vibrate?.([600, 200, 600, 200, 900]);
  } catch {
    // vibration unsupported
  }
  try {
    soundEngine.playIncomingAlarm();
  } catch {
    // audio blocked until first user gesture
  }
  if (Capacitor.isNativePlatform()) {
    void NearbyMeshNative.showAlertNotification({
      id: alert.id,
      title: `SOS: ${categoryLabel(alert.category)}`,
      body: `${alert.senderName} needs help. ${hopsLabel(alert.hops)}.`,
    }).catch(() => undefined);
  }
}
