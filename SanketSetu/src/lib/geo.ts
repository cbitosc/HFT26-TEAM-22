/** Small geo helpers (src/lib/geo.ts). Pure functions so they run under node:test. */

export const INCIDENT_CLUSTER_RADIUS_M = 200;

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when both points exist and are within `radiusM` of each other. */
export function withinRadius(
  a: { lat?: number; lng?: number },
  b: { lat?: number; lng?: number },
  radiusM = INCIDENT_CLUSTER_RADIUS_M
): boolean {
  if (a.lat === undefined || a.lng === undefined || b.lat === undefined || b.lng === undefined) {
    return false;
  }
  return distanceMeters(a.lat, a.lng, b.lat, b.lng) <= radiusM;
}
