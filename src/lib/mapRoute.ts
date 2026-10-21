import { distanceKm, servicePoint, type MapPoint } from '../../serviceLocation';

export type RouteMode = 'walking' | 'driving';
export type MapRouteStep = {
  instruction: string;
  startIndex: number;
  endIndex: number;
  distanceMeters: number;
  durationSeconds: number;
};
export type MapRoute = {
  origin: MapPoint;
  destination: MapPoint;
  mode: RouteMode;
  points: MapPoint[];
  cumulativeMeters: number[];
  distanceMeters: number;
  durationSeconds: number;
  steps: MapRouteStep[];
};
export type MapRouteProgress = {
  snappedPoint: MapPoint;
  segmentIndex: number;
  remainingPoints: MapPoint[];
  distanceFromRouteMeters: number;
  travelledMeters: number;
  remainingMeters: number;
  remainingSeconds: number;
  nextStep: MapRouteStep;
  metersToNextStep: number;
  offRoute: boolean;
  arrived: boolean;
  reliableLocation: boolean;
};

const DEFAULT_ROUTING_URL = 'https://valhalla1.openstreetmap.de/route';
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_POINTS = 40_000;
const MAX_STEPS = 1_000;
const REQUEST_INTERVAL_MS = 1_250;
let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

function invalidRoute(): never {
  throw new Error('The routing service returned an invalid trail. Try another waypoint or open Google Maps.');
}

function boundedNumber(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) invalidRoute();
  return value;
}

function checkedPoint(point: MapPoint): MapPoint {
  const parsed = point && servicePoint(point.lat, point.lng);
  if (!parsed || typeof point.lat !== 'number' || typeof point.lng !== 'number') throw new Error('Choose valid starting and destination points.');
  return parsed;
}

// Valhalla's native JSON format uses six decimal places, unlike Google's polyline5.
export function decodeRoutePolyline(encoded: unknown): MapPoint[] {
  if (typeof encoded !== 'string' || encoded.length < 4 || encoded.length > MAX_RESPONSE_BYTES) invalidRoute();
  let cursor = 0, latitude = 0, longitude = 0;
  const points: MapPoint[] = [];
  const delta = () => {
    let value = 0, shift = 0;
    for (;;) {
      if (cursor >= encoded.length || shift > 30) invalidRoute();
      const digit = encoded.charCodeAt(cursor++) - 63;
      if (digit < 0 || digit > 63) invalidRoute();
      value += (digit & 31) * 2 ** shift;
      if (digit < 32) break;
      shift += 5;
    }
    return value % 2 ? -(value + 1) / 2 : value / 2;
  };
  while (cursor < encoded.length) {
    latitude += delta(); longitude += delta();
    const point = servicePoint(latitude / 1_000_000, longitude / 1_000_000);
    if (!point || points.length >= MAX_POINTS) invalidRoute();
    points.push(point);
  }
  if (points.length < 2) invalidRoute();
  return points;
}

export function parseMapRoute(payload: unknown, origin: MapPoint, destination: MapPoint, mode: RouteMode): MapRoute {
  const start = checkedPoint(origin), finish = checkedPoint(destination);
  if (mode !== 'walking' && mode !== 'driving') throw new Error('Choose walking or driving directions.');
  const trip = (payload as any)?.trip;
  if (!trip || trip.status !== 0 || trip.units !== 'kilometers' || !Array.isArray(trip.legs) || trip.legs.length !== 1) invalidRoute();
  const leg = trip.legs[0], points = decodeRoutePolyline(leg?.shape);
  const distanceMeters = boundedNumber(trip.summary?.length, 2_000) * 1_000;
  const durationSeconds = boundedNumber(trip.summary?.time, 2_000_000);
  // Do not present a route to a distant road as if it reaches the selected pin.
  if (distanceKm(start, points[0]) * 1_000 > 350 || distanceKm(finish, points.at(-1)!) * 1_000 > 350) {
    throw new Error('That point is too far from a mapped road or path. Move the pin closer to an entrance or open Google Maps.');
  }
  const cumulativeMeters = [0];
  for (let index = 1; index < points.length; index++) {
    const segment = distanceKm(points[index - 1], points[index]) * 1_000;
    if (segment > 50_000) invalidRoute();
    cumulativeMeters.push(cumulativeMeters[index - 1] + segment);
  }
  const geometryMeters = cumulativeMeters.at(-1)!;
  if (geometryMeters > 2_000_000 || Math.abs(geometryMeters - distanceMeters) > Math.max(200, distanceMeters * .2)) invalidRoute();
  if (!Array.isArray(leg.maneuvers) || !leg.maneuvers.length || leg.maneuvers.length > MAX_STEPS) invalidRoute();
  let previousEnd = 0;
  const steps: MapRouteStep[] = leg.maneuvers.map((item: any) => {
    const startIndex = boundedNumber(item?.begin_shape_index, points.length - 1);
    const endIndex = boundedNumber(item?.end_shape_index, points.length - 1);
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || endIndex < startIndex || startIndex !== previousEnd) invalidRoute();
    if (typeof item.instruction !== 'string' || !item.instruction.trim() || item.instruction.length > 1_000) invalidRoute();
    if (item.travel_mode !== (mode === 'walking' ? 'pedestrian' : 'drive')) invalidRoute();
    previousEnd = endIndex;
    return {
      instruction: item.instruction.replace(/[\u0000-\u001f\u007f]/g, ' ').trim(),
      startIndex, endIndex,
      distanceMeters: boundedNumber(item.length, 2_000) * 1_000,
      durationSeconds: boundedNumber(item.time, 2_000_000),
    };
  });
  if (steps[0].startIndex !== 0 || steps.at(-1)!.endIndex !== points.length - 1) invalidRoute();
  return { origin: start, destination: finish, mode, points, cumulativeMeters, distanceMeters, durationSeconds, steps };
}

