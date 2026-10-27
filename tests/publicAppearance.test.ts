import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { getPublicAppearance } from '../src/lib/publicAppearance';
import { isAuthPage, isPhoneAuth, PHONE_AUTH_MEDIA, subscribePhoneAuthViewport } from '../src/lib/mobileAuthAppearance';
import { browserChromeColor } from '../src/lib/browserChrome';
import { DEVICE_THEME_KEY, isThemePreference, readSystemTheme, resolveTheme, subscribeSystemTheme, SYSTEM_THEME_MEDIA, type ThemePreference } from '../src/lib/themePreference';

const bootstrap = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1];
function boot(route: string, saved: unknown, dark: boolean, phone: boolean, installed = false) {
  const properties = new Map<string, string>();
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: '', backgroundColor: '', setProperty: (name: string, value: string) => properties.set(name, value) } };
  const meta = { content: '' };
  let writes = 0;
  runInNewContext(bootstrap, {
    document: { documentElement: root, querySelector: () => meta },
    navigator: { standalone: installed }, location: { hash: '#' + route }, URLSearchParams,
    localStorage: {
      getItem: (key: string) => { assert.equal(key, DEVICE_THEME_KEY); if (saved === 'blocked') throw Error('Storage blocked'); return saved; },
      setItem: () => { writes++; }, removeItem: () => { writes++; },
    },
    matchMedia: (query: string) => ({ matches: query === PHONE_AUTH_MEDIA ? phone : query === SYSTEM_THEME_MEDIA ? dark : false }),
  });
  assert.equal(writes, 0, 'Prepaint never rewrites the preference or an account cache');
  assert.equal(root.style.colorScheme, root.dataset.theme);
  assert.equal(root.style.backgroundColor, meta.content);
  assert.equal(properties.get('--pv-chrome-color'), meta.content);
  assert.equal(root.dataset.appMode, installed ? 'installed' : 'browser');
  return { root, meta };
}

test('Light and Dark remain explicit choices; only System follows the device theme', () => {
  for (const [preference, system, expected] of [
    ['light', 'light', 'light'], ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'], ['dark', 'dark', 'dark'],
    ['system', 'light', 'light'], ['system', 'dark', 'dark'],
  ] as const) assert.equal(resolveTheme(preference, system), expected);
  for (const valid of ['light', 'dark', 'system']) assert.equal(isThemePreference(valid), true);
  for (const invalid of [null, undefined, '', 'auto', 'SYSTEM', {}, 0]) assert.equal(isThemePreference(invalid), false);
});

test('product and all login/signup widths resolve the same saved choice before paint', () => {
  for (const route of ['/login', '/login/', '/login?mode=register', '/login/?mode=register', '/user/dashboard', '/resident/dashboard', '/manager/dashboard', '/digital-market']) {
    const pathname = route.split('?')[0];
    assert.equal(getPublicAppearance(pathname), null, route);
    for (const saved of ['light', 'dark', 'system', null, 'invalid', 'blocked']) {
      for (const dark of [false, true]) for (const phone of [false, true]) {
        const { root, meta } = boot(route, saved, dark, phone);
        const preference: ThemePreference = isThemePreference(saved) ? saved : 'system';
        const expected = preference === 'system' ? dark ? 'dark' : 'light' : preference;
        const auth = isAuthPage(pathname);
        assert.equal(root.dataset.themePreference, preference, route);
        assert.equal(root.dataset.theme, expected, `${route}: ${saved}, system dark=${dark}`);
        assert.equal(root.dataset.authPage, String(auth));
        assert.equal(root.dataset.mobileAuth, String(auth && phone));
        assert.equal(root.dataset.appearance, auth ? 'public' : 'product');
        assert.equal(meta.content, expected === 'light' ? '#ffffff' : '#001d3d');
        assert.equal(meta.content, browserChromeColor(expected, auth, auth));
      }
    }
  }
});

test('marketing/catalog routes retain their fixed appearance without replacing saved preference', () => {
  for (const [route, fixed] of [
    ['/', 'light'], ['/why-us', 'dark'], ['/why-us/', 'dark'], ['/pinemarket', 'dark'],
    ['/pinemarket/', 'dark'], ['/pineresidence', 'dark'], ['/pineresidence/', 'dark'],
    ['/pinemarket/stores/store-id', 'dark'], ['/support-invitation', 'dark'], ['/faq', 'dark'], ['/help', 'dark'],
  ] as const) {
    assert.equal(getPublicAppearance(route), fixed);
    for (const preference of ['light', 'dark', 'system']) for (const dark of [false, true]) {
      const { root, meta } = boot(route, preference, dark, true);
      assert.equal(root.dataset.theme, fixed, route);
      assert.equal(root.dataset.themePreference, preference);
      assert.equal(root.dataset.authPage, 'false');
      assert.equal(root.dataset.mobileAuth, 'false');
      assert.equal(root.dataset.appearance, 'public');
      assert.equal(meta.content, '#001d3d');
    }
  }
  assert.equal(getPublicAppearance('/login-other'), null);
  assert.equal(isAuthPage('/login-other'), false);
});

