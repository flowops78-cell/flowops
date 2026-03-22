import React, { lazy, Suspense, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { cn, formatCompactNumber, formatCompactValue, formatValue } from '../lib/utils';
import { Users, Circle, Award, Activity, Clock, TrendingUp, TrendingDown, AlertCircle, Calendar } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import LoadingLine from '../components/LoadingLine';
import DeferredRender from '../components/DeferredRender';
import { useLabels } from '../lib/labels';
import { useAppRole } from '../context/AppRoleContext';

const DashboardCharts = lazy(() => import('../components/dashboard/DashboardCharts'));

export default function Dashboard({ embedded = false }: { embedded?: boolean }) {
  const { units, workspaces, entries, reserveEntries, adjustments } = useData();
  const { canAccessAdminUi } = useAppRole();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { tx, getMetricLabel, getActionText } = useLabels();

  if (!canAccessAdminUi) {
    return <Navigate to="/activity" replace />;
  }

  // Stats Calculation
  const totalWorkspaces = workspaces.length;
  const totalUnits = units.length;
  const totalEntryFlow = useMemo(() => entries.reduce((sum, entry) => sum + entry.input_amount, 0), [entries]);
  const currentReserve_base = useMemo(
    () => reserveEntries.reduce((sum, t) => sum + (t.type === 'increment' ? t.amount : -t.amount), 0),
    [reserveEntries]
  );
  const totalInflow = useMemo(
    () => reserveEntries.reduce((sum, entry) => sum + (entry.type === 'increment' ? entry.amount : 0), 0),
    [reserveEntries],
  );
  const totalOutflow = useMemo(
    () => reserveEntries.reduce((sum, entry) => sum + (entry.type === 'decrement' ? entry.amount : 0), 0),
    [reserveEntries],
  );
  const totalDeferredActive = useMemo(() => {
    const unitTotals: Record<string, number> = {};
    adjustments.forEach(entry => {
      if (!unitTotals[entry.unit_id]) unitTotals[entry.unit_id] = 0;
      unitTotals[entry.unit_id] += entry.type === 'input' ? entry.amount : -entry.amount;
    });
    return Object.values(unitTotals).reduce((sum, value) => sum + value, 0);
  }, [adjustments]);
  const activeWorkspacesCount = useMemo(() => workspaces.filter(g => !g.end_time).length, [workspaces]);

  // Calculate unit net value_change
  const unitStats = useMemo(() => units.map(unit => {
    const unitEntries = entries.filter(l => l.unit_id === unit.id);
    const net = unitEntries.reduce((sum, entry) => sum + entry.net, 0);
    const workspacesPlayed = unitEntries.length;
    return { ...unit, net, workspacesPlayed };
  }), [units, entries]);

  const topOutcomes = useMemo(() => [...unitStats].sort((a, b) => b.net - a.net).slice(0, 5), [unitStats]);
  
  // Recent activity (last 5 workspaces)
  const recentWorkspaces = useMemo(() => [...workspaces]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5), [workspaces]);

  // Hourly Heatmap Data
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const activeHeatmapData = useMemo(() => {
    const heatmapData: { day: number; hour: number; value: number }[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmapData.push({ day, hour, value: 0 });
      }
    }

    workspaces.forEach(workspace => {
      const date = new Date(workspace.start_time || workspace.date);
      const day = date.getDay();
      const hour = date.getHours();
      const bucket = heatmapData.find(item => item.day === day && item.hour === hour);
      if (bucket) bucket.value += 1;
    });

    return heatmapData.filter(item => item.value > 0);
  }, [workspaces]);

  // Weekly Flow Trend (Last 7 Days)
  const flowTrend = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(dateStr => {
      const dailyWorkspaces = workspaces.filter(g => (g.date || '').startsWith(dateStr));
      const dailyFlow = dailyWorkspaces.reduce((sum, workspace) => {
        const workspaceEntries = entries.filter(l => l.workspace_id === workspace.id);
        return sum + workspaceEntries.reduce((entriesSum, entry) => entriesSum + entry.input_amount, 0);
      }, 0);
      return { date: new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' }), value: dailyFlow };
    });
  }, [workspaces, entries]);

  return (
    <div className="page-shell animate-in fade-in">
      {!embedded && (
        <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100 mb-1">{tx('Operations Dashboard')}</h2>
            <p className="text-stone-500 dark:text-stone-400 text-sm">Operational snapshot and flow-based activity metrics.</p>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                {getMetricLabel('participants')}: <span className="font-mono text-stone-900 dark:text-stone-100">{totalUnits}</span>
              </span>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                {getMetricLabel('activitys')}: <span className="font-mono text-stone-900 dark:text-stone-100">{totalWorkspaces}</span>
              </span>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                Active {getMetricLabel('activitys')}: <span className="font-mono text-stone-900 dark:text-stone-100">{activeWorkspacesCount}</span>
              </span>
            </div>
            <div className="flex gap-2">
             <Link to="/activity" className="action-btn-primary">
               <Activity size={16} />
               {getActionText('manageActivities')}
             </Link>
            </div>
          </div>
        </div>
      )}

      {/* Unified KPI Strip */}
      <div className="section-card p-3 lg:p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => navigate('/activity?action=create-activity')}
            className="action-btn-primary justify-center min-h-[40px]"
          >
            {getActionText('startActivity')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/units?action=add-participant')}
            className="action-btn-secondary justify-center min-h-[40px]"
          >
            {getActionText('addUnit')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/units?action=add-deferred')}
            className="action-btn-secondary justify-center min-h-[40px]"
          >
            {getActionText('recordDeferredEntry')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/reserve')}
            className="action-btn-secondary justify-center min-h-[40px]"
          >
            {`Open ${tx('Reserve')}`}
          </button>
        </div>
      </div>

      <div className="section-card p-0 overflow-hidden">
        <div className="grid grid-cols-1 gap-px bg-stone-200/80 sm:grid-cols-2 lg:grid-cols-7 dark:bg-stone-800/80">
          <StatCard
            label={`Current ${getMetricLabel('reserve')}`}
            value={formatCompactValue(currentReserve_base)}
            fullValue={formatValue(currentReserve_base)}
            icon={<Circle className="text-[var(--accent)]" />}
            numericValue={currentReserve_base}
            onClick={() => navigate('/reserve')}
          />
          <StatCard
            label={`Active ${getMetricLabel('activitys')}`}
            value={formatCompactNumber(activeWorkspacesCount)}
            fullValue={activeWorkspacesCount.toString()}
            icon={<Activity className="text-[var(--accent)]" />}
            highlight={activeWorkspacesCount > 0}
            onClick={() => navigate('/activity')}
          />
          <StatCard
            label={`Total ${getMetricLabel('flow')}`}
            value={formatCompactValue(totalEntryFlow)}
            fullValue={formatValue(totalEntryFlow)}
            icon={<TrendingUp className="text-[var(--accent)]" />}
            numericValue={totalEntryFlow}
            onClick={() => navigate('/activity')}
          />
          <StatCard
            label="Total Inflow"
            value={formatCompactValue(totalInflow)}
            fullValue={formatValue(totalInflow)}
            icon={<TrendingUp className="text-[var(--success)]" />}
            numericValue={totalInflow}
            onClick={() => navigate('/reserve')}
          />
          <StatCard
            label="Total Outflow"
            value={formatCompactValue(totalOutflow)}
            fullValue={formatValue(totalOutflow)}
            icon={<TrendingDown className="text-[var(--danger)]" />}
            numericValue={-totalOutflow}
            onClick={() => navigate('/reserve')}
          />
          <StatCard
            label="Deferred Active"
            value={formatCompactValue(totalDeferredActive)}
            fullValue={formatValue(totalDeferredActive)}
            icon={<Clock className="text-[var(--warning)]" />}
            numericValue={totalDeferredActive}
            onClick={() => navigate('/reserve')}
          />
          <StatCard
            label={`Avg Entry ${getMetricLabel('flow')}`}
            value={totalWorkspaces ? formatCompactValue(totalEntryFlow / totalWorkspaces) : '0 units'}
            fullValue={totalWorkspaces ? formatValue(totalEntryFlow / totalWorkspaces) : '0 units'}
            icon={<Award className="text-[var(--accent)]" />}
            numericValue={totalWorkspaces ? (totalEntryFlow / totalWorkspaces) : 0}
            className="sm:col-span-2 lg:col-span-1"
            onClick={() => navigate('/activity')}
          />
        </div>
      </div>

      <DeferredRender
        fallback={
          <div className="section-card p-6 min-h-[220px] flex items-center justify-center">
            <div className="w-full max-w-sm">
              <LoadingLine label="Loading analytics…" />
            </div>
          </div>
        }
      >
        <Suspense
          fallback={
            <div className="section-card p-6 min-h-[220px] flex items-center justify-center">
              <div className="w-full max-w-sm">
                <LoadingLine label="Loading analytics…" />
              </div>
            </div>
          }
        >
          <DashboardCharts
            flowTrend={flowTrend}
            topOutcomes={topOutcomes}
            activeHeatmapData={activeHeatmapData}
            days={days}
            theme={theme}
            sidePanel={
              <section className="relative overflow-hidden rounded-2xl border border-stone-200/80 dark:border-stone-800/80 bg-gradient-to-b from-white to-stone-50/60 dark:from-stone-900 dark:to-stone-900/70 p-4">
                <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
                <div className="relative flex items-center justify-between mb-2.5">
                  <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">{getMetricLabel('recentActivityLogs')}</h3>
                  <Link to="/activity" className="text-xs text-[var(--accent)] hover:opacity-90 font-medium interactive-3d rounded px-1.5 py-0.5">View All</Link>
                </div>
                <div className="relative divide-y divide-stone-200/70 dark:divide-stone-800/80 max-h-[188px] overflow-y-auto pr-1">
                  {recentWorkspaces.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-stone-400">
                      <AlertCircle className="mb-2 opacity-50" size={24} />
                      <p className="text-sm italic">No activities recorded yet.</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => navigate('/activity?action=create-activity')}
                          className="action-btn-secondary text-xs px-2.5 py-1.5"
                        >
                          {getActionText('startActivity')}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/units?action=add-participant')}
                          className="action-btn-secondary text-xs px-2.5 py-1.5"
                        >
                          {getActionText('addUnit')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    recentWorkspaces.map(workspace => {
                      const workspaceEntries = entries.filter(l => l.workspace_id === workspace.id);
                      const entryFlow = workspaceEntries.reduce((sum, e) => sum + e.input_amount, 0);
                      const unitCount = new Set(workspaceEntries.map(e => e.unit_id)).size;

                      return (
                        <div key={workspace.id} className="interactive-3d grid grid-cols-[1fr_auto] items-center gap-2 py-2.5 first:pt-1 last:pb-0.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${workspace.end_time ? 'bg-stone-300 dark:bg-stone-600' : 'bg-emerald-500 animate-pulse'}`} />
                            <div className="min-w-0">
                              <p className="font-medium text-stone-900 dark:text-stone-100 text-[13px] truncate">{new Date(workspace.date).toLocaleDateString()}</p>
                              <p className="text-xs text-stone-500 dark:text-stone-400 truncate">{workspace.activity_category || 'Activity'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-medium text-stone-900 dark:text-stone-100 text-[13px]">{formatValue(entryFlow)}</p>
                            <p className="text-xs text-stone-500 dark:text-stone-400">{unitCount} {getMetricLabel('participants').toLowerCase()}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            }
          />
        </Suspense>
      </DeferredRender>
    </div>
  );
}

function StatCard({ label, value, fullValue, icon, trend, highlight, numericValue, onClick, className = '' }: { label: string; value: string; fullValue?: string; icon: React.ReactNode; trend?: string; highlight?: boolean; numericValue?: number; onClick?: () => void; className?: string }) {
  const snapshotValue = fullValue ?? value;
  const valueToneClass = numericValue === undefined
    ? 'text-stone-900 dark:text-stone-100'
    : numericValue > 0
      ? 'amount-positive'
      : numericValue < 0
        ? 'amount-negative'
        : 'amount-zero';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group interactive-3d w-full bg-white/90 px-2.5 py-2 text-left transition-colors hover:bg-stone-50/85 dark:bg-stone-950/80 dark:hover:bg-stone-900/80 ${highlight ? 'bg-emerald-50/60 dark:bg-emerald-950/35' : ''} ${className}`}
      aria-label={`${label}: ${snapshotValue}`}
      title={snapshotValue}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="min-w-0 flex items-center gap-1.5">
          <div className={`shrink-0 rounded-md p-1 ${highlight ? 'bg-emerald-100/60 dark:bg-emerald-900/30' : 'bg-stone-100/80 dark:bg-stone-800/80'}`}>
            {icon}
          </div>
          <p className="truncate text-[9px] font-medium uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">{label}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 leading-none">
          {trend ? <span className="text-[9px] font-medium amount-positive">{trend}</span> : null}
          <p className={cn('min-w-[68px] text-right font-mono text-[14px] font-medium tabular-nums sm:min-w-[76px]', valueToneClass)}>{value}</p>
        </div>
      </div>
    </button>
  );
}
