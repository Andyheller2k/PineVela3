/** A document launch finishes once; navigation and app resume cannot restart it. */
export function createAppLaunchState(onReady: () => void) {
  let routeReady = false;
  let authReady = false;
  let finished = false;

  function finishIfReady(recoveryVisible = false) {
    if (finished || (!recoveryVisible && !(routeReady && authReady))) return;
    finished = true;
    onReady();
  }

  return {
    routeReady() { routeReady = true; finishIfReady(); },
    authReady() { authReady = true; finishIfReady(); },
    recoveryVisible() { finishIfReady(true); },
  };
}

// Module state belongs to this document, rather than an account or browser tab
// storage key. Reloading gets a new launch; hash routes and pageshow do not.
export const appLaunch = createAppLaunchState(() => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pinevela:app-ready'));
});
