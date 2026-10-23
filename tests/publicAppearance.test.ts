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
    ['/faq', 'dark'], ['/support-invitation', 'dark'], ['/help', 'dark'], ['/why-us', 'dark'], ['/why-us/', 'dark'],
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

test('public FAQ and Help stay navy while product entries restore either saved theme', () => {
  for (const route of ['/help', '/faq']) {
    assert.equal(getPublicAppearance(route, '', true), null);
    assert.equal(getPublicAppearance(route, '?from=/login', true), 'dark');
    for (const from of ['/', '/login', '/pinemarket', '/faq', '/user/dashboard', '/resident/dashboard', '/manager/dashboard', '/staff/dashboard', '/admin/dashboard', '/digital-market', '/customer-service', '/field-officer']) {
      const search = `?from=${encodeURIComponent(from)}`, fixed = getPublicAppearance(route, search);
      for (const saved of ['light', 'dark']) {
        const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
        runInNewContext(bootstrap, { document: { documentElement: root }, location: { hash: '#' + route + search }, localStorage: { getItem: () => saved }, matchMedia: () => ({ matches: false }), URLSearchParams });
        assert.equal(root.dataset.theme, fixed || saved);
        assert.equal(root.dataset.appearance, fixed ? 'public' : 'product');
        assert.equal(fixed, ['/', '/login', '/pinemarket', '/faq'].includes(from) ? 'dark' : null);
      }
    }
  }
});
