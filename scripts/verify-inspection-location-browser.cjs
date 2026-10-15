/** Exercise the real capture utility with native browser permission denial.
 * No coordinates, reports, accounts or provider replies are invented. */
const assert = require('node:assert/strict'), fs = require('node:fs/promises');
const { transform } = require('esbuild');
const { withApprovedPineVelaBrowser } = require('./lib/approved-pinevela-browser.cjs');
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const save = async report => {
  await fs.mkdir('.security/migration-reset', { recursive: true, mode: 0o700 });
  await fs.writeFile('.security/migration-reset/inspection-location-browser.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
};
(async () => {
  const source = await fs.readFile('src/lib/inspectionLocation.ts', 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'iife', globalName: 'InspectionLocation', target: 'es2022' });
  // Node has no geolocation service: exercise the actual unsupported-device branch.
  const { captureInspectionCoordinates, recordedInspectionCoordinates } = await import('../src/lib/inspectionLocation.ts');
  assert.equal(globalThis.navigator?.geolocation, undefined, 'This check requires an actual unsupported Node runtime.');
  await assert.rejects(captureInspectionCoordinates(), /cannot capture location/); checks++;
  for (const missing of [undefined, null, {}, { lat: null, lng: null }, { lat: NaN, lng: Infinity }]) {
    check(recordedInspectionCoordinates(missing) === null, 'Missing/invalid saved measurements cannot produce coordinates.');
  }
  await withApprovedPineVelaBrowser(async ({ base, command }) => {
    let browserContextId;
    try {
      ({ browserContextId } = await command('Target.createBrowserContext', { disposeOnDetach: true }, null));
      await command('Browser.setPermission', { browserContextId, origin: base, permission: { name: 'geolocation' }, setting: 'denied' }, null);
      const { targetId } = await command('Target.createTarget', { url: base + '/api/health', browserContextId, background: true }, null);
      const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true }, null);
      await command('Page.enable', {}, sessionId);
      const { frameTree } = await command('Page.getFrameTree', {}, sessionId);
      check(frameTree.frame.url === base + '/api/health' && !frameTree.childFrames?.length,
        'The check runs only on the local health document in a new isolated browser context.');
      const { executionContextId } = await command('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'pinevela-inspection-location-check' }, sessionId);
      const result = await command('Runtime.evaluate', { contextId: executionContextId, returnByValue: true, awaitPromise: true,
        expression: code + `\n(async()=>{
          const permission=await navigator.permissions.query({name:'geolocation'});
          try { const coordinates=await InspectionLocation.captureInspectionCoordinates();
            return{origin:location.origin,permission:permission.state,rejected:false,coordinatesProduced:coordinates!=null};
          } catch(error) { return{origin:location.origin,permission:permission.state,rejected:true,
            message:error.message,coordinatesProduced:false}; }
        })()` }, sessionId);
      check(!result.exceptionDetails && result.result?.value?.origin === base, 'The real browser capture completed at the approved origin.');
      const state = result.result.value;
      check(state.permission === 'denied', 'The browser enforces native denied geolocation permission.');
      check(state.rejected && /Location access was denied/.test(state.message), 'The real capture exposes the actionable permission error.');
      check(state.coordinatesProduced === false, 'Permission denial produces no coordinates.');
      await command('Target.disposeBrowserContext', { browserContextId }, null); browserContextId = undefined;
      const report = { passed: true, checks, nativePermission: state.permission, actionableError: state.message,
        coordinatesProduced: false, isolatedContextDisposed: true, userPermissionSettingsChanged: false,
        productMutationsRequested: 0, providerRepliesFabricated: false, successfulPhysicalCaptureVerified: false };
      await save(report); console.log(JSON.stringify(report));
    } finally {
      if (browserContextId) await command('Target.disposeBrowserContext', { browserContextId }, null);
    }
  }, { approvalTimeoutMs: 120000 });
})().catch(async error => {
  await save({ passed: false, checks, error: error.message, providerRepliesFabricated: false, productMutationsRequested: 0 });
  console.error(JSON.stringify({ passed: false, checks, error: error.message })); process.exitCode = 1;
});
