import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, UserCog, History, Settings, Sun, Moon, Keyboard, LogOut, Landmark, Activity, BarChart3, Briefcase, Handshake, Circle, Scale, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../context/ThemeContext';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import MobileDock from './MobileDock';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { SECTION_SHORTCUT_EVENT, SectionShortcutDirection } from '../lib/sectionShortcuts';
import ShortcutHelpModal from './ShortcutHelpModal';
import GlobalTelemetryPanel from './GlobalTelemetryPanel';
import LiveFeedPanel from './LiveFeedPanel';
import IdentityBadge from './IdentityBadge';
import { preloadRoute } from '../lib/routePreloaders';
import { ChevronDown, Globe } from 'lucide-react';
import EntitiesIcon from './icons/EntitiesIcon';
import { getRoleLabel } from '../lib/labels';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { loading, loadingProgress, activities, availableOrgs, activeOrgId, switchOrg } = useData();
  const orgsList = Object.values(availableOrgs);
  const activeOrg = availableOrgs[activeOrgId || ''];

  const { role, isClusterAdmin, canAccessAdminUi, canOperateLog, canManageImpact, canAlign } = useAppRole();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isFocusFullscreen, setIsFocusFullscreen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [isLiveFeedOpen, setIsLiveFeedOpen] = useState(false);
  const [isOrgSwitcherOpen, setIsOrgSwitcherOpen] = useState(false);
  const [shortcutPrefix, setShortcutPrefix] = useState<'n' | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const shortcutPrefixTimeoutRef = useRef<number | null>(null);

  const adminNavGroups = [
    {
      label: '',
      items: [
        { to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'Overview', hint: 'Operational overview and key metrics' },
        { to: '/activity', icon: <History size={18} />, label: 'Activities', hint: 'Activity records and management' },
        { to: '/entities', icon: <EntitiesIcon size={18} />, label: 'Entities', hint: 'Entity list and detailed profiles' },
        { to: '/channels', icon: <Circle size={18} />, label: 'Channels', hint: 'Channel tracking and settings overview' },
        { to: '/collaborations', icon: <Handshake size={18} />, label: 'Network', hint: 'Network profiles and linked entities' },
        { to: '/team', icon: <UserCog size={18} />, label: 'Team', hint: 'Team management and operator coverage' },
        { to: '/settings', icon: <Settings size={18} />, label: 'Settings', hint: 'System preferences and access control' },

      ],
    },
  ];

  // Match App.tsx: non-admins are redirected away from dashboard, entities, channels, collaborations, settings.
  const operatorNavGroups = [
    {
      label: '',
      items: [
        { to: '/activity', icon: <History size={18} />, label: 'Activities', hint: 'Activity records and management' },
        { to: '/team', icon: <UserCog size={18} />, label: 'Team', hint: 'Team management and operator coverage' },
      ],
    },
  ];

  const visibleNavGroups = canAccessAdminUi ? adminNavGroups : operatorNavGroups;

  const showSyncProgress = loading || loadingProgress > 0;
  const roleLabel = isClusterAdmin ? getRoleLabel('cluster_admin') : getRoleLabel(role);
  const roleSummary = `Activities: ${canOperateLog ? 'Yes' : 'No'} • Value: ${canManageImpact ? 'Yes' : 'No'} • Align: ${canAlign ? 'Yes' : 'No'}`;

  const mobileRoleBadgeClass = role === 'admin'
    ? 'border-violet-700 bg-violet-900/50 text-violet-200'
    : role === 'operator'
      ? 'border-emerald-700 bg-emerald-900/40 text-emerald-200'
      : 'border-stone-700 bg-stone-800 text-stone-200';
  const desktopRoleBadgeClass = (isClusterAdmin || role === 'admin')
    ? 'border-violet-200 dark:border-violet-700 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200'
    : role === 'operator'
      ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200'
      : 'border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200';

  const toggleFocusFullscreen = useCallback(() => {
    setIsFocusFullscreen(prev => {
      const next = !prev;
      if (next) {
        const fullscreenTarget = document.documentElement;
        if (!document.fullscreenElement && fullscreenTarget.requestFullscreen) {
          void fullscreenTarget.requestFullscreen().catch(() => undefined);
        }
      } else if (document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => undefined);
      }
      return next;
    });
  }, []);

  const clearShortcutPrefix = useCallback(() => {
    setShortcutPrefix(null);
    if (shortcutPrefixTimeoutRef.current !== null) {
      window.clearTimeout(shortcutPrefixTimeoutRef.current);
      shortcutPrefixTimeoutRef.current = null;
    }
  }, []);

  const armShortcutPrefix = useCallback((prefix: 'n') => {
    setShortcutPrefix(prefix);
    if (shortcutPrefixTimeoutRef.current !== null) {
      window.clearTimeout(shortcutPrefixTimeoutRef.current);
    }
    shortcutPrefixTimeoutRef.current = window.setTimeout(() => {
      setShortcutPrefix(null);
      shortcutPrefixTimeoutRef.current = null;
    }, 1500);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const normalizedKey = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        Boolean(target?.isContentEditable);

      if (normalizedKey === 'f' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (isTypingTarget) return;
        event.preventDefault();
        toggleFocusFullscreen();
        return;
      }

      if ((normalizedKey === '?' || (normalizedKey === '/' && event.shiftKey)) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (isTypingTarget) return;
        if (window.innerWidth < 1024) return;
        event.preventDefault();
        setIsShortcutHelpOpen(true);
        return;
      }

      if (!isTypingTarget && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const goRouteMap: Record<string, string> = canAccessAdminUi
          ? {
              b: '/dashboard',
              a: '/activity',
              p: '/entities',
              c: '/collaborations',
              v: '/channels',
              t: '/team',
              s: '/settings',
            }
          : {
              b: '/activity',
              a: '/activity',
              p: '/activity',
              c: '/activity',
              v: '/activity',
              t: '/team',
              s: '/activity',
            };
        const route = goRouteMap[normalizedKey];
        if (route) {
          event.preventDefault();
          clearShortcutPrefix();
          navigate(route);
          return;
        }

        if (shortcutPrefix === null && normalizedKey === 'n') {
          event.preventDefault();
          armShortcutPrefix(normalizedKey);
          return;
        }

        if (shortcutPrefix === 'n') {
          if (normalizedKey === 'a') {
            event.preventDefault();
            clearShortcutPrefix();
            navigate('/activity?action=create-activity');
            return;
          }

          if (normalizedKey === 'e') {
            event.preventDefault();
            clearShortcutPrefix();
            const activeActivity = activities.find(activity => activity.status === 'active');
            if (activeActivity) {
              navigate(`/activity/${activeActivity.id}?action=record-record`);

            } else {
              navigate('/activity?action=create-activity');
            }
            return;
          }

          if (normalizedKey === 'v') {
            event.preventDefault();
            clearShortcutPrefix();
            navigate(canAccessAdminUi ? '/channels?action=add-account' : '/activity');
            return;
          }

          if (normalizedKey === 'p') {
            event.preventDefault();
            clearShortcutPrefix();
            navigate(canAccessAdminUi ? '/entities?action=add-entity' : '/activity');
            return;
          }

          if (normalizedKey === 'm') {
            event.preventDefault();
            clearShortcutPrefix();
            navigate('/team?action=add-member');
            return;
          }

        }
      }

      if ((normalizedKey === 'arrowright' || normalizedKey === 'arrowleft') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (isTypingTarget) return;
        const direction: SectionShortcutDirection = normalizedKey === 'arrowright' ? 'next' : 'prev';
        window.dispatchEvent(new CustomEvent(SECTION_SHORTCUT_EVENT, { detail: { direction } }));
        event.preventDefault();
        return;
      }

      if (normalizedKey === 'arrowup' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (isTypingTarget) return;
        event.preventDefault();
        contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (normalizedKey === 'escape' && isFocusFullscreen) {
        setIsFocusFullscreen(false);
      }
      if (normalizedKey === 'escape' && isShortcutHelpOpen) {
        setIsShortcutHelpOpen(false);
      }
      if (normalizedKey === 'escape' && shortcutPrefix !== null) {
        clearShortcutPrefix();
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFocusFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      clearShortcutPrefix();
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [
    armShortcutPrefix,
    clearShortcutPrefix,
    activities,
    isFocusFullscreen,

    role === 'admin',
    isShortcutHelpOpen,
    navigate,
    shortcutPrefix,
    toggleFocusFullscreen,
  ]);

  return (
    <div className="app-ambient-surface min-h-screen text-stone-900 dark:text-stone-100 font-sans flex flex-col lg:flex-row transition-colors duration-200 pb-32 lg:pb-0 overflow-x-hidden">
      <div className={cn(
        'fixed top-0 left-0 right-0 h-0.5 z-[70] pointer-events-none transition-opacity duration-200',
        showSyncProgress ? 'opacity-100' : 'opacity-0'
      )}>
        {loadingProgress > 0 ? (
          <div
            className="h-full bg-stone-800 dark:bg-stone-200 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(6, Math.min(100, loadingProgress))}%` }}
          />
        ) : (
          <div className="h-full w-full overflow-hidden bg-stone-300/30 dark:bg-stone-600/30">
            <div className="h-full w-1/3 bg-stone-800 dark:bg-stone-200 sync-indeterminate-bar" />
          </div>
        )}
      </div>

      {/* Mobile Top Bar */}
      <div className={cn(
        "mobile-nav-light lg:hidden fixed top-0 left-0 right-0 h-16 bg-stone-900/95 dark:bg-black/95 text-white flex items-center justify-between px-4 z-50 shadow-lg border-b border-stone-800/70",
        isFocusFullscreen && "hidden"
      )}>
        <div className="flex items-center">
          <h1 className="font-bold tracking-tight">FLOW OPS</h1>
          {orgsList.length > 1 && (
            <div className="ml-3 relative">
              <button
                onClick={() => setIsOrgSwitcherOpen(!isOrgSwitcherOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-800 dark:bg-stone-800 text-[10px] font-bold uppercase tracking-wider text-stone-300 border border-stone-700/50"
              >
                <Globe size={12} />
                <span className="max-w-[80px] truncate">Workspace</span>
                <ChevronDown size={10} className={cn("transition-transform duration-200", isOrgSwitcherOpen && "rotate-180")} />
              </button>
              
              {isOrgSwitcherOpen && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setIsOrgSwitcherOpen(false)} />
                  <div className="absolute top-full left-0 mt-1.5 py-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl z-[70] min-w-[160px] animate-in fade-in zoom-in-95 duration-100">
                    {orgsList.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => {
                          void switchOrg(org.id);
                          setIsOrgSwitcherOpen(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2",
                          org.id === activeOrgId ? "text-emerald-500 font-semibold bg-emerald-500/5" : "text-stone-600 dark:text-stone-300"
                        )}
                      >
                        <IdentityBadge 
                          type="org"
                          size="sm"
                          id={org.id}
                          name={org.name}
                          tag={org.tag}
                          showShortId={false}
                          hideCopy={true}
                        />
                        {org.id === activeOrgId && <div className="w-1 h-1 rounded-full bg-emerald-500" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsTelemetryOpen(true)}
            className="interactive-3d inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-300 hover:text-white"
            aria-label="Audit Panel"
            title="Audit Panel"
          >
            <Activity size={18} />
          </button>
          {isSupabaseConfigured && user && (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-[11px] px-2.5 py-1 rounded-full border font-semibold',
                  mobileRoleBadgeClass,
                )}
                title={roleSummary}
              >
                {roleLabel}
              </span>

              <button
                onClick={() => { void signOut(); }}
                className="text-xs px-2 py-1 rounded-md bg-stone-800 text-stone-200 hover:bg-stone-700"
                title="Sign Out"
              >
                Sign Out
              </button>
            </div>
          )}
          {isSupabaseConfigured && !user && (
            <button
              onClick={() => navigate('/auth')}
              className="text-xs px-2 py-1 rounded-md bg-stone-800 text-stone-200 hover:bg-stone-700"
              title="Sign In"
            >
              Sign In
            </button>
          )}
          <button 
            onClick={toggleTheme} 
            className="interactive-3d inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-300 hover:text-white"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className={isFocusFullscreen
        ? "hidden"
        : "desktop-sidebar-proportional hidden lg:flex fixed inset-y-0 left-0 bg-stone-50/50 dark:bg-stone-900/50 backdrop-blur-md border-r border-stone-200/80 dark:border-stone-800/60 flex-col z-30"
      }>
        {/* App name */}
        <div className="h-14 px-4 flex items-center border-b border-stone-200 dark:border-stone-800/60 shrink-0">
          <span className="text-[11px] font-bold tracking-widest uppercase text-stone-900 dark:text-stone-100 select-none">Flow Ops</span>
        </div>

        {/* Org Switcher */}
        {orgsList.length > 0 && (
          <div className="px-3 py-4 border-b border-stone-200 dark:border-stone-800/60">
            <div className="relative">
              <button
                onClick={() => setIsOrgSwitcherOpen(!isOrgSwitcherOpen)}
                className="w-full group grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 rounded-xl bg-stone-100/50 dark:bg-stone-800/40 hover:bg-stone-200/50 dark:hover:bg-stone-800/60 border border-stone-200 dark:border-stone-700/50 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0 pr-1">
                  <div className="w-8 h-8 rounded-lg bg-stone-900 dark:bg-emerald-500/20 flex items-center justify-center shrink-0 shadow-sm border border-stone-800 dark:border-emerald-500/10">
                    <Globe size={14} className="text-white dark:text-emerald-400" />
                  </div>
                  <div className="text-left min-w-0 flex-1 flex flex-col gap-1">
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100 leading-none">Workspace</span>
                    <div className={cn("inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-tight w-fit shrink-0", desktopRoleBadgeClass)}>
                      {roleLabel}
                    </div>
                  </div>
                </div>
                <ChevronDown size={15} className={cn("text-stone-400 shrink-0 transition-transform duration-200", isOrgSwitcherOpen && "rotate-180")} />
              </button>

              {isOrgSwitcherOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsOrgSwitcherOpen(false)} 
                  />
                  <div className="absolute top-full left-0 right-0 mt-2 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 origin-top">
                    <div className="max-h-[240px] overflow-y-auto thin-scrollbar">
                      {orgsList.map((org) => (
                        <button
                          key={org.id}
                          onClick={() => {
                            void switchOrg(org.id);
                            setIsOrgSwitcherOpen(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-left text-xs transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50 flex flex-col gap-1",
                            org.id === activeOrgId ? "bg-emerald-500/5 font-semibold" : "text-stone-600 dark:text-stone-300"
                          )}
                        >
                          <IdentityBadge 
                            type="org"
                            size="sm"
                            id={org.id}
                            name={org.name}
                            tag={org.tag}
                            showShortId={false}
                            hideCopy={true}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {visibleNavGroups.map((group, gi) => (
            <div key={gi}>
              <div className="space-y-1">
                {group.items.map(item => (
                  <NavItem
                    key={`${item.to}-${item.label}`}
                    {...item}
                    onHover={() => { void preloadRoute(item.to); }}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-stone-200 dark:border-stone-800/60 px-3 py-3 space-y-2 shrink-0">
          <div className="flex items-center gap-1 px-1">
            <button
              onClick={() => setIsShortcutHelpOpen(true)}
              className="interactive-3d inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard Shortcuts"
            >
              <Keyboard size={15} />
            </button>
            <button
              onClick={() => setIsLiveFeedOpen(true)}
              className="interactive-3d inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
              title="Live Feed"
              aria-label="Live Feed"
            >
              <Zap size={15} />
            </button>
            <button
              onClick={() => setIsTelemetryOpen(true)}
              className="interactive-3d inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              title="Audit Panel"
              aria-label="Audit Panel"
            >
              <Scale size={15} />
            </button>
            <button
              onClick={toggleTheme}
              className="interactive-3d inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              aria-label="Toggle Theme"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            {isSupabaseConfigured && user && (
              <button
                onClick={() => { void signOut(); }}
                className="interactive-3d ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut size={15} />
              </button>
            )}
            {isSupabaseConfigured && !user && (
              <button
                onClick={() => navigate('/auth')}
                className="interactive-3d ml-auto inline-flex h-8 items-center rounded-lg border border-stone-200 dark:border-stone-700 px-2.5 text-[11px] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Sign In
              </button>
            )}
          </div>
          {isSupabaseConfigured && user && (
            <div className="flex flex-col gap-2 px-1 pb-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-stone-400 dark:text-stone-600 font-medium select-none">
                  © Flow Ops 2026
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-stone-400 dark:text-stone-500 font-medium">
                <a href="/legal/terms.md" target="_blank" rel="noopener noreferrer" className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors">Terms</a>
                <a href="/legal/privacy.md" target="_blank" rel="noopener noreferrer" className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors">Privacy</a>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 w-full flex flex-col min-h-screen min-w-0",
        isFocusFullscreen ? "lg:ml-0" : "desktop-main-offset"
      )}>
        <div
          ref={contentScrollRef}
          className={cn(
          "p-4 lg:px-6 lg:py-8 overflow-y-auto overflow-x-hidden flex-1 app-scroll-smooth",
          isFocusFullscreen ? "pt-4 lg:pt-4" : "pt-20 lg:pt-8"
        )}
        >
          <div className="desktop-pro w-full min-w-0">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile Dock */}
      {!isFocusFullscreen && <MobileDock />}

      <ShortcutHelpModal isOpen={isShortcutHelpOpen} onClose={() => setIsShortcutHelpOpen(false)} />
      <GlobalTelemetryPanel isOpen={isTelemetryOpen} onClose={() => setIsTelemetryOpen(false)} />
      <LiveFeedPanel isOpen={isLiveFeedOpen} onClose={() => setIsLiveFeedOpen(false)} />
    </div>
  );
}

function NavItem({ to, icon, label, hint, matchSearch, onHover }: { to: string; icon: React.ReactNode; label: string; hint?: string; matchSearch?: string; onHover?: () => void }) {
  const location = useLocation();

  let isActive: boolean;
  if (matchSearch) {
    isActive = location.pathname === to && location.search.includes(matchSearch);
  } else if (to === '/') {
    isActive = location.pathname === '/';
  } else {
    isActive = location.pathname === to || location.pathname.startsWith(to + '/');
  }

  return (
    <Link
      to={matchSearch ? `${to}?${matchSearch}` : to}
      onMouseEnter={onHover}
      onFocus={onHover}
      title={hint}
      aria-label={hint ? `${label}: ${hint}` : label}
      className={cn('sidebar-nav-item', isActive && 'active')}
    >
      <span aria-hidden="true" className="sidebar-nav-icon">{icon}</span>
      <span className="sidebar-nav-label">{label}</span>
    </Link>
  );
}
