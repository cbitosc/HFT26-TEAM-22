/**
 * Real device location (src/lib/location.ts) via the WebView's geolocation (Android prompts for the
 * location permission itself). Returns null when unavailable, denied, or too slow; callers must then
 * send the SOS WITHOUT coordinates rather than substituting a made-up position.
 */

export interface GeoFix {
  lat: number;
  lng: number;
  accuracyMeters: number;
}

export function getCurrentFix(timeoutMs = 8000): Promise<GeoFix | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (v: GeoFix | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const timer = setTimeout(() => done(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: Math.round(pos.coords.accuracy),
        });
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
}
