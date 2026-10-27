import assert from 'node:assert/strict';
import test from 'node:test';
import { installedAppRedirect,isInstalledAppMode } from '../src/lib/appMode';
import { applyBrowserChrome, browserChromeColor } from '../src/lib/browserChrome';

type AppWindow = NonNullable<Parameters<typeof isInstalledAppMode>[0]>;

test('installed mode follows standalone launch signals rather than browser width or URL', () => {
  const environment = (matches: boolean, standalone?: boolean) => ({
    navigator: { standalone },
    matchMedia: (query: string) => {
      assert.equal(query, '(display-mode: standalone)');
      return { matches };
    },
  }) as AppWindow;
  assert.equal(isInstalledAppMode(environment(false)), false, 'ordinary browsers retain the website');
  assert.equal(isInstalledAppMode(environment(true)), true, 'standalone display mode opens the installed app');
  assert.equal(isInstalledAppMode(environment(false, true)), true, 'iOS home-screen launch uses navigator.standalone');
  assert.equal(isInstalledAppMode(environment(false, false)), false, 'iOS Safari retains the website');
  assert.equal(isInstalledAppMode(undefined), false, 'non-browser imports are safe');
  assert.equal(isInstalledAppMode({ navigator: {} } as AppWindow), false, 'a browser without matchMedia remains a website');
});

test('installed routing replaces marketing pages while preserving account, help and product entry points', () => {
  for (const route of ['/', '////', '/why-us', '/why-us/', '/WHY-US', '/why%2Dus']) {
    assert.equal(installedAppRedirect(route), '/login', route);
  }
  for (const route of [
    '/login', '/faq', '/help', '/pinemarket', '/pinemarket/stores/store-id', '/pineresidence',
    '/user/dashboard', '/resident/dashboard', '/manager/dashboard', '/staff/dashboard',
    '/admin/dashboard', '/digital-market', '/digital-market/onboard', '/register-manager',
    '/customer-service', '/staff-invitation', '/support-invitation', '/admin-invitation',
    '/manager-google-result', '/payments/return', '/why-us-unrelated', '/invalid%path',
  ]) assert.equal(installedAppRedirect(route), undefined, route);
});


test('status-bar color follows product and phone auth appearance while other public pages retain navy', () => {
  assert.equal(browserChromeColor('light', false), '#ffffff');
  assert.equal(browserChromeColor('dark', false), '#001d3d');
  assert.equal(browserChromeColor('light', true), '#001d3d');
  assert.equal(browserChromeColor('dark', true), '#001d3d');
  assert.equal(browserChromeColor('light', true, true), '#ffffff');
  assert.equal(browserChromeColor('dark', true, true), '#001d3d');
});

test('live appearance changes repaint metadata and both page backing surfaces', () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const properties = new Map<string, string>();
  const meta = { setAttribute: (name: string, value: string) => {
    assert.equal(name, 'content'); properties.set('theme-color', value);
  } };
  const root = { dataset: { mobileAuth: 'false' }, style: { backgroundColor: '', setProperty: (name: string, value: string) => properties.set(name, value) } };
  const body = { style: { backgroundColor: '' } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    documentElement: root, body, querySelector: (selector: string) => {
      assert.equal(selector, 'meta[name="theme-color"]'); return meta;
    },
  } });
  try {
    for (const [appearance, publicAppearance, mobileAuth, expected] of [
      ['light', false, false, '#ffffff'], ['dark', false, false, '#001d3d'],
      ['light', false, false, '#ffffff'], ['light', true, false, '#001d3d'],
      ['dark', true, false, '#001d3d'], ['light', true, true, '#ffffff'],
      ['dark', true, true, '#001d3d'], ['light', true, false, '#001d3d'],
    ] as const) {
      root.dataset.mobileAuth = String(mobileAuth);
      applyBrowserChrome(appearance, publicAppearance);
      assert.equal(properties.get('theme-color'), expected);
      assert.equal(properties.get('--pv-chrome-color'), expected);
      assert.equal(root.style.backgroundColor, expected);
      assert.equal(body.style.backgroundColor, expected);
    }
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
