import { NativeTransport, createNativeFetch, NATIVE_AUTH_DESTINATIONS } from './transport';
import { flushSync } from 'react-dom';

let installed = false;
export async function installNativeTransport() {
  if (installed) return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = createNativeFetch(original, window.location.origin);
  await NativeTransport.addListener('authComplete', async result => {
    // A return link is never a session. AuthProvider must verify /api/auth/me.
    // Unmount the previous account before opening native's identity-change gate.
    flushSync(() => window.dispatchEvent(new Event('pinevela-native-auth-changing')));
    try {
      await NativeTransport.resumeAuth({ acknowledge: true });
      window.dispatchEvent(new Event('pinevela-native-auth-complete'));
      if (result.redirectTo && NATIVE_AUTH_DESTINATIONS.has(result.redirectTo)) location.hash = result.redirectTo;
    } catch {
      window.dispatchEvent(new Event('pinevela-native-auth-error'));
      // Re-run the bounded session check so recovery UI replaces the loader.
      window.dispatchEvent(new Event('pinevela-native-auth-complete'));
      location.hash = '/login';
    }
  });
  await NativeTransport.addListener('authError', () => {
    window.dispatchEvent(new Event('pinevela-native-auth-error'));
  });
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    const url = new URL(anchor.getAttribute('href') || '', location.href);
    if (url.origin === location.origin) return;
    event.preventDefault();
    if (url.protocol === 'https:' && !url.username && !url.password) void NativeTransport.openExternal({ url: url.href }).catch(() => {});
  }, true);
  window.open = (url) => {
    if (url) {
      const destination = new URL(String(url), location.href);
      if (destination.origin === location.origin) location.assign(destination.href);
      else if (destination.protocol === 'https:' && !destination.username && !destination.password) void NativeTransport.openExternal({ url: destination.href }).catch(() => {});
    }
    return null;
  };
  await NativeTransport.resumeAuth({ acknowledge: true });
}
