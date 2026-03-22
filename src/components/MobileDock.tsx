import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, UserCog, History, Settings, Landmark, Briefcase, Handshake, Circle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppRole } from '../context/AppRoleContext';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}

const navItems: NavItem[] = [
  { to: "/dashboard", icon: <LayoutDashboard size={20} />, label: "Brief", hint: "Operational dashboard and value summary" },
  { to: "/activity", icon: <History size={20} />, label: "Activities", hint: "Activity records and participant overview" },
  { to: "/channels", icon: <Circle size={20} />, label: "Channels", hint: "Channel tracking and settings overview" },
  { to: "/contacts", icon: <Handshake size={20} />, label: "Partners", hint: "Partner network and relationship tracking" },
  { to: "/team", icon: <UserCog size={20} />, label: "Team", hint: "Team management and activity block operations" },
  { to: "/settings", icon: <Settings size={20} />, label: "Settings", hint: "System settings and data actions" },
];

export default function MobileDock() {
  const { canAccessAdminUi } = useAppRole();
  const location = useLocation();
  const normalizedPath = location.pathname;
  const visibleNavItems = canAccessAdminUi
    ? navItems
    : navItems.filter(item => item.to === '/activity' || item.to === '/team');

  return (
    <>
      {/* Floating Dock */}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 -translate-x-1/2 z-50 lg:hidden w-auto max-w-[95vw] pointer-events-none">
        <div className="mobile-nav-light pointer-events-auto touch-manipulation flex items-center gap-1 p-2 rounded-full surface-elevated">
          {visibleNavItems.map((item) => (
            <DockItem key={item.to} item={item} isActive={normalizedPath === item.to} />
          ))}
        </div>
      </div>
    </>
  );
}

function DockItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <NavLink
      to={item.to}
      title={item.hint}
      aria-label={`${item.label}: ${item.hint}`}
      className="interactive-3d touch-manipulation relative flex items-center justify-center w-12 h-12 rounded-full"
    >
      {isActive && (
        <div className="absolute inset-0 bg-stone-900 dark:bg-stone-100 rounded-full shadow-md transition-colors duration-200" />
      )}
      <div className={cn(
        "relative z-10 transition-colors duration-150",
        isActive ? "text-white dark:text-stone-900" : "text-stone-500 dark:text-stone-400"
      )}>
        {React.cloneElement(item.icon as React.ReactElement<any>, { size: 20, strokeWidth: isActive ? 2.5 : 2 })}
      </div>
    </NavLink>
  );
}
