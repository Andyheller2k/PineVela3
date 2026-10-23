import assert from 'node:assert/strict';
import test from 'node:test';
import { installedAppRedirect,isInstalledAppMode } from '../src/lib/appMode';

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
