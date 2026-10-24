const MOBILE_VIEWPORT = '(max-width: 1023px), (hover: none) and (pointer: coarse)';
const MAP_SURFACE = '.leaflet-container';

/** Constrain the page viewport while preserving scrolling and map gestures. */
export function installMobileViewport() {
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport) return () => {};
  const original = viewport.content;
  const root = document.documentElement;
  const media = matchMedia(MOBILE_VIEWPORT);
  const update = () => {
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
  const preventPagePinch = (event: TouchEvent) => {
    if (event.touches.length > 1) preventPageGesture(event);
  };
  const options = { capture: true, passive: false } as const;
  update();
  media.addEventListener('change', update);
  window.addEventListener('pageshow', update);
  window.addEventListener('touchmove', preventPagePinch, options);
  window.addEventListener('gesturestart', preventPageGesture, options);
  window.addEventListener('gesturechange', preventPageGesture, options);
  return () => {
    media.removeEventListener('change', update);
    window.removeEventListener('pageshow', update);
    window.removeEventListener('touchmove', preventPagePinch, true);
    window.removeEventListener('gesturestart', preventPageGesture, true);
    window.removeEventListener('gesturechange', preventPageGesture, true);
    delete root.dataset.mobileViewport;
    viewport.content = original;
  };
}