test('FAQ and Help preserve product-origin and public-origin rules', () => {
  for (const route of ['/help', '/faq']) {
    assert.equal(getPublicAppearance(route, '', true), null);
    for (const from of ['/', '/login', '/pinemarket', '/faq', '/user/dashboard', '/resident/dashboard', '/manager/dashboard', '/staff/dashboard', '/admin/dashboard', '/digital-market', '/customer-service', '/field-officer']) {
      const query = '?from=' + encodeURIComponent(from);
      const fixed = getPublicAppearance(route, query);
      assert.equal(fixed, ['/', '/login', '/pinemarket', '/faq'].includes(from) ? 'dark' : null);
      for (const saved of ['light', 'dark', 'system'] as const) for (const systemDark of [false, true]) {
        const { root } = boot(route + query, saved, systemDark, false, true);
        assert.equal(root.dataset.theme, fixed ?? resolveTheme(saved, systemDark ? 'dark' : 'light'));
      }
    }
  }
});

function mediaEnvironment(legacy: boolean) {
  const values = new Map([[PHONE_AUTH_MEDIA, true], [SYSTEM_THEME_MEDIA, false]]);
  const listeners = new Map([...values.keys()].map(query => [query, new Set<() => void>()]));
  const environment = { matchMedia: (query: string) => {
    assert(values.has(query));
    return {
      get matches() { return values.get(query)!; },
      ...(legacy ? {
        addListener: (listener: () => void) => { listeners.get(query)!.add(listener); },
        removeListener: (listener: () => void) => { listeners.get(query)!.delete(listener); },
      } : {
        addEventListener: (_type: 'change', listener: () => void) => { listeners.get(query)!.add(listener); },
        removeEventListener: (_type: 'change', listener: () => void) => { listeners.get(query)!.delete(listener); },
      }),
    };
  } };
  const change = (query: string, matches: boolean) => { values.set(query, matches); listeners.get(query)!.forEach(listener => listener()); };
  return { environment, listeners, change };
}

test('System follows live OS changes and cleans up modern and legacy media listeners', () => {
  for (const legacy of [false, true]) {
    const { environment, listeners, change } = mediaEnvironment(legacy);
    const changes: string[] = [];
    const stop = subscribeSystemTheme(() => changes.push(readSystemTheme(environment)), environment);
    assert.equal(readSystemTheme(environment), 'light');
    assert.equal(listeners.get(SYSTEM_THEME_MEDIA)!.size, 1);
    change(SYSTEM_THEME_MEDIA, true); change(PHONE_AUTH_MEDIA, false); change(SYSTEM_THEME_MEDIA, false);
    assert.deepEqual(changes, ['dark', 'light'], 'Only OS appearance changes affect System');
    stop();
    assert.equal(listeners.get(SYSTEM_THEME_MEDIA)!.size, 0);
    change(SYSTEM_THEME_MEDIA, true);
    assert.deepEqual(changes, ['dark', 'light']);
  }
  assert.equal(readSystemTheme({}), 'light');
  assert.equal(readSystemTheme({ matchMedia: () => { throw Error('Unavailable'); } }), 'light');
  subscribeSystemTheme(() => assert.fail(), {})();
});

test('phone detection only controls responsive styling and removes viewport listeners', () => {
  for (const legacy of [false, true]) {
    const { environment, listeners, change } = mediaEnvironment(legacy);
    const changes: boolean[] = [];
    const stop = subscribePhoneAuthViewport('/login/', () => changes.push(isPhoneAuth('/login', environment)), environment);
    assert.equal(isPhoneAuth('/login', environment), true);
    assert.equal(listeners.get(SYSTEM_THEME_MEDIA)!.size, 0, 'Viewport logic does not own theme selection');
    change(SYSTEM_THEME_MEDIA, true); change(PHONE_AUTH_MEDIA, false); change(PHONE_AUTH_MEDIA, true);
    assert.deepEqual(changes, [false, true]);
    stop();
    assert.equal(listeners.get(PHONE_AUTH_MEDIA)!.size, 0);
    assert.equal(isPhoneAuth('/user/dashboard', environment), false);
    subscribePhoneAuthViewport('/user/dashboard', () => assert.fail(), environment)();
  }
  assert.equal(isPhoneAuth('/login', {}), false);
  assert.equal(isPhoneAuth('/login', { matchMedia: () => { throw Error('Unavailable'); } }), false);
});
