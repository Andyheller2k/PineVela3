import type { MobileDestination } from './MobileNavigation';
import { Bell, CheckCircle2, Home, Key, LogOut, Package, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import { activateOnKeyboard } from '../lib/keyboardActivation';
import HelpLink from './HelpLink';
import MobileNavigation from './MobileNavigation';
import NavigationHighlight from './NavigationHighlight';
import PineLogo from './PineLogo';
import TopNavBadge from './TopNavBadge';
import { renderAvatarGraphic } from './UserAvatarSelector';

export type UserDashboardDestination = MobileDestination & { sub: string };
export function userDashboardDestinations(hasRoom: boolean, roomDescription: string, unreadCount: number): UserDashboardDestination[] {
  return [
    { id: 'home', label: 'Home Tab', sub: 'Marketplace & residences', icon: Home },
    { id: 'digital-market', label: 'Purchases & Tracking', sub: 'Orders, Pickup & Delivery', icon: Package },
    { id: 'login-room', label: hasRoom ? 'Resident Room' : 'Log Into Your Room', sub: hasRoom ? roomDescription : 'Activate Digital Room Key', icon: Key },
    { id: 'notifications', label: 'Notifications Tab', sub: unreadCount ? `${unreadCount} New Alert${unreadCount > 1 ? 's' : ''}` : 'Bulletins & Alerts', icon: Bell },
    { id: 'options', label: 'Options Tab', sub: 'Profile & Settings', icon: Settings },
  ];
}

/** Presentation only: the page continues to own account data and navigation. */
export default function UserDashboardNavigation({
  items: navItems, activeTab, onSelect: handleNavClick, isSidebarHidden, onLayoutChange: setIsSidebarHidden,
  profile: currentUser, hostelName, unreadCount: unreadNotificationsCount, badgeFor: tabUnreadCount,
  navigationId, onCompanionTarget: setCompanionNavigationTarget, onSignOut,
}: {
  items: UserDashboardDestination[];
  activeTab: string;
  onSelect: (id: string) => void;
  isSidebarHidden: boolean;
  onLayoutChange: (hidden: boolean) => void;
  profile?: { avatar?: string; name?: string };
  hostelName?: string;
  unreadCount: number;
  badgeFor: (id: string) => number;
  navigationId: string;
  onCompanionTarget: (element: HTMLDivElement | null) => void;
  onSignOut: () => void;
}) {
  return <>
      {/* MOBILE HEADER (lg:hidden) */}
      <header data-portal-navigation="header" className="user-dashboard-header lg:hidden flex items-center justify-between px-5 py-3 bg-white/90 backdrop-blur-xl border-b border-sky-200/50 sticky top-0 z-40 shadow-xs">
        <div role="button" tabIndex={0} aria-label="Go to home" onKeyDown={activateOnKeyboard} className="user-dashboard-brand flex items-center gap-2 cursor-pointer" onClick={() => handleNavClick('home')}>
          <PineLogo size={28} hideText />
          <div>
            <h1 className="text-xs font-black tracking-tight text-blue-950 leading-tight">PineVela Portal</h1>
            <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{hostelName || 'PineVela Resident'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" data-navigation-id="notifications" aria-label={`Notifications${unreadNotificationsCount ? ` (${unreadNotificationsCount} unread)` : ''}`}
            aria-current={activeTab === 'notifications' ? 'page' : undefined} title="Notifications"
            onClick={() => handleNavClick('notifications')} className="user-header-alerts relative flex items-center justify-center rounded-xl">
            <Bell className="h-5 w-5" aria-hidden="true" /><TopNavBadge color="blue" count={unreadNotificationsCount} />
          </button>
          <button
            onClick={() => handleNavClick('options')}
            className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            title="Account Options & Profile"
          >
            {renderAvatarGraphic(currentUser?.avatar, "w-7 h-7 text-[10px]")}
          </button>
          <HelpLink compact className="!px-2" />
          <button
            onClick={() => onSignOut()} 
            className="flex items-center gap-1.5 px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
            <span className="user-header-signout-label">Sign Out</span>
          </button>
        </div>
      </header>

      {/* MOBILE BOTTOM NAV (lg:hidden) */}
      <MobileNavigation className="user-bottom-navigation" animatedSelection label="User navigation" activeTab={activeTab} onSelect={handleNavClick} items={navItems.filter(tab => tab.id !== 'notifications').map(tab => ({ ...tab, badge: tabUnreadCount(tab.id), label: tab.id === 'home' ? 'Home' : tab.id === 'digital-market' ? 'Purchases' : tab.id === 'login-room' ? 'Room' : 'Options' }))}
        trailingContent={<div ref={setCompanionNavigationTarget} className="pv-companion-nav-slot" />} />

      {/* Compact desktop equivalent of the mobile navigation. It stays above the scrolling content. */}
      {isSidebarHidden && (
        <nav data-portal-navigation="top" className="user-top-navigation hidden lg:block fixed top-3 inset-x-6 mx-auto z-50 max-w-[860px] bg-white/72 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg">
          <div className="flex items-center gap-1 px-2 py-1.5">
            {/* Profile avatar button — left end */}
            <button
              onClick={() => handleNavClick('options')}
              title="Profile & Settings"
              className="shrink-0 flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl transition-all cursor-pointer hover:bg-white/70"
            >
              {renderAvatarGraphic(currentUser?.avatar, 'w-6 h-6 text-[9px] ring-2 ring-white shadow-sm')}
              <span className="text-[9px] font-bold text-slate-500">Profile</span>
            </button>
            <div className="w-px h-6 bg-slate-200/70 shrink-0" />
            {navItems.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  data-user-navigation=""
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => handleNavClick(tab.id)}
                  title={tab.label}
                  className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all cursor-pointer ${isActive ? 'text-blue-700 bg-blue-100/65' : 'text-slate-500 hover:text-slate-800 hover:bg-white/70'}`}
                >
                  {isActive && <NavigationHighlight id={`top-${navigationId}`} />}
                  <span className="relative inline-flex"><Icon className="w-4 h-4" /><TopNavBadge color="blue" count={tabUnreadCount(tab.id)} /></span>
                  <span className="max-w-full truncate text-[9px] font-bold">{tab.id === 'digital-market' ? 'Purchases' : tab.id === 'notifications' ? 'Alerts' : tab.id === 'options' ? 'Options' : tab.label.split(' ')[0]}</span>
                </button>
              );
            })}
            <button
              onClick={() => onSignOut()}
              title="Sign Out"
              className="shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-[9px] font-bold">Sign Out</span>
            </button>
            <button onClick={() => setIsSidebarHidden(false)} title="Show sidebar" aria-controls="user-dashboard-sidebar" aria-expanded="false" className="shrink-0 p-2 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer">
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          <HelpLink compact className="!px-2" /></div>
        </nav>
      )}

      {/* Desktop sidebar */}
      <aside id="user-dashboard-sidebar" data-portal-navigation="sidebar" aria-label="User navigation sidebar" aria-hidden={isSidebarHidden || undefined} inert={isSidebarHidden || undefined} className="user-dashboard-sidebar hidden lg:flex w-72 p-6 my-6 ml-6 h-[calc(100vh-3rem)] bg-gradient-to-br from-sky-100/90 via-blue-100/85 to-amber-50/40 backdrop-blur-3xl border border-sky-200/80 shadow-2xl rounded-3xl flex flex-col justify-between shrink-0 overflow-y-auto z-10 relative">

        <div className="space-y-6">
          {/* Logo & Header */}
          <div className="flex items-center justify-between px-2">
            <div role="button" tabIndex={0} aria-label="Go to home" onKeyDown={activateOnKeyboard} className="flex items-center space-x-3 cursor-pointer" onClick={() => handleNavClick('home')}>
              <PineLogo size={36} hideText />
              <div>
                <h1 className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-blue-900 to-cyan-800 bg-clip-text text-transparent">PineVela Resident</h1>
                <p className="text-[10px] font-medium text-blue-600/70 uppercase tracking-widest">User Account</p>
              </div>
            </div>
            <button onClick={() => setIsSidebarHidden(true)} title="Hide sidebar" aria-controls="user-dashboard-sidebar" aria-expanded="true" className="p-2 text-slate-500 hover:text-blue-700 hover:bg-white/70 rounded-xl transition-colors cursor-pointer"><PanelLeftClose className="w-4 h-4" /></button>
          </div>

          {/* Student Profile Pill */}
          <div className="p-3 bg-white/70 border border-blue-200/60 rounded-2xl flex items-center justify-between shadow-xs overflow-hidden">
            <div className="flex items-center gap-3 overflow-hidden">
              {renderAvatarGraphic(currentUser?.avatar, "w-10 h-10 text-xs shrink-0")}
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-slate-900 truncate">{currentUser?.name || 'PineVela User'}</div>
                <div className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 inline shrink-0" />
                  <span className="truncate">Verified Account</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0"><button onClick={() => handleNavClick('options')} title="Account Options" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100/50 rounded-lg transition-colors cursor-pointer"><Settings className="w-3.5 h-3.5" /></button></div>
          </div>

          {/* Navigation Links */}
          <nav aria-label="Dashboard destinations" className="space-y-1.5">
            {navItems.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  data-user-navigation=""
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => handleNavClick(tab.id)}
                  title={tab.label}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl transition-all duration-150 group cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-500'
                      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                  }`}
                >
                  {isActive && <NavigationHighlight id={`sidebar-${navigationId}`} />}
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className={`p-2 rounded-xl transition-colors shrink-0 relative ${
                      isActive ? 'bg-white/20 text-white' : 'bg-blue-200/70 text-blue-700 group-hover:bg-blue-300/80'
                    }`}>
                      <Icon className="w-4 h-4" />
                      <TopNavBadge inset color="blue" count={tabUnreadCount(tab.id)} />
                    </div>
                    <div className="text-left overflow-hidden">
                      <div className="text-xs font-semibold tracking-wide flex items-center gap-1.5 truncate">{tab.label}</div>
                      <div className={`text-[10px] font-normal truncate ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                        {tab.sub}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sign Out Footer */}
        <div className="space-y-2 pt-4 border-t border-sky-200/80 mt-4">
          <button
            onClick={() => onSignOut()}
            title="Sign Out"
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-2xl font-semibold text-xs transition-all shadow-xs cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        <div className="flex justify-center pt-3"><HelpLink /></div>
        </div>

      </aside>

  </>;
}
