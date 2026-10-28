import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { isPublicAppearance } from '../src/lib/publicAppearance';
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

test('every registered app route resolves the shared preference before paint', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const routes = [...app.matchAll(/\bpath="([^"]+)"/g)].map(match => match[1]).filter(route => route !== '*').map(route => route.replace(/:storeId/g, 'store-id'));
  assert(routes.length >= 30, 'The real router defines the route inventory');
  for (const route of [...new Set(routes)]) for (const saved of ['light', 'dark', 'system', null, 'blocked']) for (const dark of [false, true]) {
    const { root, meta } = boot(route, saved, dark, false);
    const preference = isThemePreference(saved) ? saved : 'system';
    const expected = resolveTheme(preference, dark ? 'dark' : 'light');
    assert.equal(root.dataset.theme, expected, `${route}: ${saved}, browser dark=${dark}`);
    assert.equal(root.dataset.themePreference, preference);
    assert.equal(meta.content, expected === 'light' ? '#ffffff' : '#001d3d');
  }
  assert.equal(isPublicAppearance('/login-other'), false);
  assert.equal(isAuthPage('/login-other'), false);
});

test('all public pages follow the saved choice or browser from the first paint', () => {
  for (const route of ['/', '/faq', '/faq/', '/help', '/help/', '/faq?from=/login', '/help?from=/', '/why-us', '/why-us/', '/pinemarket', '/pinemarket/', '/pineresidence', '/pineresidence/', '/pinemarket/stores/store-id', '/support-invitation']) {
    assert.equal(isPublicAppearance(route.split('?')[0], route.includes('?') ? route.slice(route.indexOf('?')) : ''), true);
    for (const saved of [null, 'light', 'dark', 'system', 'invalid', 'blocked']) for (const dark of [false, true]) {
      const { root, meta } = boot(route, saved, dark, false);
      const preference = isThemePreference(saved) ? saved : 'system';
      const expected = resolveTheme(preference, dark ? 'dark' : 'light');
      assert.equal(root.dataset.theme, expected, `${route}: ${saved}, browser dark=${dark}`);
      assert.equal(root.dataset.themePreference, preference);
      assert.equal(root.dataset.appearance, 'public');
      assert.equal(root.dataset.publicTheme, 'adaptive');
      assert.equal(meta.content, expected === 'light' ? '#ffffff' : '#001d3d');
    }
  }
});

test('FAQ and Help retain navigation context while sharing theme resolution', () => {
  for (const route of ['/help', '/faq']) {
    assert.equal(isPublicAppearance(route, '', true), false);
    for (const from of ['/', '/login', '/pinemarket', '/faq', '/user/dashboard', '/resident/dashboard', '/manager/dashboard', '/staff/dashboard', '/admin/dashboard', '/digital-market', '/customer-service', '/field-officer']) {
      const query = '?from=' + encodeURIComponent(from);
      const publicPage = ['/', '/login', '/pinemarket', '/faq'].includes(from);
      assert.equal(isPublicAppearance(route, query), publicPage);
      for (const saved of ['light', 'dark', 'system'] as const) for (const systemDark of [false, true]) {
        const { root } = boot(route + query, saved, systemDark, false, true);
        assert.equal(root.dataset.theme, resolveTheme(saved, systemDark ? 'dark' : 'light'));
        assert.equal(root.dataset.appearance, publicPage ? 'public' : 'product');
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