function abortError(): DOMException {
  return new DOMException('Route request cancelled.', 'AbortError');
}

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason || abortError());
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal.reason || abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, milliseconds);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

function routingUrl(): URL {
  // Deployment configuration, never a URL received from a listing or request body.
  const configured = (import.meta as any).env?.VITE_MAP_ROUTING_URL || DEFAULT_ROUTING_URL;
  let url: URL;
  try { url = new URL(configured); } catch { throw new Error('The routing service configuration is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('The routing service must use a secure HTTPS endpoint.');
  return url;
}

async function readRouteResponse(response: Response): Promise<unknown> {
  const announced = response.headers.get('content-length');
  if (announced && Number(announced) > MAX_RESPONSE_BYTES) invalidRoute();
  if (!response.body || !response.headers.get('content-type')?.includes('application/json')) invalidRoute();
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, body = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); invalidRoute(); }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    await reader.cancel().catch(() => {});
    if ((error as Error)?.name === 'AbortError') throw error;
    invalidRoute();
  } finally { reader.releaseLock(); }
}

export async function fetchMapRoute(origin: MapPoint, destination: MapPoint, mode: RouteMode, options: { signal?: AbortSignal } = {}): Promise<MapRoute> {
  const start = checkedPoint(origin), finish = checkedPoint(destination);
  if (mode !== 'walking' && mode !== 'driving') throw new Error('Choose walking or driving directions.');
  if (distanceKm(start, finish) > (mode === 'walking' ? 100 : 1_000)) throw new Error('Choose a nearer waypoint, or use Google Maps for a longer journey.');
  const url = routingUrl();
  url.searchParams.set('json', JSON.stringify({
    locations: [start, finish].map(point => ({ lat: point.lat, lon: point.lng, search_cutoff: 350 })),
    costing: mode === 'walking' ? 'pedestrian' : 'auto', units: 'kilometers', language: 'en-US',
    directions_type: 'instructions', alternates: 0,
  }));
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  const predecessor = requestQueue;
  let release!: () => void;
  const slot = new Promise<void>(resolve => { release = resolve; });
  // An aborted queued request must not let a later request overtake one still in flight.
  requestQueue = predecessor.then(() => slot);
  let abortWaiting: (() => void) | undefined;
  try {
    // Serial requests and cooldown respect the public service's one request/second policy.
    await Promise.race([predecessor, new Promise<never>((_, reject) => {
      if (signal.aborted) reject(signal.reason || abortError());
      else {
        abortWaiting = () => reject(signal.reason || abortError());
        signal.addEventListener('abort', abortWaiting, { once: true });
      }
    })]);
    if (abortWaiting) signal.removeEventListener('abort', abortWaiting);
    await pause(Math.max(0, nextRequestAt - Date.now()), signal);
    if (signal.aborted) throw signal.reason || abortError();
    nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
    const response = await fetch(url, {
      method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error', signal,
      headers: { Accept: 'application/json', 'X-Client-Id': 'pinevela-web' },
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      nextRequestAt = Math.max(nextRequestAt, Date.now() + Math.min(300, Math.max(30, Number.isFinite(retryAfter) ? retryAfter : 30)) * 1_000);
      throw new Error('The routing service is busy. Wait a moment and retry, or open Google Maps.');
    }
    if (!response.ok) throw new Error('A road or walking trail could not be found. Try a nearby entrance or open Google Maps.');
    return parseMapRoute(await readRouteResponse(response), start, finish, mode);
  } catch (error) {
    if (options.signal?.aborted) throw abortError();
    if (signal.aborted) throw new Error('Finding a trail took too long. Retry or open Google Maps.');
    if (error instanceof TypeError) throw new Error('The routing service could not be reached. Check your connection or open Google Maps.');
    throw error;
  } finally {
    if (abortWaiting) signal.removeEventListener('abort', abortWaiting);
    release();
  }
}

function wrappedLongitude(delta: number): number {
  return ((delta + 540) % 360) - 180;
}

export function routeProgress(route: MapRoute, position: MapPoint, accuracy?: number): MapRouteProgress {
  const point = checkedPoint(position);
  const radians = Math.PI / 180, metersPerDegree = 6_371_000 * radians;
  const longitudeScale = Math.max(.000001, Math.cos(point.lat * radians)) * metersPerDegree;
  let segmentIndex = 0, fraction = 0, shortestSquared = Infinity;
  for (let index = 0; index < route.points.length - 1; index++) {
    const a = route.points[index], b = route.points[index + 1];
    const ax = wrappedLongitude(a.lng - point.lng) * longitudeScale, ay = (a.lat - point.lat) * metersPerDegree;
    const bx = ax + wrappedLongitude(b.lng - a.lng) * longitudeScale, by = (b.lat - point.lat) * metersPerDegree;
    const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    const squared = (ax + progress * dx) ** 2 + (ay + progress * dy) ** 2;
    if (squared < shortestSquared) { shortestSquared = squared; segmentIndex = index; fraction = progress; }
  }
  const a = route.points[segmentIndex], b = route.points[segmentIndex + 1];
  const snappedPoint = { lat: a.lat + (b.lat - a.lat) * fraction, lng: wrappedLongitude(a.lng + wrappedLongitude(b.lng - a.lng) * fraction) };
  const geometryMeters = route.cumulativeMeters.at(-1)!;
  const travelledGeometry = route.cumulativeMeters[segmentIndex] + (route.cumulativeMeters[segmentIndex + 1] - route.cumulativeMeters[segmentIndex]) * fraction;
  const ratio = geometryMeters > 0 ? Math.min(1, travelledGeometry / geometryMeters) : 1;
  const distanceFromRouteMeters = Math.sqrt(shortestSquared);
  const reliableLocation = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 80;
  const arrivalRadius = Math.min(35, Math.max(20, reliableLocation ? accuracy : 20));
  // Remaining distance also prevents a route looping near its destination from arriving early.
  const remainingMeters = route.distanceMeters * (1 - ratio);
  // A selected entrance can be a little beyond the last mapped road coordinate.
  const arrived = reliableLocation && remainingMeters <= arrivalRadius && distanceKm(point, route.destination) * 1_000 <= arrivalRadius;
  const offRoute = reliableLocation && !arrived && distanceFromRouteMeters > Math.max(route.mode === 'walking' ? 35 : 50, accuracy * 1.5);
  const nextStep = route.steps.find((step, index) => index > 0 && route.cumulativeMeters[step.startIndex] > travelledGeometry + 8) || route.steps.at(-1)!;
  const metersToNextStep = Math.max(0, route.cumulativeMeters[nextStep.startIndex] - travelledGeometry);
  let remainingSeconds = 0;
  for (const step of route.steps) {
    const start = route.cumulativeMeters[step.startIndex], end = route.cumulativeMeters[step.endIndex];
    if (travelledGeometry <= start) remainingSeconds += step.durationSeconds;
    else if (travelledGeometry < end && end > start) remainingSeconds += step.durationSeconds * (end - travelledGeometry) / (end - start);
  }
  return {
    snappedPoint, segmentIndex, remainingPoints: [snappedPoint, ...route.points.slice(segmentIndex + 1)],
    distanceFromRouteMeters, travelledMeters: route.distanceMeters * ratio, remainingMeters,
    remainingSeconds: Math.min(route.durationSeconds, remainingSeconds), nextStep, metersToNextStep,
    reliableLocation, offRoute, arrived,
  };
}

export function formatRouteDistance(meters: number): string {
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(1)} km` : `${Math.max(0, Math.round(meters / 10) * 10)} m`;
}

export function formatRouteDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
}
