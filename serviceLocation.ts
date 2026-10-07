export type MapPoint = { lat: number; lng: number };
function coordinate(value: unknown, limit: number): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value))) return;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : undefined;
}
export function servicePoint(lat: unknown, lng: unknown): MapPoint | undefined {
  const latitude = coordinate(lat, 90), longitude = coordinate(lng, 180);
  return latitude !== undefined && longitude !== undefined ? { lat: latitude, lng: longitude } : undefined;
}
export function mappedService(product: any): boolean {
  return Boolean(product && (product.isService || product.serviceCategory || String(product.category || '').toLowerCase().includes('service')) && ['fixed', 'hybrid'].includes(product.serviceLocationMode) && product.isAvailable !== false && Number(product.stockQuantity) > 0 && product.storeId && servicePoint(product.lat, product.lng));
}
export function distanceKm(a: MapPoint, b: MapPoint) {
  const rad = (d: number) => d * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function serviceDirections(destination: MapPoint, origin?: MapPoint, waypoint?: MapPoint): string {
  if (!servicePoint(destination.lat, destination.lng) || origin && !servicePoint(origin.lat, origin.lng) || waypoint && !servicePoint(waypoint.lat, waypoint.lng)) throw new Error('Invalid directions coordinates');
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1'); url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  if (origin) url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  if (waypoint) url.searchParams.set('waypoints', `${waypoint.lat},${waypoint.lng}`);
  return url.toString();
}
