import { useId } from 'react';
import { LockKeyhole, LogOut, PanelLeftOpen } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { MobileDestination } from './MobileNavigation';
import HelpLink from './HelpLink';
import PineLogo from './PineLogo';
import '../compactSidebar.css';

/** A compact side rail; destinations and their access rules remain page-owned. */
export default function CompactSidebarNavigation({ id, label, items, activeTab, onSelect, onExpand, onSignOut }: {
  id: string;
  label: string;
  items: readonly MobileDestination[];
  activeTab: string;
  onSelect: (id: string) => void;
  onExpand: () => void;
  onSignOut: () => void;
}) {
  const selectionId = useId();
  const reducedMotion = useReducedMotion();
  return <aside id={id} data-portal-navigation="sidebar" data-sidebar-collapsed="true" aria-label={label} className="pv-compact-sidebar hidden lg:flex">
    <div className="pv-sidebar-heading">
      <PineLogo size={30} hideText />
      <button type="button" data-sidebar-toggle aria-controls={id} aria-expanded="false" aria-label="Expand sidebar" title="Expand sidebar" onClick={onExpand}><PanelLeftOpen size={20} aria-hidden="true" /></button>
    </div>
    <nav aria-label={`${label} destinations`} className="pv-sidebar-list">
      {items.map(item => {
        const selected = item.id === activeTab;
        const updates = item.hasUpdates || item.isRed || item.isBeamingRed;
        const accessibleLabel = `${item.label}${item.locked ? ' (locked)' : item.badge ? ` (${item.badge})` : updates ? ' (updates available)' : ''}`;
        return <button key={item.id} type="button" data-navigation-id={item.id} aria-label={accessibleLabel} title={accessibleLabel} aria-current={selected ? 'page' : undefined}
          disabled={item.locked} onClick={() => { if (!item.locked) onSelect(item.id); }} className="pv-sidebar-destination">
          {selected && <motion.span aria-hidden="true" className="pv-sidebar-highlight" layoutId={`compact-sidebar-${selectionId}`} initial={false} transition={{ duration: reducedMotion ? 0 : .25, ease: [.33, 0, .67, 1] }} />}
          <span className="pv-sidebar-icon"><item.icon size={25} aria-hidden="true" />
            {item.badge && item.badge > 0 ? <span aria-hidden="true" className="ux-nav-badge">{item.badge > 99 ? '99+' : item.badge}</span> : updates ? <span aria-hidden="true" className="ux-nav-update-dot" /> : null}
            {item.locked && <LockKeyhole size={11} className="pv-sidebar-lock" aria-hidden="true" />}
          </span>
          <span className="pv-sidebar-label">{item.label}</span>
        </button>;
      })}
    </nav>
    <div className="pv-sidebar-footer">
      <HelpLink compact />
      <button type="button" aria-label="Sign out" title="Sign out" onClick={onSignOut}><LogOut size={20} aria-hidden="true" /></button>
    </div>
  </aside>;
}
