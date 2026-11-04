import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Ellipsis, LockKeyhole, Plus, X, type LucideIcon } from 'lucide-react';
import DashboardOverlay from './DashboardOverlay';
import '../mobileNavigation.css';

export interface MobileDestination {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number | null;
  hasUpdates?: boolean;
  locked?: boolean;
  isRed?: boolean;
  isBeamingRed?: boolean;
  group?: string;
}

const itemHasUpdates = (item: MobileDestination) => !!(item.hasUpdates || item.isRed || item.isBeamingRed);

/** Keep frequent destinations within thumb reach; reveal secondary work by group. */
export default function MobileNavigation({ items, activeTab, onSelect, primaryIds, label, visibility = 'lg:hidden', trailingContent, className = '', centralAction, dialogTheme }: {
  items: readonly MobileDestination[];
  activeTab: string;
  onSelect: (id: string) => void;
  primaryIds?: readonly string[];
  label: string;
  visibility?: 'lg:hidden' | 'sm:hidden';
  trailingContent?: ReactNode;
  className?: string;
  animatedSelection?: boolean;
  centralAction?: { label: string; onClick: () => void; icon?: LucideIcon; disabled?: boolean };
  dialogTheme?: 'market';
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const navRef = useRef<HTMLElement>(null);
  const primaryLimit = centralAction ? (items.length > 4 ? 3 : 4) : (items.length > 5 ? 4 : 5);
  const primary = primaryIds && (centralAction || items.length > 5)
    ? primaryIds.map(id => items.find(item => item.id === id)).filter((item): item is MobileDestination => !!item).slice(0, primaryLimit)
    : items.slice(0, primaryLimit);
  const secondary = items.filter(item => !primary.some(p => p.id === item.id));
  const secondaryActive = secondary.some(item => item.id === activeTab);
  const secondaryCount = secondary.reduce((sum, item) => sum + Math.max(0, item.badge || 0), 0);
  const secondaryHasUpdates = secondary.some(itemHasUpdates);
  const groups = [...new Set(secondary.map(item => item.group || 'Other destinations'))];
  const hasCentralAction = !!centralAction;
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const itemsElement = nav.querySelector<HTMLElement>('[data-mobile-nav-items]')!;
    const surface = nav.querySelector<SVGSVGElement>('.pv-nav-surface')!;
    const indicator = nav.querySelector<HTMLElement>('.pv-nav-indicator')!;
    const sideHighlight = nav.querySelector<HTMLElement>('.pv-nav-side-highlight');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let previousWidth = 0, previousHeight = 0, previousCount = 0, previousTarget = 0;
    let previousDestination = '';
    const measure = (snap = false) => {
      if (!nav.getClientRects().length || !nav.clientWidth) return;
      const buttons = [...itemsElement.querySelectorAll<HTMLButtonElement>('.ux-mobile-destination')];
      const selected = buttons.find(button => button.dataset.navActive === 'true') || buttons.find(button => button.getAttribute('aria-current') === 'page');
      const destination = selected?.dataset.navigationId || '';
      const target = hasCentralAction ? buttons.find(button => button.hasAttribute('data-mobile-central-action')) : selected;
      const bounds = nav.getBoundingClientRect(), width = nav.clientWidth, height = nav.clientHeight;
      const centerOf = (button: HTMLButtonElement) => { const rect = button.getBoundingClientRect(); return rect.left - bounds.left + rect.width / 2; };
      const next = target ? centerOf(target) : 0;
      const geometryChanged = previousWidth !== width || previousHeight !== height || previousCount !== buttons.length;
      nav.dataset.activeDestination = destination;
      nav.dataset.hasSelection = String(!!selected);
      buttons.forEach(button => { if (button === selected) button.dataset.navSelected = 'true'; else delete button.dataset.navSelected; });
      if (!snap && !geometryChanged && destination === previousDestination && next === previousTarget) return;
      // A fixed notch on a clipped wide plane needs only transform animation,
      // avoiding a JavaScript/SVG path update on every animation frame.
      const planeWidth = width * 3, center = planeWidth / 2;
      const cutout = `M0 32H${center - 43}C${center - 33} 32 ${center - 35} 66 ${center} 66C${center + 35} 66 ${center + 33} 32 ${center + 43} 32H${planeWidth}V${height}H0Z`;
      const flat = `M0 32H${planeWidth}V${height}H0Z`;
      surface.setAttribute('viewBox', `0 0 ${planeWidth} ${height}`);
      surface.style.width = `${planeWidth}px`;
      surface.querySelectorAll('path').forEach(path => path.setAttribute('d', next > 0 ? cutout : flat));
      const instant = snap || geometryChanged || reducedMotion.matches || !previousTarget || !next;
      for (const element of [surface, indicator, ...(sideHighlight ? [sideHighlight] : [])]) element.style.transitionDuration = instant ? '0ms' : '';
      surface.style.transform = `translate3d(${next - center}px, 0, 0)`;
      indicator.style.transform = `translate3d(${next - 29}px, 0, 0)`;
      if (sideHighlight && selected) sideHighlight.style.transform = `translate3d(${centerOf(selected) - 24}px, 0, 0)`;
      previousDestination = destination; previousWidth = width; previousHeight = height;
      previousCount = buttons.length; previousTarget = next;
    };
    const resize = new ResizeObserver(() => measure());
    resize.observe(nav);
    const changes = new MutationObserver(() => measure());
    changes.observe(itemsElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'data-nav-active'] });
    const preferenceChanged = () => measure(reducedMotion.matches);
    reducedMotion.addEventListener('change', preferenceChanged);
    measure(true);
    return () => { resize.disconnect(); changes.disconnect(); reducedMotion.removeEventListener('change', preferenceChanged); };
  }, [hasCentralAction]);
  useEffect(() => {
    const query = matchMedia(visibility === 'sm:hidden' ? '(min-width: 640px)' : '(min-width: 1024px)');
    const close = () => { if (query.matches) setOpen(false); };
    query.addEventListener('change', close);
    return () => query.removeEventListener('change', close);
  }, [visibility]);
  const choose = (item: MobileDestination) => {
    if (item.locked) return;
    setOpen(false);
    onSelect(item.id);
  };
  const badge = (count?: number | null) => count && count > 0 ? <span aria-hidden="true" className="ux-nav-badge">{count > 99 ? '99+' : count}</span> : null;
  const destinations: ReactNode[] = primary.map(item => <button key={item.id} type="button" data-page-tabs data-navigation-id={item.id}
    aria-label={`${item.label}${item.badge ? ` (${item.badge})` : itemHasUpdates(item) ? ' (updates available)' : ''}`} aria-current={activeTab === item.id ? 'page' : undefined}
    disabled={item.locked} onClick={() => choose(item)} className={`ux-mobile-destination ${item.isRed || item.isBeamingRed ? 'ux-nav-urgent' : ''}`}>
    <span className="pv-nav-icon"><item.icon aria-hidden="true" size={25} />{badge(item.badge)}{itemHasUpdates(item) && !item.badge && <span aria-hidden="true" className="ux-nav-update-dot" />}{item.locked && <LockKeyhole className="pv-nav-lock" size={10} />}</span>
    <span className="pv-nav-label">{item.label}</span>
  </button>);
  if (secondary.length) destinations.push(<button key="more" type="button" data-page-tabs data-navigation-id="more" aria-label={`More navigation${secondaryCount ? ` (${secondaryCount})` : secondaryHasUpdates ? ' (updates available)' : ''}`}
    aria-haspopup="dialog" aria-expanded={open} data-nav-active={open || undefined} aria-controls={open ? menuId : undefined} aria-current={secondaryActive ? 'page' : undefined}
    onClick={() => setOpen(true)} className="ux-mobile-destination">
    <span className="pv-nav-icon"><Ellipsis size={25} aria-hidden="true" />{badge(secondaryCount)}{secondaryHasUpdates && !secondaryCount && <span aria-hidden="true" className="ux-nav-update-dot" />}</span><span className="pv-nav-label">More</span>
  </button>);
  if (centralAction) {
    const ActionIcon = centralAction.icon || Plus;
    destinations.splice(Math.ceil(destinations.length / 2), 0, <button key="quick-action" type="button" data-navigation-id="quick-action" data-mobile-central-action aria-label={centralAction.label}
      aria-haspopup="dialog" disabled={centralAction.disabled} onClick={centralAction.onClick} className="ux-mobile-destination pv-nav-central-action">
      <span className="pv-nav-icon"><ActionIcon size={29} aria-hidden="true" /></span><span className="pv-nav-label">{centralAction.label}</span>
    </button>);
  }
  return <>
    <nav ref={navRef} data-portal-navigation="mobile" aria-label={label} data-managed-mobile-navigation data-curved-navigation={centralAction ? 'action' : 'standard'} data-animated-navigation className={`mobile-bottom-nav ux-mobile-navigation pv-bottom-navigation fixed z-40 ${visibility} ${className}`}>
      <div className="pv-nav-surface-viewport" aria-hidden="true"><svg className="pv-nav-surface" preserveAspectRatio="none" focusable="false"><path /><path className="pv-nav-edge" /></svg></div>
      <span className="pv-nav-indicator" aria-hidden="true" />
      {centralAction && <span className="pv-nav-side-highlight" aria-hidden="true" />}
      <div data-mobile-nav-items>
        {destinations}
        {trailingContent}
      </div>
    </nav>
    {open && <DashboardOverlay data-market-dialog={dialogTheme==='market'||undefined} id={menuId} aria-label={`${label}: more destinations`} onClose={() => setOpen(false)} className="ux-more-overlay flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
      <section data-portal-navigation="menu" className="ux-more-panel w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-3xl border border-blue-200 bg-white p-5 text-slate-900 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xl font-bold">More</h2><button type="button" aria-label="Close navigation menu" onClick={() => setOpen(false)} className="rounded-xl p-2 text-slate-600"><X aria-hidden="true" size={20} /></button></div>
        {groups.map(group => <section key={group} aria-label={group} className="space-y-2 mb-5 last:mb-0"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3><div className="grid gap-2">{secondary.filter(item => (item.group || 'Other destinations') === group).map(item => <button key={item.id} type="button" data-page-tabs data-navigation-id={item.id}
          aria-label={`${item.label}${item.badge ? ` (${item.badge})` : itemHasUpdates(item) ? ' (updates available)' : ''}`} aria-current={activeTab === item.id ? 'page' : undefined} disabled={item.locked} onClick={() => choose(item)}
          className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 text-left text-sm font-semibold ${activeTab === item.id ? 'border-blue-400 bg-blue-100 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-700'} ${item.isRed || item.isBeamingRed ? 'ux-nav-urgent' : ''}`}>
          <item.icon aria-hidden="true" size={20} /><span className="flex-1">{item.label}</span>{item.locked ? <span className="flex items-center gap-1 text-xs"><LockKeyhole size={14} />Locked</span> : item.badge && item.badge > 0 ? <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs text-white">{item.badge}</span> : itemHasUpdates(item) ? <span aria-hidden="true" className="ux-nav-update-dot" style={{ position: 'static', flexShrink: 0 }} /> : null}
        </button>)}</div></section>)}
      </section>
    </DashboardOverlay>}
  </>;
}
