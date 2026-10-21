import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { distanceKm } from '../serviceLocation';
import { decodeRoutePolyline, fetchMapRoute, formatRouteDistance, formatRouteDuration, parseMapRoute, routeProgress, type RouteMode } from '../src/lib/mapRoute';

// Genuine Valhalla responses for public Patrice Lumumba Road / Dodi Link in Accra.
// Source, capture time and request coordinates accompany each saved response.
function capturedRoute(mode: RouteMode = 'walking') {
  const capture = JSON.parse(fs.readFileSync(new URL(`./fixtures/map-route-accra-${mode === 'walking' ? 'pedestrian' : 'auto'}.json`, import.meta.url), 'utf8'));
  const origin = { lat: capture.origin.lat, lng: capture.origin.lon };
  const destination = { lat: capture.destination.lat, lng: capture.destination.lon };
  return { capture, origin, destination, route: parseMapRoute(capture.response, origin, destination, mode) };
}

test('Genuine walking and driving routes preserve roads, turns, metres and mode-specific duration', () => {
  const walking = capturedRoute(), driving = capturedRoute('driving');
  assert.equal(walking.capture.source, 'https://valhalla1.openstreetmap.de/route');
  assert.equal(walking.route.points.length, 36);
  assert.equal(walking.route.distanceMeters, 1_341);
  assert.equal(walking.route.durationSeconds, 967.427);
  assert.equal(driving.route.durationSeconds, 280.859);
  assert(walking.route.distanceMeters > distanceKm(walking.origin, walking.destination) * 1_000 + 200);
  assert(walking.route.steps.some(step => step.instruction.includes('Turn left onto Volta Road')));
  assert(walking.route.steps.some(step => step.instruction.includes('Turn right onto Dodi Link')));
  assert(walking.route.cumulativeMeters.every((value, index, all) => index === 0 || value >= all[index - 1]));
});

test('Polyline decoding and provider validation reject malformed, mismatched or distant trails', () => {
  const { capture, origin, destination } = capturedRoute();
  for (const value of [undefined, null, 1, '', '____', '~~~~~~~?', '?\u0000', '??_']) assert.throws(() => decodeRoutePolyline(value));
  for (const change of [
    (x: any) => { x.trip.status = 1; },
    (x: any) => { x.trip.units = 'miles'; },
    (x: any) => { x.trip.summary.time = Infinity; },
    (x: any) => { x.trip.summary.length = 2001; },
    (x: any) => { x.trip.legs.push(x.trip.legs[0]); },
    (x: any) => { x.trip.legs[0].maneuvers[1].begin_shape_index = 99999; },
    (x: any) => { x.trip.legs[0].maneuvers[1].begin_shape_index = 20; },
    (x: any) => { x.trip.legs[0].maneuvers[0].instruction = ''; },
    (x: any) => { x.trip.legs[0].maneuvers[0].travel_mode = 'drive'; },
    (x: any) => { x.trip.legs[0].maneuvers[0].time = -1; },
  ]) {
    const response = structuredClone(capture.response); change(response);
    assert.throws(() => parseMapRoute(response, origin, destination, 'walking'));
  }
  assert.throws(() => parseMapRoute(capture.response, origin, { lat: 0, lng: 0 }, 'walking'), /too far/);
  assert.throws(() => parseMapRoute(capture.response, { lat: NaN, lng: 0 }, destination, 'walking'), /valid starting/);
});

test('Live progress projects onto the trail, trims travelled points and advances turn instructions', () => {
  const { route } = capturedRoute();
  const start = routeProgress(route, route.points[0], 5);
  const halfway = routeProgress(route, route.points[20], 5);
  const later = routeProgress(route, route.points[30], 5);
  assert.equal(start.travelledMeters, 0);
  assert.match(start.nextStep.instruction, /Turn left onto Volta Road/);
  assert(halfway.travelledMeters > start.travelledMeters);
  assert(halfway.remainingMeters < start.remainingMeters);
  assert(halfway.remainingSeconds < start.remainingSeconds);
  assert(halfway.remainingPoints.length < route.points.length);
  assert.deepEqual(halfway.remainingPoints[0], halfway.snappedPoint);
  assert(halfway.distanceFromRouteMeters < .001);
  assert.match(later.nextStep.instruction, /Turn right/);
  assert.equal(halfway.arrived, false);
  assert.equal(halfway.offRoute, false);
});

test('Reliable GPS can detect arrival or leaving the route; inaccurate/manual points cannot', () => {
  const { route } = capturedRoute();
  const finish = routeProgress(route, route.destination, 10);
  assert.equal(finish.arrived, true);
  assert(finish.remainingMeters < 20);
  const offRoutePoint = { lat: route.points[20].lat + .002, lng: route.points[20].lng - .002 };
  assert.equal(routeProgress(route, offRoutePoint, 8).offRoute, true);
  for (const accuracy of [undefined, -1, NaN, Infinity, 100, 1_000]) {
    assert.equal(routeProgress(route, route.destination, accuracy).arrived, false);
    assert.equal(routeProgress(route, offRoutePoint, accuracy).offRoute, false);
    assert.equal(routeProgress(route, offRoutePoint, accuracy).reliableLocation, false);
  }
  assert.equal(routeProgress(route, route.points[0], 10).arrived, false);
});

test('Route requests reject invalid input or explicit cancellation before any network request', async () => {
  const { origin, destination } = capturedRoute();
  await assert.rejects(fetchMapRoute({ lat: 100, lng: 0 }, destination, 'walking'), /valid/);
  await assert.rejects(fetchMapRoute(origin, { lat: 52.52, lng: 13.405 }, 'walking'), /nearer/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchMapRoute(origin, destination, 'walking', { signal: controller.signal }), { name: 'AbortError' });
});

test('Distance and duration labels use human readable navigation units', () => {
  assert.equal(formatRouteDistance(1_341), '1.3 km');
  assert.equal(formatRouteDistance(326), '330 m');
  assert.equal(formatRouteDuration(967.427), '17 min');
  assert.equal(formatRouteDuration(3_660), '1 h 1 min');
});
