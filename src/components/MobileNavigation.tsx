import { useEffect, useId, useState } from 'react';
import { Ellipsis, LockKeyhole, X, type LucideIcon } from 'lucide-react';
import DashboardOverlay from './DashboardOverlay';

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

/** Keep frequent destinations within thumb reach; reveal secondary work by group. */
export default function MobileNavigation({ items, activeTab, onSelect, primaryIds, label, visibility = 'lg:hidden' }: {
  items: readonly MobileDestination[];
  activeTab: string;
  onSelect: (id: string) => void;
  primaryIds?: readonly string[];
  label: string;
  visibility?: 'lg:hidden' | 'sm:hidden';
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const primary = items.length <= 5 ? items : primaryIds ? primaryIds.map(id => items.find(item => item.id === id)).filter((item): item is MobileDestination => !!item).slice(0, 4) : items.slice(0, 4);
  const secondary = items.filter(item => !primary.some(p => p.id === item.id));
  const secondaryActive = secondary.some(item => item.id === activeTab);
  const secondaryCount = secondary.reduce((sum, item) => sum + Math.max(0, item.badge || 0), 0);
  const groups = [...new Set(secondary.map(item => item.group || 'Other destinations'))];
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
  return <>
    <nav aria-label={label} data-managed-mobile-navigation className={`mobile-bottom-nav ux-mobile-navigation fixed z-40 ${visibility}`}>
      <div data-mobile-nav-items className="flex items-center px-1 py-2">
        {primary.map(item => <button key={item.id} type="button" data-page-tabs data-navigation-id={item.id}
          aria-label={`${item.label}${item.badge ? ` (${item.badge})` : item.hasUpdates ? ' (updates available)' : ''}`} aria-current={activeTab === item.id ? 'page' : undefined}
          disabled={item.locked} onClick={() => choose(item)}
          className={`ux-mobile-destination ${activeTab === item.id ? 'text-blue-700 bg-blue-100/65' : 'text-slate-500'} ${item.isRed || item.isBeamingRed ? 'ux-nav-urgent' : ''}`}>
          <span className="relative inline-flex"><item.icon aria-hidden="true" size={20} />{badge(item.badge)}{item.hasUpdates && !item.badge && <span aria-hidden="true" className="ux-nav-update-dot" />}{item.locked && <LockKeyhole className="absolute -right-2 -bottom-1" size={10} />}</span>
          <span>{item.label}</span>
        </button>)}
        {!!secondary.length && <button type="button" data-page-tabs data-navigation-id="more" aria-label={`More navigation${secondaryCount ? ` (${secondaryCount})` : ''}`}
          aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-current={secondaryActive ? 'page' : undefined}
          onClick={() => setOpen(true)} className={`ux-mobile-destination ${secondaryActive ? 'text-blue-700 bg-blue-100/65' : 'text-slate-500'}`}>
          <span className="relative inline-flex"><Ellipsis size={20} aria-hidden="true" />{badge(secondaryCount)}</span><span>More</span>
        </button>}
      </div>
    </nav>
    {open && <DashboardOverlay id={menuId} aria-label={`${label}: more destinations`} onClose={() => setOpen(false)} className="ux-more-overlay flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
      <section className="ux-more-panel w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-3xl border border-blue-200 bg-white p-5 text-slate-900 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xl font-bold">More</h2><button type="button" aria-label="Close navigation menu" onClick={() => setOpen(false)} className="rounded-xl p-2 text-slate-600"><X aria-hidden="true" size={20} /></button></div>
        {groups.map(group => <section key={group} aria-label={group} className="space-y-2 mb-5 last:mb-0"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3><div className="grid gap-2">{secondary.filter(item => (item.group || 'Other destinations') === group).map(item => <button key={item.id} type="button" data-page-tabs data-navigation-id={item.id}
          aria-label={`${item.label}${item.badge ? ` (${item.badge})` : item.hasUpdates ? ' (updates available)' : ''}`} aria-current={activeTab === item.id ? 'page' : undefined} disabled={item.locked} onClick={() => choose(item)}
          className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 text-left text-sm font-semibold ${activeTab === item.id ? 'border-blue-400 bg-blue-100 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-700'} ${item.isRed || item.isBeamingRed ? 'ux-nav-urgent' : ''}`}>
          <item.icon aria-hidden="true" size={20} /><span className="flex-1">{item.label}</span>{item.locked ? <span className="flex items-center gap-1 text-xs"><LockKeyhole size={14} />Locked</span> : item.badge && item.badge > 0 ? <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs text-white">{item.badge}</span> : null}
        </button>)}</div></section>)}
      </section>
    </DashboardOverlay>}
  </>;
}
