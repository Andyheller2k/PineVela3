import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/legal-appearance.js', import.meta.url), 'utf8');
function legalPage(saved: string | null, systemDark: boolean, blocked = false) {
  const handlers = new Map<string, (event?: { key: string | null }) => void>();
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
  let mediaListener: () => void;
  let storageWrites = 0;
  let chrome = '';
  runInNewContext(script, {
    document: { documentElement: root, querySelector: () => ({ setAttribute: (_name: string, value: string) => { chrome = value; } }) },
    window: { matchMedia: () => ({ get matches() { return systemDark; }, addEventListener: (_name: string, listener: () => void) => { mediaListener = listener; } }),
      addEventListener: (name: string, listener: () => void) => handlers.set(name, listener) },
    localStorage: { getItem: (key: string) => { assert.equal(key, 'pinevela:appearance'); if (blocked) throw Error('Blocked'); return saved; },
      setItem: () => { storageWrites++; } },
    fetch: () => assert.fail('Static policy appearance must not request an account or API'),
  });
  return { root, chrome: () => chrome, writes: () => storageWrites,
    os: (dark: boolean) => { systemDark = dark; mediaListener!(); },
    storage: (value: string | null) => { saved = value; handlers.get('storage')!({ key: 'pinevela:appearance' }); },
    restore: () => handlers.get('pageshow')!(),
  };
}

test('static policies share manual app choices before paint, regardless of OS preference', () => {
  for (const preference of ['light', 'dark']) for (const dark of [false, true]) {
    const page = legalPage(preference, dark);
    assert.equal(page.root.dataset.themePreference, preference);
    assert.equal(page.root.dataset.theme, preference);
    assert.equal(page.root.style.colorScheme, preference);
    assert.equal(page.chrome(), preference === 'light' ? '#ffffff' : '#001d3d');
    page.os(!dark); assert.equal(page.root.dataset.theme, preference);
    assert.equal(page.writes(), 0);
  }
});

test('static policies follow System live and tolerate missing, invalid or blocked storage', () => {
  for (const saved of [null, 'system', 'invalid']) for (const blocked of [false, true]) {
    const page = legalPage(saved, false, blocked);
    assert.equal(page.root.dataset.themePreference, 'system');
    assert.equal(page.root.dataset.theme, 'light');
    page.os(true); assert.equal(page.root.dataset.theme, 'dark');
    page.os(false); assert.equal(page.root.dataset.theme, 'light');
    assert.equal(page.writes(), 0);
  }
});

test('static policies synchronize other-tab choices and a restored page without changing preferences', () => {
  const page = legalPage('light', true);
  page.storage('dark'); assert.equal(page.root.dataset.theme, 'dark');
  page.storage('system'); assert.equal(page.root.dataset.themePreference, 'system');
  page.os(false); assert.equal(page.root.dataset.theme, 'light');
  page.restore(); assert.equal(page.root.dataset.theme, 'light');
  assert.equal(page.writes(), 0);
});
