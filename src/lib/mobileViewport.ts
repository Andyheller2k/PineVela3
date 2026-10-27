const MOBILE_VIEWPORT = '(max-width: 1023px), (hover: none) and (pointer: coarse)';
const MAP_SURFACE = '.leaflet-container';
const NATIVE_GESTURE_SURFACE = `${MAP_SURFACE}, input, select, textarea, [data-horizontal-gesture], [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]`;
const EDGE_CONTROL = 'a[href], button, summary, label, [role="button"], [role="tab"], [role="slider"], [role="switch"], [role="checkbox"]';
const PAN_THRESHOLD = 8;
const EDGE_GUTTER = 16;

type HorizontalScroller = { element: Element; rtl: boolean };
type ProductPan = {
  identifier: number;
  target: Element;
  startX: number;
  startY: number;
  lastX: number;
  intent: 'pending' | 'horizontal' | 'vertical';
  scrollers: HorizontalScroller[];
};

/** Cache eligible rails once per gesture; viewport/page containers are not rails. */
function horizontalScrollers(target: Element, root: Element): HorizontalScroller[] {
  const scrollers: HorizontalScroller[] = [];
  for (let element: Element | null = target; element && element !== root && element !== document.body; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (/^(auto|scroll|overlay)$/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1) {
      scrollers.push({ element, rtl: style.direction === 'rtl' });
    }
  }
  return scrollers;
}

function canConsumeHorizontal(scrollers: HorizontalScroller[], fingerDelta: number) {
  return scrollers.some(({ element, rtl }) => {
    const maximum = element.scrollWidth - element.clientWidth;
    // WebKit can report positions beyond either edge during rubber-banding.
    const position = Math.max(0, Math.min(maximum, rtl ? maximum + element.scrollLeft : element.scrollLeft));
    return fingerDelta > 0 ? position > 1 : position < maximum - 1;
  });
}

/** Constrain the page viewport while preserving scrolling and map gestures. */
export function installMobileViewport() {
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport) return () => {};
  const original = viewport.content;
  const root = document.documentElement;
  const media = matchMedia(MOBILE_VIEWPORT);
  let pan: ProductPan | null = null;
  const resetPan = () => { pan = null; };
  const update = () => {
    resetPan();
    if (media.matches) {
      root.dataset.mobileViewport = 'locked';
      viewport.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';
    } else {
      delete root.dataset.mobileViewport;
      viewport.content = original;
    }
  };
  const insideMap = (target: EventTarget | null) => target instanceof Element && !!target.closest(MAP_SURFACE);
  const preventPageGesture = (event: Event) => {
    if (media.matches && !insideMap(event.target) && event.cancelable) event.preventDefault();
  };
  const handlePageTouchMove = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      resetPan();
      preventPageGesture(event);
      return;
    }
    if (!media.matches || root.dataset.appearance !== 'product') { resetPan(); return; }
    if (!pan) return;
    if (!pan.target.isConnected) { resetPan(); return; }
    const touch = Array.from(event.touches).find(value => value.identifier === pan.identifier);
    if (!touch) { resetPan(); return; }
    const dx = touch.clientX - pan.startX;
    const dy = touch.clientY - pan.startY;
    const stepX = touch.clientX - pan.lastX;
    pan.lastX = touch.clientX;
    if (pan.intent === 'pending') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < PAN_THRESHOLD) return;
      pan.intent = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (pan.intent === 'horizontal' && stepX && !canConsumeHorizontal(pan.scrollers, stepX) && event.cancelable) event.preventDefault();
  };
  const startProductPan = (event: TouchEvent) => {
    resetPan();
    if (!media.matches || root.dataset.appearance !== 'product' || event.touches.length !== 1 || !(event.target instanceof Element)) return;
    const target = event.target;
    if (target.closest(NATIVE_GESTURE_SURFACE)) return;
    const touch = event.touches[0];
    const scrollers = horizontalScrollers(target, root);
    pan = { identifier: touch.identifier, target, startX: touch.clientX, startY: touch.clientY, lastX: touch.clientX, intent: 'pending', scrollers };
    const width = root.clientWidth || window.innerWidth;
    const atEdge = touch.clientX <= EDGE_GUTTER || touch.clientX >= width - EDGE_GUTTER;
    // iOS can claim a history swipe before touchmove. Only blank edge gutters
    // opt out at touchstart; edge controls and real scrolling rails stay usable.
    const focusable = target.closest<HTMLElement>('[tabindex]');
    const interactive = target.closest(EDGE_CONTROL) || (focusable && focusable.tabIndex >= 0);
    if (atEdge && scrollers.length === 0 && !interactive && event.cancelable) event.preventDefault();
  };
  const options = { capture: true, passive: false } as const;
  update();
  media.addEventListener('change', update);
  window.addEventListener('pageshow', update);
  window.addEventListener('touchstart', startProductPan, options);
  window.addEventListener('touchmove', handlePageTouchMove, options);
  window.addEventListener('touchend', resetPan, true);
  window.addEventListener('touchcancel', resetPan, true);
  window.addEventListener('gesturestart', preventPageGesture, options);
  window.addEventListener('gesturechange', preventPageGesture, options);
  return () => {
    media.removeEventListener('change', update);
    window.removeEventListener('pageshow', update);
    window.removeEventListener('touchstart', startProductPan, true);
    window.removeEventListener('touchmove', handlePageTouchMove, true);
    window.removeEventListener('touchend', resetPan, true);
    window.removeEventListener('touchcancel', resetPan, true);
    window.removeEventListener('gesturestart', preventPageGesture, true);
    window.removeEventListener('gesturechange', preventPageGesture, true);
    delete root.dataset.mobileViewport;
    resetPan();
    viewport.content = original;
  };
}
