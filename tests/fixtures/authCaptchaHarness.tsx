/** Real hooks/components, synthetic frontend transport and Turnstile only.
 * This harness neither authenticates nor contacts the app or CAPTCHA provider. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { useAuthCaptcha } from '../../src/components/AuthCaptcha';
import { ThemeProvider } from '../../src/context/ThemeContext';
import AppearanceSettings from '../../src/components/AppearanceSettings';
import ThemeEnvironment from '../../src/components/ThemeEnvironment';
import RegistrationStatusButton from '../../src/components/RegistrationStatusButton';
import { setSyntheticAuth } from './themeProviderAuth';

const browser = window as any;
const root = createRoot(document.getElementById('root')!);
let captcha: ReturnType<typeof useAuthCaptcha>;
let configure: (scope: string, active: boolean) => void;
let rerender: () => void;
let show: (value: boolean) => void;
const requests: Array<{ aborted: boolean; complete: (value: unknown, status?: number) => void; fail: () => void }> = [];
const results: Array<{ value?: string; error?: string }> = [];
const widgets: Array<{ options: Record<string, any>; removed: boolean; frame: HTMLIFrameElement }> = [];
let delayedScript: HTMLScriptElement | undefined;
const nativeAppend = document.head.appendChild.bind(document.head);
let hidden = false;
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
const scheduled = new Map<number, () => void>();
const nativeSetTimeout = window.setTimeout.bind(window), nativeClearTimeout = window.clearTimeout.bind(window);
window.setTimeout = ((handler: (...parameters: any[]) => void, delay?: number, ...args: any[]) => {
  const id = nativeSetTimeout(() => { scheduled.delete(id); handler(...args); }, delay);
  if (delay === 45000) scheduled.set(id, handler);
  return id;
}) as typeof window.setTimeout;
window.clearTimeout = (id?: number) => { if (id !== undefined) scheduled.delete(id); nativeClearTimeout(id); };
const sdk = {
  render(container: HTMLElement, options: Record<string, any>) {
    const frame = document.createElement('iframe'); frame.title = 'Synthetic security widget'; container.appendChild(frame);
    const id = widgets.length; widgets.push({ options, frame, removed: false }); return String(id);
  },
  remove(id: string) { widgets[Number(id)].removed = true; widgets[Number(id)].frame.remove(); },
};
browser.turnstile = sdk;
browser.__captchaFetch = (_url: string, options: RequestInit) => new Promise<Response>((resolve, reject) => {
  const record = { aborted: false,
    complete: (value: unknown, status = 200) => resolve(new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })),
    fail: () => reject(new Error('Synthetic connection failure')) };
  requests.push(record);
  options.signal?.addEventListener('abort', () => { record.aborted = true; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});
function CaptchaProbe({ scope, active }: { scope: string; active: boolean }) {
  captcha = useAuthCaptcha(scope, active);
  return <section id="captcha-form"><button id="submit" disabled={!captcha.ready} onClick={() => browser.captchaHarness.submit()}>Submit protected form</button>{captcha.widget}</section>;
}
function App() {
  const [props, setProps] = useState({ scope: 'enrollment:account-a:seller', active: true });
  const [shown, setShown] = useState(true);
  const [, refresh] = useState(0);
  configure = (scope, active) => setProps({ scope, active }); show = setShown; rerender = () => refresh(value => value + 1);
  return <><ThemeEnvironment /><main className="user-dashboard p-4" style={{ maxWidth: 500 }}>
    <AppearanceSettings />
    <div id="merchant"><RegistrationStatusButton kind="merchant" status="unregistered" onClick={() => {}} /></div>
    <div id="pending"><RegistrationStatusButton kind="merchant" status="pending" onClick={() => {}} /></div>
    <div id="manager"><RegistrationStatusButton kind="manager" status="unregistered" onClick={() => {}} /></div>
    {shown && <CaptchaProbe {...props} />}
  </main></>;
}
browser.captchaHarness = {
  ready: () => Boolean(configure),
  state: () => ({ ready: captcha?.ready, requests: requests.length, renders: widgets.length,
    removed: widgets.filter(w => w.removed).length, frames: document.querySelectorAll('#captcha-form iframe').length,
    checkingTimers: scheduled.size, results: results.slice(), text: document.getElementById('captcha-form')?.textContent,
    options: widgets.at(-1)?.options }),
  submit: () => { void captcha.requireToken().then(value => results.push({ value: value ?? 'captcha-disabled' }), error => results.push({ error: error.message })); },
  configure: (scope: string, active = true) => configure(scope, active), rerender: () => rerender(),
  complete: (index: number, value: unknown, status?: number) => requests[index].complete(value, status),
  fail: (index: number) => requests[index].fail(),
  token: (value = 'synthetic-proof', index = widgets.length - 1) => widgets[index].options.callback(value),
  error: () => widgets.at(-1)?.options['error-callback'](),
  timeout: () => { for (const callback of [...scheduled.values()]) callback(); },
  expired: () => widgets.at(-1)?.options['expired-callback'](),
  visibility: (value: boolean) => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); },
  show: (value: boolean) => show(value), reset: () => captcha.reset(),
  delaySdk: () => {
    delete browser.turnstile;
    document.head.appendChild = ((node: Node) => {
      if (node instanceof HTMLScriptElement && node.src.startsWith('https://challenges.cloudflare.com/')) { delayedScript = node; return node; }
      return nativeAppend(node);
    }) as typeof document.head.appendChild;
  },
  releaseSdk: () => { browser.turnstile = sdk; delayedScript?.dispatchEvent(new Event('load')); document.head.appendChild = nativeAppend; },
  sdkWaiting: () => Boolean(delayedScript),
  unmount: () => root.unmount(),
};
setSyntheticAuth({ user: null, loading: false });
root.render(<MemoryRouter initialEntries={['/user/dashboard']}><ThemeProvider><App /></ThemeProvider></MemoryRouter>);
