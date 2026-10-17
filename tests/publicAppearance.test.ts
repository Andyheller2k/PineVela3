import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { getPublicAppearance } from '../src/lib/publicAppearance';

const bootstrap = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1];

test('public catalog appearances agree before paint and after navigation without changing product preferences', () => {
  for (const [route, fixed] of [
    ['/', 'light'], ['/login', 'light'], ['/login/', 'light'],
    ['/pinemarket', 'dark'], ['/pinemarket/', 'dark'], ['/pineresidence', 'dark'],
    ['/pineresidence/', 'dark'], ['/pinemarket/stores/store-id', 'dark'], ['/pinemarket/stores/store-id/', 'dark'],
    ['/faq', 'dark'], ['/support-invitation', 'dark'], ['/help', 'dark'],
    ['/user/dashboard', null], ['/resident/dashboard', null], ['/pinemarket-other', null],
  ] as const) {
    assert.equal(getPublicAppearance(route), fixed, route);
    for (const saved of ['light', 'dark', 'blocked']) {
      const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
      runInNewContext(bootstrap, {
        document: { documentElement: root }, location: { hash: `#${route}?search=books` },
        localStorage: { getItem: () => { if (saved === 'blocked') throw Error('Storage blocked'); return saved; } },
        matchMedia: () => ({ matches: false }), URLSearchParams,
      });
      assert.equal(root.dataset.theme, fixed ?? (saved === 'blocked' ? 'light' : saved), `${route}: ${saved}`);
      assert.equal(root.style.colorScheme, root.dataset.theme);
      assert.equal(root.dataset.appearance, fixed ? 'public' : 'product');
    }
  }
});

test('public Help stays navy while product Help restores the saved product theme', () => {
  assert.equal(getPublicAppearance('/help', '?ticket=owned-case', true), null);
  assert.equal(getPublicAppearance('/help', '?from=/login', true), 'dark');
  for (const from of ['/', '/login', '/pinemarket', '/faq', '/user/dashboard', '/manager/dashboard', '/digital-market', '/customer-service']) {
    const search = `?from=${encodeURIComponent(from)}`, fixed = getPublicAppearance('/help', search);
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
    runInNewContext(bootstrap, { document: { documentElement: root }, location: { hash: '#/help' + search }, localStorage: { getItem: () => 'light' }, matchMedia: () => ({ matches: false }), URLSearchParams });
    assert.equal(root.dataset.theme, fixed || 'light');
    assert.equal(root.dataset.appearance, fixed ? 'public' : 'product');
    assert.equal(fixed, ['/user/dashboard', '/manager/dashboard', '/digital-market', '/customer-service'].includes(from) ? null : 'dark');
  }
});
