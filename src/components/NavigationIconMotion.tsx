import { useEffect } from 'react';
import '../navigationIconMotion.css';

const navigation = 'nav,[role="navigation"],[role="tablist"],[data-portal-navigation],#public-header,.login-header,header.sticky,header.fixed,.pv-companion-launcher';
const interactive = 'button,a[href],[role="button"],[role="tab"]';
const unavailable = '[hidden],[inert],[aria-disabled="true"],:disabled';
const decoration = '[data-avatar-preset],.pinevela-brand,[role="img"],.theme-toggle-track,.ux-nav-badge,.top-nav-badge';
const cooldown = 460;

function visible(element: Element) {
  if (!element.isConnected || element.closest(unavailable) || !element.getClientRects().length) return false;
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.visibility !== 'collapse' && Number(style.opacity) !== 0;
}

function controlFor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest<HTMLElement>(interactive);
  return control?.closest(navigation) && !control.closest('[aria-hidden="true"]') && visible(control) ? control : null;
}

function iconFor(control: HTMLElement): SVGSVGElement | undefined {
  return [...control.querySelectorAll<SVGSVGElement>('svg.lucide')].find(icon =>
    icon.closest(interactive) === control && !icon.closest(decoration) && visible(icon) &&
    !icon.closest('.animate-spin,[role="progressbar"],[aria-busy="true"]') &&
    ![...icon.classList].some(name => /^(?:animate-spin|lucide-loader|lucide-loading|lucide-spinner)/.test(name))
  );
}

/** SVG transforms leave the button, highlight, badge, and surrounding layout still. */
function gesture(name: string): { transforms: string[]; duration: number } {
  if (/settings|cog/.test(name)) return { transforms: ['rotate(0deg)', 'rotate(65deg)', 'rotate(-8deg)', 'rotate(0deg)'], duration: 420 };
  if (/bell/.test(name)) return { transforms: ['rotate(0deg)', 'rotate(-15deg)', 'rotate(12deg)', 'rotate(-7deg)', 'rotate(0deg)'], duration: 420 };
  if (/key|lock/.test(name)) return { transforms: ['rotate(0deg)', 'rotate(-22deg)', 'rotate(8deg)', 'rotate(0deg)'], duration: 380 };
  if (/log-out|log-in|door/.test(name)) return { transforms: ['translateX(0)', 'translateX(3px)', 'translateX(-1px)', 'translateX(0)'], duration: 340 };
  if (/house|home|building|landmark|hotel/.test(name)) return { transforms: ['translateY(0) scale(1)', 'translateY(-3px) scale(1.06)', 'translateY(0) scale(1)'], duration: 360 };
  if (/store|shop|package|box|truck|shopping/.test(name)) return { transforms: ['translateY(0) rotate(0deg)', 'translateY(-2px) rotate(-5deg)', 'rotate(3deg)', 'translateY(0) rotate(0deg)'], duration: 380 };
  if (/users?|contact|handshake/.test(name)) return { transforms: ['scale(1) rotate(0deg)', 'scale(1.08) rotate(-4deg)', 'rotate(3deg)', 'scale(1) rotate(0deg)'], duration: 360 };
  if (/shield|check|badge/.test(name)) return { transforms: ['scale(1)', 'scale(.94)', 'scale(1.08)', 'scale(1)'], duration: 340 };
  if (/message|mail|inbox/.test(name)) return { transforms: ['scale(1) rotate(0deg)', 'scale(.96) rotate(-4deg)', 'scale(1.08) rotate(2deg)', 'scale(1) rotate(0deg)'], duration: 380 };
  if (/help|circle-question|compass|info/.test(name)) return { transforms: ['rotate(0deg)', 'rotate(-12deg)', 'rotate(8deg)', 'rotate(0deg)'], duration: 380 };
  if (/sparkles|sun|moon|wand/.test(name)) return { transforms: ['scale(1) rotate(0deg)', 'scale(1.15) rotate(10deg)', 'scale(1) rotate(0deg)'], duration: 400 };
  if (/ellipsis|menu|panel|x$/.test(name)) return { transforms: ['scale(1)', 'scale(.86)', 'scale(1.08)', 'scale(1)'], duration: 320 };
  return { transforms: ['translateY(0) scale(1)', 'translateY(-2px) scale(1.08)', 'translateY(0) scale(1)'], duration: 340 };
}

