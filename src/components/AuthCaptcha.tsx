import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionFetch } from '../lib/session';
import { NATIVE_APP } from '../native/environment';
import NativeCaptcha from '../native/NativeCaptcha';

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

let scriptPromise: Promise<Turnstile> | undefined;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const timeout = window.setTimeout(() => fail(), 20000);
    function fail() {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Security check could not load. Check your connection and retry.'));
    }
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => { scriptPromise = undefined; throw error; });
  return scriptPromise;
}

function TurnstileWidget({ siteKey, action, onToken, onError }: { siteKey: string; action: string; onToken: (token: string) => void; onError: (message: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true, widget: string | undefined, api: Turnstile | undefined;
    void loadTurnstile().then(turnstile => {
      if (!active || !container.current) return;
      api = turnstile;
      widget = turnstile.render(container.current, {
        sitekey: siteKey, action, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
        size: container.current.clientWidth < 300 ? 'compact' : 'flexible',
        appearance: 'interaction-only', 'response-field': false,
        retry: 'never', 'refresh-expired': 'manual', 'refresh-timeout': 'manual',
        callback: (token: string) => { if (active) onToken(token); },
        'expired-callback': () => { if (active) onToken(''); },
        'error-callback': () => { if (active) onError('Security check could not complete. Please retry.'); return true; },
        'timeout-callback': () => { if (active) onToken(''); },
      });
    }).catch(error => { if (active) onError(error.message); });
    return () => { active = false; if (widget !== undefined) api?.remove(widget); };
  }, [siteKey, action, onToken, onError]);
  return <div ref={container} aria-label="Security verification" className="flex w-full min-w-0 justify-center" />;
}

/** Only a public site key reaches the browser. Supabase validates each token.
 * Every protected submission obtains a fresh proof. No widget or refresh timer
 * runs while a form is idle, after completion, or while the app is hidden. */
export function useAuthCaptcha(scope: string, active = true) {
  const identity = `${scope}:${active}`;
  const current = useRef(identity); current.current = identity;
  const mounted = useRef(false);
  const sequence = useRef(0);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState<{ id: number; siteKey: string; action: string } | null>(null);
  const pending = useRef<{
    id: number; identity: string; promise: Promise<string | undefined>;
    resolve: (token?: string) => void; reject: (error: Error) => void;
    controller: AbortController; timer: number;
  } | null>(null);
  const settle = useCallback((id: number, token?: string, failure?: string) => {
    const waiting = pending.current;
    if (!waiting || waiting.id !== id) return;
    pending.current = null;
    window.clearTimeout(waiting.timer);
    waiting.controller.abort();
    const message = failure || (current.current !== waiting.identity || !mounted.current || document.hidden
      ? 'The security check was cancelled. Please submit again.' : '');
    if (mounted.current) { setChecking(false); setChallenge(null); setError(message); }
    if (message) waiting.reject(new Error(message));
    else waiting.resolve(token);
  }, []);
  const cancel = useCallback((message: string) => {
    if (pending.current) settle(pending.current.id, undefined, message);
  }, [settle]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel('The security check was cancelled. Please submit again.'); };
  }, [cancel]);
  useEffect(() => {
    setChecking(false); setChallenge(null); setError('');
    return () => { if (pending.current?.identity === identity) cancel('The active form changed. Please submit again.'); };
  }, [identity, cancel]);
  useEffect(() => {
    const update = () => { if (document.hidden) cancel('The security check paused while the app was in the background. Please submit again.'); };
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [cancel]);
  const reset = useCallback(() => {
    cancel('The security check was reset. Please submit again.');
    if (mounted.current) { setChecking(false); setChallenge(null); setError(''); }
  }, [cancel]);
  const requireToken = (): Promise<string | undefined> => {
    if (!active || !mounted.current || current.current !== identity || document.hidden)
      return Promise.reject(new Error('Return to the active form before submitting.'));
    if (pending.current?.identity === identity) return pending.current.promise;
    cancel('The active form changed. Please submit again.');
    const id = ++sequence.current, controller = new AbortController();
    let resolve!: (token?: string) => void, reject!: (error: Error) => void;
    const promise = new Promise<string | undefined>((done, fail) => { resolve = done; reject = fail; });
    const timer = window.setTimeout(() => settle(id, undefined, 'Security check is taking longer than expected. Please submit again.'), 45000);
    pending.current = { id, identity, promise, resolve, reject, controller, timer };
    setChecking(true); setChallenge(null); setError('');
    void sessionFetch('/api/auth/captcha', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => {
        const value = await response.json();
        if (!response.ok || typeof value?.enabled !== 'boolean' ||
          (value.enabled && (value.provider !== 'turnstile' || typeof value.siteKey !== 'string' || !/^[A-Za-z0-9_-]{3,256}$/.test(value.siteKey))))
          throw new Error('Security settings could not load. Please submit again.');
        if (pending.current?.id !== id || current.current !== identity) return;
        if (!value.enabled) settle(id);
        else setChallenge({ id, siteKey: value.siteKey, action: scope.split(':')[0].replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) || 'auth' });
      }).catch(() => {
        if (!controller.signal.aborted) settle(id, undefined, 'Security settings could not load. Check your connection and submit again.');
      });
    return promise;
  };
  const challengeId = challenge?.id;
  const onToken = useCallback((token: string) => {
    if (challengeId !== undefined) settle(challengeId, token || undefined, token ? undefined : 'Security verification expired. Please submit again.');
  }, [challengeId, settle]);
  const onError = useCallback((message: string) => {
    if (challengeId !== undefined) settle(challengeId, undefined, `${message} Submit again when ready.`);
  }, [challengeId, settle]);
  const widget = !active ? null : <>
    {challenge && (NATIVE_APP
      ? <NativeCaptcha key={challenge.id} action={challenge.action} onToken={onToken} onError={onError} />
      : <TurnstileWidget key={challenge.id} siteKey={challenge.siteKey} action={challenge.action} onToken={onToken} onError={onError} />)}
    {error ? <p role="alert" className="text-xs font-semibold text-amber-700 dark:text-amber-300">{error}</p>
      : checking && <p role="status" className="text-xs font-medium text-amber-700 dark:text-amber-300">Checking security…</p>}
  </>;
  return { ready: !checking, requireToken, reset, widget };
}
