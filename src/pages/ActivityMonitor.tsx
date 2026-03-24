import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LayoutGrid, UserRound } from 'lucide-react';
import { cn } from '../lib/utils';
import ContextBreadcrumbs from '../components/ContextBreadcrumbs';
import { cycleSectionValue, SECTION_SHORTCUT_EVENT, SectionShortcutDirection } from '../lib/sectionShortcuts';
import LoadingLine from '../components/LoadingLine';
import { useAppRole } from '../context/AppRoleContext';
import { useLabels } from '../lib/labels';

const Activities = lazy(() => import('./Activities'));
const Entities = lazy(() => import('./Entities'));

export default function ActivityMonitor() {
  const location = useLocation();
  const { canAccessAdminUi } = useAppRole();
  const { tx } = useLabels();
  const allowedTabs = useMemo<Array<'workspaces' | 'crm'>>(
    () => (canAccessAdminUi ? ['workspaces', 'crm'] : ['workspaces']),
    [canAccessAdminUi],
  );
  const [activeTab, setActiveTab] = useState<'workspaces' | 'crm'>(
    (canAccessAdminUi && location.pathname === '/units')
      ? 'crm'
      : 'workspaces'
  );

  useEffect(() => {
    const nextTab = (canAccessAdminUi && location.pathname === '/units')
      ? 'crm'
      : 'workspaces';
    setActiveTab(nextTab);
  }, [canAccessAdminUi, location.pathname]);

  useEffect(() => {
    const handleSectionShortcut = (event: Event) => {
      const customEvent = event as CustomEvent<{ direction: SectionShortcutDirection }>;
      const direction = customEvent.detail?.direction;
      if (!direction) return;
      setActiveTab(current => cycleSectionValue(allowedTabs, current, direction));
    };

    window.addEventListener(SECTION_SHORTCUT_EVENT, handleSectionShortcut as EventListener);
    return () => {
      window.removeEventListener(SECTION_SHORTCUT_EVENT, handleSectionShortcut as EventListener);
    };
  }, [allowedTabs]);

  const breadcrumbItems = activeTab === 'crm'
    ? [tx('Activity'), 'Entities']
    : [tx('Activity'), tx('Overview')];

  return (
    <div className="page-shell space-y-8 animate-in fade-in">
      <div className="section-card p-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <ContextBreadcrumbs items={breadcrumbItems} />
        </div>
        <div className={cn(
          'toggle-indirect-track grid rounded-xl border border-stone-200 dark:border-stone-800 p-1 gap-1 w-full lg:w-auto lg:inline-flex',
          canAccessAdminUi ? 'grid-cols-2' : 'grid-cols-1'
        )}>
          <button
            onClick={() => setActiveTab('workspaces')}
            title={tx('Activity records, assignments, and timeline')}
            className={cn(
              'interactive-3d px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 min-h-[36px]',
              activeTab === 'workspaces'
                ? 'toggle-indirect-active'
                : 'toggle-indirect-idle'
            )}
          >
            <LayoutGrid size={16} />
            {tx('Activity')}
          </button>
          {canAccessAdminUi && (
            <button
              onClick={() => setActiveTab('crm')}
              title="Entity profiles and relationship activity"
              className={cn(
                  'interactive-3d px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 min-h-[36px]',
                activeTab === 'crm'
                  ? 'toggle-indirect-active'
                  : 'toggle-indirect-idle'
              )}
            >
              <UserRound size={16} />
              Entities
            </button>
          )}
        </div>
      </div>

      <Suspense
        fallback={
          <div className="section-card p-6">
            <div className="max-w-sm">
              <LoadingLine label="Loading section…" />
            </div>
          </div>
        }
      >
        {activeTab === 'workspaces' ? <Activities embedded /> : <Entities embedded />}
      </Suspense>
    </div>
  );
}
