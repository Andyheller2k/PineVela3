import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppLaunchState } from '../src/lib/appLaunch';

test('startup waits for both the committed route and initial session resolution in either order', () => {
  for (const routeFirst of [true, false]) {
    let ready = 0;
    const launch = createAppLaunchState(() => { ready += 1; });
    if (routeFirst) launch.routeReady(); else launch.authReady();
    assert.equal(ready, 0, 'a loaded shell or resolved session alone is not ready');
    if (routeFirst) launch.authReady(); else launch.routeReady();
    assert.equal(ready, 1, 'the initial usable route completes startup immediately');
  }
});

test('later route commits, auth refreshes and repeated effects cannot restart the launch', () => {
  let ready = 0;
  const launch = createAppLaunchState(() => { ready += 1; });
  launch.authReady();
  launch.routeReady();
  launch.routeReady();
  launch.authReady();
  launch.recoveryVisible();
  assert.equal(ready, 1);
});

test('recoverable startup failures reveal the error even while auth or a route is pending', () => {
  for (const phase of ['auth-pending', 'route-pending', 'both-pending']) {
    let ready = 0;
    const launch = createAppLaunchState(() => { ready += 1; });
    if (phase === 'auth-pending') launch.routeReady();
    if (phase === 'route-pending') launch.authReady();
    launch.recoveryVisible();
    assert.equal(ready, 1);
    launch.authReady();
    launch.routeReady();
    assert.equal(ready, 1, 'recovering does not introduce another launch');
  }
});

test('a new document gets an independent launch without browser storage', () => {
  let firstReady = 0;
  let nextReady = 0;
  const firstDocument = createAppLaunchState(() => { firstReady += 1; });
  firstDocument.authReady();
  firstDocument.routeReady();
  const nextDocument = createAppLaunchState(() => { nextReady += 1; });
  assert.equal(firstReady, 1);
  assert.equal(nextReady, 0);
  nextDocument.authReady();
  nextDocument.routeReady();
  assert.equal(nextReady, 1);
});
