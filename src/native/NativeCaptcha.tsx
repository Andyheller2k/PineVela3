import { useLayoutEffect, useRef, useState } from 'react';

export const NATIVE_CAPTCHA_ORIGIN = 'https://pinevela.app';
export const NATIVE_CAPTCHA_URL = `${NATIVE_CAPTCHA_ORIGIN}/api/auth/mobile/captcha`;
const nativeOrigin = 'https://localhost';
const failureMessage = 'Security check could not complete. Please retry.';
type CaptchaReply = { type: 'pinevela:captcha:complete' | 'pinevela:captcha:error'; token: string };

/** A frame gets no native bridge. Only this exact document/window/channel can
 * supply a bounded proof; it still has to pass server-side provider validation. */
export function readNativeCaptchaMessage(event: Pick<MessageEvent, 'source' | 'origin' | 'data'>,
  source: MessageEventSource | null, channel: string): CaptchaReply | null {
  if (!source || event.source !== source || event.origin !== NATIVE_CAPTCHA_ORIGIN) return null;
  const value: unknown = event.data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 3 || !['type', 'channel', 'token'].every(key => Object.hasOwn(data, key))
    || data.channel !== channel || !/^[A-Za-z0-9_-]{43}$/.test(channel)
    || (data.type !== 'pinevela:captcha:complete' && data.type !== 'pinevela:captcha:error')
    || typeof data.token !== 'string' || data.token.length > 2048 || /[\u0000-\u0020\u007f]/.test(data.token)
    || (data.type === 'pinevela:captcha:error' && data.token !== '')) return null;
  return { type: data.type as CaptchaReply['type'], token: data.token };
}

function randomChannel() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Mounted only for one active requireToken call. Removing this iframe stops
 * its widget and network work; the existing hook owns timeout/background cancel. */
export default function NativeCaptcha({ action, onToken, onError }: {
  action: string; onToken: (token: string) => void; onError: (message: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [channel] = useState(randomChannel);
  const completed = useRef(false);
  const ready = useRef(false);
  const initialize = () => {
    if (!ready.current || completed.current || location.origin !== nativeOrigin) return;
    frame.current?.contentWindow?.postMessage({ type: 'pinevela:captcha:init', channel, action,
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' }, NATIVE_CAPTCHA_ORIGIN);
  };
  useLayoutEffect(() => {
    completed.current = false; ready.current = true;
    if (location.origin !== nativeOrigin || !/^[A-Za-z0-9_-]{1,32}$/.test(action)) {
      completed.current = true; onError(failureMessage); return;
    }
    const listener = (event: MessageEvent) => {
      if (completed.current) return;
      const reply = readNativeCaptchaMessage(event, frame.current?.contentWindow || null, channel);
      if (!reply) return;
      completed.current = true;
      if (reply.type === 'pinevela:captcha:error') onError(failureMessage);
      else onToken(reply.token);
    };
    window.addEventListener('message', listener);
    return () => { ready.current = false; completed.current = true; window.removeEventListener('message', listener); };
  }, [action, channel, onToken, onError]);
  return <iframe ref={frame} src={NATIVE_CAPTCHA_URL} title="Security verification" aria-label="Security verification"
    referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin" onLoad={initialize}
    onError={() => { if (!completed.current) { completed.current = true; onError(failureMessage); } }}
    className="block w-full min-w-0 border-0 bg-transparent" style={{ height: 150, colorScheme: 'normal' }} />;
}
