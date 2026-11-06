# Nearby shops and waypoint navigation

The marketplace toolbar has a location-pin button in every category on desktop
and mobile. Nearby searches the existing public shop catalogue as well as
fixed/hybrid service pins. Goods-only, flexible-service and empty public shops
remain discoverable without granting device location access. Searching a name
moves the map to matching locations and is independent of the nearby radius.

An owner's saved shop pin is exact. Address-only shops can resolve to a labelled
approximate area; they remain in search results if resolution fails. Approximate
areas never become an exact shop route. Users can open the shop to confirm the
entrance. `/api/digital-market/stores` and the shop's `/map-location` endpoint
read the existing guarded public catalogue, never private account records. Every
area lookup rechecks publication, including cache hits. No schema change is used.

Only the published address goes to the configured HTTPS Photon provider. Visitor
GPS is excluded. Area lookups use a bounded cache and queue, coalesce identical
addresses, are spaced at least one second apart, and have per-IP/global limits.
The UI automatically resolves at most three address-only shops per search result;
others resolve on selection. Requests stop when the map closes. Android declares
foreground coarse/fine permissions; no background location permission is used.

Verification on 6 November 2026: 17 unit checks, 17 real isolated PostgreSQL/HTTP
checks and 32 browser scenarios passed. These cover publication removal after a
cached lookup, public-field projection, literal search input, exact/approximate
pins, lookup failure, search without GPS, desktop/mobile icons and both themes.
Evidence and separate live-host/native results are under
`docs/verification/nearby-shops-2026-11-06/`.

## Waypoint navigation

Setting a waypoint selects the navigation destination. The trail comes from Valhalla routing over OpenStreetMap roads and paths, using its real pedestrian or automobile costing. It is not a line drawn directly between the pins. Turn instructions, distance and travel time come from the same route response; the ETA is an estimate without live traffic.

The browser sends only selected start/destination coordinates and travel mode to the routing provider when the user requests a trail. Requests omit cookies and referrers. Location and route history are not persisted by PineVela. GPS following is explicitly started by the user and stops when the map is closed or following is stopped. Google Maps remains an external directions option.

The default development endpoint is `https://valhalla1.openstreetmap.de/route`. A deployment can set `VITE_MAP_ROUTING_URL` to a trusted HTTPS Valhalla `/route` endpoint. This is build-time configuration, never a URL supplied by a listing. A self-hosted or contracted service should be used for production reliability. The public FOSSGIS demo has fair-use restrictions; Valhalla asks published applications to identify requests and announce usage through its project discussion. PineVela sends `X-Client-Id: pinevela-web`. No external announcement is made by the implementation.

Requests are serialized and spaced at least 1.25 seconds apart, time out after 20 seconds, and never retry in a loop. HTTP 429 adds a minimum 30-second cooldown. Automatic rerouting is separately throttled by the map UI. Inputs, JSON bytes, polyline coordinates, geometry size, maneuver coverage, transport mode and route endpoints are validated. If routing fails or a pin is too far from a road, the map displays an actionable error instead of inventing a trail.

Progress uses the nearest point on the actual route. Arrival and off-route decisions require reported GPS accuracy of 80 metres or better; manual start points and poor GPS do not trigger those decisions. Poor fixes retain the last reliable trail, turn and distance instead of jumping ahead, and do not move the follow camera. Stale device fixes are rejected. Confirmed deviations require successive fixes and at least 15 seconds since the last route request.

Road geometry may end short of a building pin. The final approach keeps the waypoint distance visible and asks the user to check the entrance, rather than claiming arrival at the end of a nearby road. Route overview includes both actual pins. Users should follow actual street conditions and use an entrance near a mapped path where possible.

Manual starts, Stop, target/mode changes and route failure invalidate the GPS watch immediately. Visibility changes invalidate callbacks from the earlier watch before resuming. Clearing/replacing waypoints cancels earlier route requests. Map coordinates wrap around the world and are validated at placement. The map owns a cancellable wheel debounce because Leaflet 1.9.4 leaves its pending wheel callback alive after map removal; closing during a zoom cannot act on a destroyed map.

Verification:

- `node --import tsx tests/mapRoute.test.ts` checks actual captured public Accra routes, decoding/validation failures, progress, turn changes, GPS accuracy and cancellation.
- `node --import tsx scripts/verify-map-routing.ts` requests fresh walking and driving routes for the same public locations. It does not read account records or device location.

Verified on 17 October 2026: six route/progress tests, live walking and driving
requests, TypeScript and the frontend/backend build passed. The actual guest
browser passed 36 checks at 375 px and 1440 px through the landing and public
market themes. Checks cover road geometry, distance/time, native permission
denial, manual-start boundaries, Google destination/mode, route overview,
clearing a held genuine response and closing during queued wheel zoom. No fake
GPS fixes, account/session injection, provider-response replacement or application
writes were used. Evidence is retained in
`.security/waypoint-browser/2026-10-17T21-49-41-679Z/`.

Moving-device GPS and authenticated portal appearance were not physically exercised
in this browser run. Progress math uses captured real routes; watch lifecycle,
accuracy handling and cancellation also received source review. A phone field
check remains necessary to validate actual device movement and signal quality.

Provider references: [Valhalla route API](https://valhalla.github.io/valhalla/api/route/api-reference/), [demo server policy](https://valhalla.github.io/valhalla/#demo-server), [FOSSGIS rate-limit discussion](https://github.com/valhalla/valhalla/discussions/3373).
