import React, { lazy, Suspense, useMemo } from 'react';
import ContextBreadcrumbs from '../components/ContextBreadcrumbs';
import LoadingLine from '../components/LoadingLine';
import { useLabels } from '../lib/labels';
import { useData } from '../context/DataContext';
import { Circle, Activity, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCompactValue, formatValue, cn } from '../lib/utils';
import RecentActivitiesList from '../components/dashboard/RecentActivitiesList';

const Channels = lazy(() => import('./Channels'));

export default function ActivityOverview() {
  const { activities, auditOrgs, records, recordsByActivityId } = useData();
  const { tx, getMetricLabel } = useLabels();

  const orgAudit = auditOrgs[0] ?? null;
  const appliedNet = orgAudit?.net_amount ?? 0;
  const totalInflow = orgAudit?.total_increase ?? 0;
  const totalOutflow = orgAudit?.total_decrease ?? 0;

  const visibleActivities = useMemo(
    () => activities.filter(activity => activity.label !== 'Workspace ledger'),
    [activities],
  );

  const totalDeferredActive = useMemo(() =>
    records.filter(r => r.status === 'deferred' || r.status === 'pending')
      .reduce((sum, r) => sum + (r.unit_amount ?? 0), 0),
    [records]);

  const activeActivitiesCount = useMemo(
    () => visibleActivities.filter(activity => activity.status === 'active').length,
    [visibleActivities],
  );

  return (
    <div className="page-shell space-y-6 animate-in fade-in">
      <div className="section-card px-5 py-3.5 lg:px-6">
        <ContextBreadcrumbs items={[tx('Brief')]} className="mb-1.5" />
        <h2 className="text-xl font-light text-stone-900 dark:text-stone-100">{tx('Brief')}</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Executive summary of workspace health and recent operations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Workspace balance"
          value={formatCompactValue(appliedNet)}
          icon={<Circle size={18} className="text-[var(--accent)]" />}
          numericValue={appliedNet}
        />
        <MetricCard
          label="Applied flow"
          value={formatCompactValue(totalInflow - totalOutflow)}
          icon={<TrendingUp size={18} className="text-[var(--success)]" />}
          numericValue={totalInflow - totalOutflow}
        />
        <MetricCard
          label="Pending review"
          value={formatCompactValue(totalDeferredActive)}
          icon={<Clock size={18} className="text-[var(--warning)]" />}
          numericValue={totalDeferredActive}
        />
        <MetricCard
          label="Open activities"
          value={activeActivitiesCount.toString()}
          icon={<Activity size={18} className="text-[var(--accent)]" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
        <div className="space-y-6">
          <section className="section-card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {getMetricLabel('channels')}
              </h3>
            </div>
            <Suspense fallback={<div className="p-8"><LoadingLine label="Loading channels..." /></div>}>
              <Channels embedded />
            </Suspense>
          </section>
        </div>

        <aside className="space-y-6">
          <RecentActivitiesList 
            activities={visibleActivities}
            recordsByActivityId={recordsByActivityId}
            limit={8}
          />
        </aside>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, numericValue }: { label: string; value: string; icon: React.ReactNode; numericValue?: number }) {
  const valueToneClass = numericValue === undefined
    ? 'text-stone-900 dark:text-stone-100'
    : numericValue > 0
      ? 'amount-positive'
      : numericValue < 0
        ? 'amount-negative'
        : 'amount-zero';

  return (
    <div className="section-card p-4 flex items-center justify-between group interactive-3d">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center shadow-sm border border-stone-200 dark:border-stone-700">
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">{label}</p>
          <p className={cn('text-lg font-mono font-semibold tabular-nums', valueToneClass)}>{value}</p>
        </div>
      </div>
    </div>
  );
}

