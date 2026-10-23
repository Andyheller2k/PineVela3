import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
let snapshot = { canPrompt: false, installed: false };
const listeners = new Set<() => void>();
function publish() {
  snapshot = { canPrompt: deferredPrompt !== null, installed };
  for (const listener of listeners) listener();
}

// Imported by the entry point so a browser prompt is captured before lazy pages load.
// Installation state stays in memory; this does not save account or device data.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    publish();
  });
}

export function usePwaInstall() {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => snapshot, () => snapshot);
}

/** Call directly from a tap: browsers require a user gesture to show installation. */
export async function requestPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const prompt = deferredPrompt;
  if (!prompt) return 'unavailable';
  deferredPrompt = null;
  publish();
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'accepted') { installed = true; publish(); }
  return outcome;
}

export function isAppleMobileDevice(device: Pick<Navigator, 'userAgent' | 'maxTouchPoints'>): boolean {
  return /iPad|iPhone|iPod/i.test(device.userAgent)
    || (/Macintosh/i.test(device.userAgent) && device.maxTouchPoints > 1);
}
