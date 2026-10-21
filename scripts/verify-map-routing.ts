import assert from 'node:assert/strict';
import { fetchMapRoute, routeProgress, type RouteMode } from '../src/lib/mapRoute';

// Public road locations in Accra, Ghana, not any PineVela account or device location.
const origin = { lat: 5.6037, lng: -.187 };
const destination = { lat: 5.612, lng: -.182 };
const summaries = [];
for (const mode of ['walking', 'driving'] as RouteMode[]) {
  const route = await fetchMapRoute(origin, destination, mode);
  assert(route.points.length > 10, 'A genuine street trail contains intermediate geometry.');
  assert(route.steps.some(step => /turn/i.test(step.instruction)), 'The route contains turn guidance.');
  assert(route.distanceMeters > 1_000 && route.distanceMeters < 2_500);
  assert(route.durationSeconds > 0);
  const progress = routeProgress(route, route.points[Math.floor(route.points.length / 2)], 8);
  assert(progress.travelledMeters > 0 && progress.remainingMeters < route.distanceMeters);
  assert(progress.distanceFromRouteMeters < 1);
  assert(routeProgress(route, destination, 8).arrived);
  summaries.push({ mode, points: route.points.length, steps: route.steps.length, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds });
}
assert(summaries[0].durationSeconds > summaries[1].durationSeconds, 'Walking and driving have real independent costing.');
console.log(JSON.stringify({ provider: 'Valhalla / FOSSGIS', publicLocations: 'Patrice Lumumba Road to Dodi Link, Accra', passed: true, routes: summaries }, null, 2));
