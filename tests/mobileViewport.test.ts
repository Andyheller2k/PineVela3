import assert from 'node:assert/strict';
import test from 'node:test';
import { installMobileViewport } from '../src/lib/mobileViewport';

// Browser primitives only: no account, catalog or other business-data fixtures.
class Surface {
  parentElement: Surface | null;
  dataset: Record<string, string> = {};
  clientWidth = 390;
  scrollWidth = 390;
  scrollLeft = 0;
  overflowX = 'visible';
  direction = 'ltr';
  isConnected = true;
  get tabIndex() { return Number(this.attributes.tabindex ?? -1); }
  constructor(readonly tagName = 'div', parent: Surface | null = null, readonly attributes: Record<string, string> = {}) {
    this.parentElement = parent;
  }
  closest(selector: string): Surface | null {
    for (let element: Surface | null = this; element; element = element.parentElement) {
      for (const part of selector.split(',').map(value => value.trim())) {
        if (part.startsWith('.')) {
          if ((element.attributes.class || '').split(' ').includes(part.slice(1))) return element;
          continue;
        }
        const attribute = /^([a-z]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(part);
        if (attribute) {
          if ((!attribute[1] || attribute[1] === element.tagName)
            && Object.hasOwn(element.attributes, attribute[2])
            && (attribute[3] === undefined || element.attributes[attribute[2]] === attribute[3])) return element;
        } else if (part === element.tagName) return element;
      }
    }
    return null;
  }
}

type Finger = { identifier: number; clientX: number; clientY: number };
type GestureEvent = {
  type: string;
  target: Surface;
  touches: Finger[];
  cancelable: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
};
type Listener = (event: any) => void;

function environment(mobile = true, appearance = 'product') {
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const root = new Surface('html');
  root.dataset.appearance = appearance;
  const body = new Surface('body', root);
  const surface = new Surface('main', body);
  const viewport = { content: 'width=device-width, initial-scale=1' };
  const listeners = new Map<string, Set<Listener>>();
  const mediaListeners = new Set<Listener>();
  const media = {
    matches: mobile,
    addEventListener: (_type: string, handler: Listener) => mediaListeners.add(handler),
    removeEventListener: (_type: string, handler: Listener) => mediaListeners.delete(handler),
  };
  const window = {
    innerWidth: 390,
    addEventListener: (type: string, handler: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener: (type: string, handler: Listener) => listeners.get(type)?.delete(handler),
  };
  const globals = {
    document: { documentElement: root, body, querySelector: () => viewport },
    window,
    Element: Surface,
    matchMedia: () => media,
    getComputedStyle: (element: Surface) => ({ overflowX: element.overflowX, direction: element.direction }),
  };
  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  const remove = installMobileViewport();
  function dispatch(type: string, target = surface, touches: Finger[] = [], cancelable = true) {
    const event: GestureEvent = { type, target, touches, cancelable, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const listener of listeners.get(type) || []) listener(event);
    return event;
  }
  const finger = (x: number, y: number, identifier = 7): Finger => ({ identifier, clientX: x, clientY: y });
  return {
    root, body, surface, viewport, media, listeners, mediaListeners, dispatch, remove,
    start: (x = 180, y = 100, target = surface, identifier = 7) => dispatch('touchstart', target, [finger(x, y, identifier)]),
    move: (x: number, y = 100, target = surface, identifier = 7) => dispatch('touchmove', target, [finger(x, y, identifier)]),
    mediaChange(matches: boolean) { media.matches = matches; for (const listener of mediaListeners) listener({}); },
    restore() {
      remove();
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

test('product background blocks left/right page drags after intentional movement', () => {
  const env = environment();
  try {
    for (const destination of [100, 260]) {
      assert.equal(env.start().defaultPrevented, false, 'center touch remains a normal tap');
      assert.equal(env.move(184).defaultPrevented, false, 'touch jitter is ignored');
      assert.equal(env.move(destination).defaultPrevented, true);
    }
    env.start();
    const nonCancelable = env.dispatch('touchmove', env.surface, [{ identifier: 7, clientX: 260, clientY: 100 }], false);
    assert.equal(nonCancelable.defaultPrevented, false);
  } finally { env.restore(); }
});

test('vertical scrolling stays native and keeps its intent during diagonal drift', () => {
  const env = environment();
  try {
    env.start();
    assert.equal(env.move(181, 140).defaultPrevented, false);
    assert.equal(env.move(250, 180).defaultPrevented, false);
  } finally { env.restore(); }
});

test('horizontal rails consume both directions and cannot chain past either edge', () => {
  const env = environment();
  const rail = new Surface('div', env.surface);
  rail.overflowX = 'auto'; rail.clientWidth = 200; rail.scrollWidth = 600;
  const child = new Surface('button', rail);
  try {
    rail.scrollLeft = 200;
    env.start(180, 100, child);
    assert.equal(env.move(220, 100, child).defaultPrevented, false);
    assert.equal(env.move(140, 100, child).defaultPrevented, false, 'reversing within a rail remains native');
    rail.scrollLeft = 0;
    assert.equal(env.move(200, 100, child).defaultPrevented, true, 'dragging beyond left edge does not move the page');
    rail.scrollLeft = 400;
    assert.equal(env.move(100, 100, child).defaultPrevented, true, 'dragging beyond right edge does not move the page');
  } finally { env.restore(); }
});

test('RTL rails normalize negative scrollLeft and contain Safari rubber-band values', () => {
  const env = environment();
  const rail = new Surface('div', env.surface);
  rail.overflowX = 'scroll'; rail.clientWidth = 200; rail.scrollWidth = 600; rail.direction = 'rtl';
  try {
    rail.scrollLeft = -200;
    env.start(180, 100, rail);
    assert.equal(env.move(220, 100, rail).defaultPrevented, false);
    rail.scrollLeft = -410;
    assert.equal(env.move(260, 100, rail).defaultPrevented, true);
    rail.scrollLeft = 10;
    assert.equal(env.move(140, 100, rail).defaultPrevented, true);
  } finally { env.restore(); }
});

test('a nested rail can delegate to a consumable horizontal parent', () => {
  const env = environment();
  const outer = new Surface('div', env.surface);
  outer.overflowX = 'auto'; outer.clientWidth = 200; outer.scrollWidth = 600; outer.scrollLeft = 200;
  const inner = new Surface('div', outer);
  inner.overflowX = 'auto'; inner.clientWidth = 100; inner.scrollWidth = 200;
  try {
    env.start(180, 100, inner);
    assert.equal(env.move(230, 100, inner).defaultPrevented, false);
    outer.scrollLeft = 0;
    assert.equal(env.move(270, 100, inner).defaultPrevented, true);
  } finally { env.restore(); }
});

test('blank narrow edge starts are canceled while edge buttons and real rails remain usable', () => {
  const env = environment();
  try {
    assert.equal(env.start(4).defaultPrevented, true);
    assert.equal(env.start(386).defaultPrevented, true);
    assert.equal(env.start(20).defaultPrevented, false);
    const button = new Surface('button', env.surface);
    const glyph = new Surface('svg', button);
    assert.equal(env.start(4, 100, glyph).defaultPrevented, false);
    const link = new Surface('a', env.surface, { href: '#/help' });
    assert.equal(env.start(386, 100, link).defaultPrevented, false);
    const focusable = new Surface('div', env.surface, { tabindex: '0' });
    assert.equal(env.start(4, 100, focusable).defaultPrevented, false);
    const dialog = new Surface('dialog', env.body, { tabindex: '-1' });
    assert.equal(env.start(4, 100, new Surface('div', dialog)).defaultPrevented, true);
    const rail = new Surface('div', env.surface);
    rail.overflowX = 'auto'; rail.clientWidth = 200; rail.scrollWidth = 600;
    assert.equal(env.start(4, 100, rail).defaultPrevented, false);
  } finally { env.restore(); }
});

test('map, editable, native form and explicit gallery surfaces keep horizontal interaction', () => {
  const env = environment();
  try {
    for (const surface of [
      new Surface('div', env.surface, { class: 'leaflet-container' }),
      new Surface('input', env.surface, { type: 'range' }),
      new Surface('input', env.surface, { type: 'text' }),
      new Surface('select', env.surface), new Surface('textarea', env.surface),
      new Surface('div', env.surface, { contenteditable: 'true' }),
      new Surface('div', env.surface, { contenteditable: '' }),
      new Surface('div', env.surface, { contenteditable: 'plaintext-only' }),
      new Surface('div', env.surface, { 'data-horizontal-gesture': 'gallery' }),
    ]) {
      const child = new Surface('span', surface);
      assert.equal(env.start(4, 100, child).defaultPrevented, false);
      assert.equal(env.move(100, 100, child).defaultPrevented, false);
    }
  } finally { env.restore(); }
});

test('public/mobile and product/desktop keep their existing one-finger browser behavior', () => {
  for (const [mobile, appearance] of [[true, 'public'], [false, 'product']] as const) {
    const env = environment(mobile, appearance);
    try {
      assert.equal(env.start(4).defaultPrevented, false);
      assert.equal(env.move(200).defaultPrevented, false);
    } finally { env.restore(); }
  }
});

test('end, cancellation, changed touch identity and route/media updates discard stale pans', () => {
  const env = environment();
  try {
    for (const event of ['touchend', 'touchcancel', 'pageshow']) {
      env.start(); env.dispatch(event);
      assert.equal(env.move(260).defaultPrevented, false, event);
    }
    env.start();
    assert.equal(env.move(260, 100, env.surface, 99).defaultPrevented, false);
    assert.equal(env.move(280).defaultPrevented, false, 'original identifier cannot revive a discarded pan');
    env.start(); env.mediaChange(false); env.mediaChange(true);
    assert.equal(env.move(260).defaultPrevented, false);
    env.start(); env.root.dataset.appearance = 'public';
    assert.equal(env.move(260).defaultPrevented, false);
    env.root.dataset.appearance = 'product';
    assert.equal(env.move(280).defaultPrevented, false, 'a route change cannot revive a stale product pan');
    const detached = new Surface('div', env.surface);
    env.start(180, 100, detached); detached.isConnected = false;
    assert.equal(env.move(260, 100, detached).defaultPrevented, false);
  } finally { env.restore(); }
});

test('existing pinch prevention remains mobile-only and exempts maps', () => {
  const env = environment();
  const fingers = [{ identifier: 1, clientX: 100, clientY: 100 }, { identifier: 2, clientX: 200, clientY: 100 }];
  try {
    env.start();
    assert.equal(env.dispatch('touchmove', env.surface, fingers).defaultPrevented, true);
    assert.equal(env.move(260).defaultPrevented, false, 'multi-touch resets one-finger tracking');
    const map = new Surface('div', env.surface, { class: 'leaflet-container' });
    assert.equal(env.dispatch('touchmove', map, fingers).defaultPrevented, false);
    assert.equal(env.dispatch('gesturestart', env.surface).defaultPrevented, true);
    assert.equal(env.dispatch('gesturechange', map).defaultPrevented, false);
    env.mediaChange(false);
    assert.equal(env.dispatch('touchmove', env.surface, fingers).defaultPrevented, false);
  } finally { env.restore(); }
});

test('cleanup removes every listener and restores the original viewport', () => {
  const env = environment();
  try {
    assert.equal(env.root.dataset.mobileViewport, 'locked');
    assert.match(env.viewport.content, /maximum-scale=1/);
    env.start();
    env.remove();
    assert.equal(env.viewport.content, 'width=device-width, initial-scale=1');
    assert.equal(env.root.dataset.mobileViewport, undefined);
    assert.equal([...env.listeners.values()].reduce((count, values) => count + values.size, 0), 0);
    assert.equal(env.mediaListeners.size, 0);
    assert.equal(env.move(260).defaultPrevented, false);
  } finally { env.restore(); }
});
