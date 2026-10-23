import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { sessionFetch } from '../lib/session';

type CaptchaConfiguration = { enabled: false } | { enabled: true; provider: 'turnstile'; siteKey: string };
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

/** Only a public site key reaches the browser. Supabase validates each token. */
export function useAuthCaptcha(scope: string, active = true) {
  const [configuration, setConfiguration] = useState<CaptchaConfiguration | null>(null);
  const [configurationError, setConfigurationError] = useState('');
  const [reload, setReload] = useState(0);
  const [revision, setRevision] = useState(0);
  const identity = `${scope}:${revision}:${active}`;
  const [proof, setProof] = useState({ identity: '', token: '' });
  const [challengeError, setChallengeError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setConfiguration(null); setConfigurationError('');
    void sessionFetch('/api/auth/captcha', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => {
        const value = await response.json();
        if (!response.ok || typeof value?.enabled !== 'boolean' ||
          (value.enabled && (value.provider !== 'turnstile' || typeof value.siteKey !== 'string' || !/^[A-Za-z0-9_-]{3,256}$/.test(value.siteKey))))
          throw new Error('Security settings could not load. Please retry.');
        if (!controller.signal.aborted) setConfiguration(value.enabled ? { enabled: true, provider: 'turnstile', siteKey: value.siteKey } : { enabled: false });
      }).catch(() => { if (!controller.signal.aborted) setConfigurationError('Security settings could not load. Check your connection and retry.'); });
    return () => controller.abort();
  }, [reload]);
  const reset = useCallback(() => {
    setProof({ identity: '', token: '' }); setChallengeError(''); setRevision(value => value + 1);
  }, []);
  const onToken = useCallback((token: string) => { setProof({ identity, token }); setChallengeError(''); }, [identity]);
  const onError = useCallback((message: string) => { setProof({ identity: '', token: '' }); setChallengeError(message); }, []);
  const token = active && proof.identity === identity ? proof.token : '';
  const ready = configuration?.enabled === false || Boolean(configuration?.enabled && token && !challengeError);
  useEffect(() => {
    if (!active || !configuration?.enabled || ready || challengeError) return;
    const timer = window.setTimeout(() => setChallengeError('Security check is taking longer than expected. Please retry.'), 45000);
    return () => window.clearTimeout(timer);
  }, [active, configuration, ready, challengeError, identity]);
  const requireToken = () => {
    if (!configuration || configurationError) throw new Error(configurationError || 'Please wait for the security check.');
    if (configuration.enabled && !token) throw new Error(challengeError || 'Please complete the security check.');
    return configuration.enabled ? token : undefined;
  };
  const error = configurationError || challengeError;
  const widget = !active ? null : <>
    {configuration?.enabled && <TurnstileWidget key={identity} siteKey={configuration.siteKey} action={scope.split(':')[0].replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) || 'auth'} onToken={onToken} onError={onError} />}
    {error ? <div role="alert" className="text-xs font-semibold text-amber-700 dark:text-amber-300">
      <p>{error}</p><button type="button" className="mt-1 underline" onClick={() => { reset(); if (configurationError) setReload(value => value + 1); }}>Retry security check</button>
    </div> : !ready ? <p role="status" className="text-xs font-medium text-amber-700 dark:text-amber-300">Checking security…</p>
      : configuration?.enabled && <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300"><Check size={14} aria-hidden="true" />Security check complete</p>}
  </>;
  return { ready, requireToken, reset, widget };
}