/** Shared delegated interactions cover navigation mounted by lazy routes and menus. */
export default function NavigationIconMotion() {
  useEffect(() => {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const active = new Map<SVGSVGElement, { animation: Animation; control: HTMLElement }>();
    const lastPlayed = new WeakMap<HTMLElement, number>();
    let pointerControl: HTMLElement | null = null;

    const cancel = (icon: SVGSVGElement) => {
      const running = active.get(icon);
      if (!running) return;
      active.delete(icon);
      icon.removeAttribute('data-nav-icon-motion');
      running.animation.cancel();
    };
    const cancelAll = () => { for (const icon of active.keys()) cancel(icon); };
    const play = (control: HTMLElement | null, replacement = false) => {
      if (!control || reducedMotion.matches || !control.closest(navigation) || control.closest('[aria-hidden="true"]') || !visible(control)) return;
      const icon = iconFor(control);
      if (!icon || typeof icon.animate !== 'function' || active.has(icon)) return;
      const now = performance.now();
      if (!replacement && now - (lastPlayed.get(control) ?? -Infinity) < cooldown) return;
      lastPlayed.set(control, now);
      const name = [...icon.classList].find(value => value.startsWith('lucide-'))?.slice(7) || 'icon';
      const { transforms, duration } = gesture(name);
      icon.setAttribute('data-nav-icon-motion', '');
      const animation = icon.animate(transforms.map(transform => ({ transform })), {
        duration, iterations: 1, easing: 'cubic-bezier(.22,.7,.3,1)', composite: 'add',
      });
      animation.id = `pinevela-nav-${name}`;
      active.set(icon, { animation, control });
      const forget = () => {
        if (active.get(icon)?.animation !== animation) return;
        active.delete(icon);
        icon.removeAttribute('data-nav-icon-motion');
      };
      animation.addEventListener('finish', forget, { once: true });
      animation.addEventListener('cancel', forget, { once: true });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerControl = controlFor(event.target);
      play(pointerControl);
    };
    const onPointerCancel = () => { pointerControl = null; };
    const onClick = (event: MouseEvent) => {
      const control = controlFor(event.target);
      // Pointer down, focus, click and selected-state changes are one interaction.
      if (event.detail === 0 || control !== pointerControl) play(control);
      pointerControl = null;
    };
    const onFocus = (event: FocusEvent) => play(controlFor(event.target));
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'Enter' || event.key === ' ')) {
        pointerControl = null;
        play(controlFor(event.target));
      }
    };
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const control = controlFor(event.target);
      if (control && !(event.relatedTarget instanceof Node && control.contains(event.relatedTarget))) play(control);
    };
    const onMotionChange = () => { if (reducedMotion.matches) cancelAll(); };
    const onVisibility = () => { if (document.hidden) cancelAll(); };

    const observer = new MutationObserver(records => {
      // React may replace Menu with X, remove a menu, or switch navigation layouts.
      const replacements = new Set<HTMLElement>();
      for (const [icon, running] of active) {
        if (controlFor(running.control) !== running.control || iconFor(running.control) !== icon) {
          cancel(icon);
          if (running.control.isConnected && performance.now() - (lastPlayed.get(running.control) ?? -Infinity) < cooldown) replacements.add(running.control);
        }
      }
      for (const control of replacements) play(control, true);
      for (const record of records) {
        if (record.type !== 'attributes' || !(record.target instanceof HTMLElement)) continue;
        const attribute = record.attributeName!;
        const value = record.target.getAttribute(attribute);
        if (value === record.oldValue) continue;
        if ((attribute === 'aria-current' && value && value !== 'false') ||
          (['aria-selected', 'aria-pressed', 'aria-expanded'].includes(attribute) && value === 'true') || attribute === 'aria-checked') {
          play(controlFor(record.target));
        }
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true,
      attributeFilter: ['aria-current', 'aria-selected', 'aria-pressed', 'aria-expanded', 'aria-checked', 'aria-disabled', 'aria-busy', 'disabled', 'hidden', 'inert', 'aria-hidden'],
    });
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', onMotionChange);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotionChange);
      cancelAll();
      pointerControl = null;
    };
  }, []);
  return null;
}
