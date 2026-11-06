# Nearby shops and responsive controls — 6 November 2026

Nearby now searches public shops as well as fixed/hybrid service locations.
The marketplace toolbar always shows a location-pin icon, in every category,
on desktop and mobile. Goods-only and empty public shops are discoverable too.
Search is independent of the distance filter and moves the map to its results.
Without location permission, users can still browse and search the map.

An owner's saved map pin is exact. An address-only shop can show a clearly
labelled approximate area from Photon/OpenStreetMap. Approximate areas do not
start exact directions; users can open the shop and confirm its entrance.
An unresolved address keeps its shop search result and an explanation.

The manager room-key header wraps its buttons and count badge at narrow widths.
The resident/seller side-tab highlight is circular and centered on its icon;
the raised central plus action is preserved. Light mode remains blue/white and
dark mode navy/yellow.

## Data and performance

The directory and area endpoints read only the existing public shop projection.
Search is parameterized and capped at 200 rows. Every area lookup rechecks current
public eligibility, including cache hits. Private identities, email addresses,
phone numbers and credential fields are absent from the directory response.

Only public address text is sent to Photon. Visitor GPS is excluded. Area
lookups are serialized, rate limited, coalesced and cached in a bounded server
cache. The map automatically resolves at most three address-only shops from a
result set; others resolve when selected. Requests cancel when the map closes.
GPS watching still starts only when following is explicitly selected.

Android now declares foreground coarse/fine location permissions, allowing the
existing Capacitor WebView permission prompt. No background location permission,
new plugin, dependency, environment variable or database migration is added.

## Files and verification

- Hosting: `releases/web/pinevela-nearby-shops-20261106.zip`.
- Android development: `releases/android/pinevela-nearby-shops-20261106.apk`.
- Evidence: `docs/verification/nearby-shops-2026-11-06/`.

Back up both build directories, extract the hosting ZIP into the existing
`pinevela-app` root, and restart Node. Preserve `.env`, certificates and
`.security`. The update is cumulative and retains unified login, device
notifications, media caching and the preceding applied SQL updates.

The verification directory separates local database/browser fixtures, the real
public Bomso area lookup, hosting installation and Android installation. No
cloud accounts, room allocations, PINs or notification preferences are changed
by the tests. Physical moving-device navigation remains a field-test item.
