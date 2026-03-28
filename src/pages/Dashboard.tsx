import React, { lazy, Suspense, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { cn, formatCompactNumber, formatCompactValue, formatValue } from '../lib/utils';
import { Circle, Award, Activity, Clock, TrendingUp, TrendingDown, AlertCircle, LayoutDashboard } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import LoadingLine from '../components/LoadingLine';
import DeferredRender from '../components/DeferredRender';
import { useLabels } from '../lib/labels';
import { useAppRole } from '../context/AppRoleContext';
import ShortcutIconButton from '../components/ShortcutIconButton';
import RecordIcon from '../components/icons/RecordIcon';
import EntitiesIcon from '../components/icons/EntitiesIcon';
import PendingRecordIcon from '../components/icons/PendingRecordIcon';
import ChannelIcon from '../components/icons/ChannelIcon';
import RecentActivitiesList from '../components/dashboard/RecentActivitiesList';
import type { Activity as WorkspaceActivity } from '../types';

const DashboardCharts = lazy(() => import('../components/dashboard/DashboardCharts'));
const WORKSPACE_LEDGER_LABEL = 'Workspace ledger';

/** `YYYY-MM-DD` only — use local noon so day/hour charts match the calendar date, not UTC midnight. */
function parseActivityScheduleDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  const t = dateStr.trim();
  if (!t) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (ymd) {
    const y = Number(ymd[1]);
    const mo = Number(ymd[2]);
    const d = Number(ymd[3]);
    return new Date(y, mo - 1, d, 12, 0, 0, 0);
  }
  const parsed = new Date(t);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Prefer `created_at` for “when it happened”; else scheduled `date`. */
function activityHeatmapInstant(activity: Pick<WorkspaceActivity, 'date' | 'created_at'>): Date | null {
  if (activity.created_at) {
    const fromCreated = new Date(activity.created_at);
    if (!Number.isNaN(fromCreated.getTime())) return fromCreated;
  }
  return parseActivityScheduleDate(activity.date);
}

export default function Dashboard({ embedded = false }: { embedded?: boolean }) {
  const { entities, entityBalances, activities, recordsByActivityId, records, auditOrgs, auditActivities, auditAnomalies } = useData();
  const { canAccessAdminUi } = useAppRole();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { getMetricLabel, getActionText } = useLabels();

  if (!canAccessAdminUi) {
    return <Navigate to="/activity" replace />;
  }

  const visibleActivities = useMemo(
    () => activities.filter(activity => activity.label !== WORKSPACE_LEDGER_LABEL),
    [activities],
  );
  const visibleAuditActivities = useMemo(
    () => auditActivities.filter(activity => activity.activity_label !== WORKSPACE_LEDGER_LABEL),
    [auditActivities],
  );
  const entityBalanceRows = useMemo(
    () => Array.from(entityBalances.values()),
    [entityBalances],
  );

  // Stats Calculation
  const totalActivitys = visibleActivities.length;
  const totalEntitys = entities.length;
  const safeRecords = records ?? [];
  const totalInflow = orgAuditValue(auditOrgs[0], 'total_increase');
  const totalOutflow = orgAuditValue(auditOrgs[0], 'total_decrease');
  const appliedNet = orgAuditValue(auditOrgs[0], 'net_amount');
  const appliedRecordCount = auditOrgs[0]?.applied_record_count ?? 0;

  const totalDeferredActive = useMemo(() =>
    safeRecords.filter(r => r.status === 'deferred' || r.status === 'pending')
      .reduce((sum, r) => sum + (r.unit_amount ?? 0), 0),
    [safeRecords]);
  const pendingRecordCount = useMemo(
    () => safeRecords.filter(r => r.status === 'deferred' || r.status === 'pending').length,
    [safeRecords],
  );
  const activeActivitysCount = useMemo(
    () => visibleActivities.filter(activity => activity.status === 'active').length,
    [visibleActivities],
  );
  const activeEntityCount = useMemo(
    () => entityBalanceRows.filter(row => row.record_count > 0 || row.last_active).length,
    [entityBalanceRows],
  );
  const orgAudit = auditOrgs[0] ?? null;
  const brokenActivityCount = useMemo(
    () => visibleAuditActivities.filter(item => item.status === 'broken').length,
    [visibleAuditActivities],
  );
  const errorAnomalyCount = useMemo(
    () => auditAnomalies.filter(item => item.severity === 'error').length,
    [auditAnomalies],
  );
  const shouldShowAuditAlert = Boolean(
    orgAudit && (orgAudit.status === 'broken' || auditAnomalies.length > 0 || brokenActivityCount > 0),
  );

  const topOutcomes = useMemo(() => {
    return entityBalanceRows
      .filter(row => row.record_count > 0 || Math.abs(row.net) > 0.01)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 5)
      .map(row => ({
        name: row.name,
        net: row.net,
        isPositive: row.net >= 0
      }));
  }, [entityBalanceRows]);

  const auditActivityById = useMemo(
    () => new Map(visibleAuditActivities.map(item => [item.activity_id, item])),
    [visibleAuditActivities],
  );
  
  // Recent activity (last 5 activities)
  const recentActivitys = useMemo(() => [...visibleActivities]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5), [visibleActivities]);

  // Hourly Heatmap Data
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const activeHeatmapData = useMemo(() => {
    const heatmapData = new Map<string, { day: number; hour: number; value: number }>();

    visibleActivities.forEach(activity => {
      const date = activityHeatmapInstant(activity);
      if (!date) return;

      const day = date.getDay();
      const hour = date.getHours();
      const key = `${day}-${hour}`;
      
      const existing = heatmapData.get(key);
      if (existing) {
        existing.value += 1;
      } else {
        heatmapData.set(key, { day, hour, value: 1 });
      }
    });

    return Array.from(heatmapData.values());
  }, [visibleActivities]);

  // Weekly Flow Trend (Last 7 Days)
  const flowTrend = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    const totalsByDate = new Map(last7Days.map(dateStr => [dateStr, 0]));

    safeRecords.forEach(record => {
      if (record.status !== 'applied') return;
      const dateStr = (record.created_at || '').slice(0, 10);
      if (!totalsByDate.has(dateStr)) return;

      const signedAmount = record.direction === 'increase'
        ? record.unit_amount
        : record.direction === 'decrease'
          ? -record.unit_amount
          : 0;

      totalsByDate.set(dateStr, (totalsByDate.get(dateStr) || 0) + signedAmount);
    });

    return last7Days.map(dateStr => {
      return {
        date: new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' }),
        value: totalsByDate.get(dateStr) || 0,
      };
    });
  }, [safeRecords]);

  const workspaceHealthTone = orgAudit?.status === 'broken' ? 'text-red-700 dark:text-red-300 border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/20' : 'text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 bg-emerald-50/80 dark:bg-emerald-950/20';
  const workspaceHealthLabel = orgAudit?.status === 'broken' ? 'Needs review' : 'Healthy';

  return (
    <div className="page-shell animate-in fade-in">
      {!embedded && (
        <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 shadow-sm border border-stone-200 dark:border-stone-700">
              <LayoutDashboard size={24} className="text-stone-900 dark:text-stone-100" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Overview</h2>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Live workspace view powered by records, balances, and audit checks from the database.</p>
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold', workspaceHealthTone)}>
              {workspaceHealthLabel}
            </span>
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                {getMetricLabel('activities')}: <span className="font-mono text-stone-900 dark:text-stone-100">{totalActivitys}</span>
              </span>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                {getMetricLabel('entities')}: <span className="font-mono text-stone-900 dark:text-stone-100">{totalEntitys}</span>
              </span>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                Active {getMetricLabel('activities')}: <span className="font-mono text-stone-900 dark:text-stone-100">{activeActivitysCount}</span>
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

      {/* Shortcut Actions Strip */}
      <div className="section-card p-3 lg:p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <ShortcutIconButton
            icon={<RecordIcon />}
            label={getActionText('startActivity')}
            onClick={() => navigate('/activity?action=create-activity')}
            variant="primary"
          />
          <ShortcutIconButton
            icon={<EntitiesIcon />}
            label={getActionText('addEntity')}
            onClick={() => navigate('/entities?action=add-entity')}
          />
          <ShortcutIconButton
            icon={<PendingRecordIcon />}
            label={getActionText('recordDeferredActivityRecord')}
            onClick={() => navigate('/entities?action=add-deferred')}
          />
          <ShortcutIconButton
            icon={<ChannelIcon />}
            label={`Open ${getMetricLabel('channels')}`}
            onClick={() => navigate('/channels')}
          />
        </div>
      </div>

      {shouldShowAuditAlert && (
        <div className="section-card border-red-200/80 bg-red-50/70 dark:border-red-900/70 dark:bg-red-950/20 p-4 lg:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700 dark:text-red-300">Audit alert</p>
              <h3 className="mt-1 text-lg font-semibold text-red-900 dark:text-red-100">Ledger imbalance detected</h3>
              <p className="mt-1 text-sm text-red-800/90 dark:text-red-200/90">
                Workspace net is {formatValue(orgAudit?.net_amount ?? 0)}. {brokenActivityCount} broken activities and {auditAnomalies.length} anomalies need review.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate('/activity')} className="action-btn-secondary border-red-300/80 bg-white/80 text-red-900 hover:bg-white dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">
                Review activities
              </button>
              <button type="button" onClick={() => navigate('/channels')} className="action-btn-secondary border-red-300/80 bg-white/80 text-red-900 hover:bg-white dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">
                Review channels
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-red-900 dark:text-red-100">
            <span className="rounded-full border border-red-300/80 dark:border-red-800 px-2.5 py-1">Errors: {errorAnomalyCount}</span>
            <span className="rounded-full border border-red-300/80 dark:border-red-800 px-2.5 py-1">Broken activities: {brokenActivityCount}</span>
            <span className="rounded-full border border-red-300/80 dark:border-red-800 px-2.5 py-1">Total anomalies: {auditAnomalies.length}</span>
          </div>
        </div>
      )}

      <div className="section-card p-0 overflow-hidden">
        <div className="grid grid-cols-1 gap-px bg-stone-200/80 sm:grid-cols-2 lg:grid-cols-4 dark:bg-stone-800/80">
          <StatCard
            label="Workspace balance"
            value={formatCompactValue(appliedNet)}
            fullValue={formatValue(appliedNet)}
            icon={<Circle className="text-[var(--accent)]" />}
            numericValue={appliedNet}
            trend={orgAudit?.status === 'broken' ? 'Out of balance' : 'In balance'}
            onClick={() => navigate('/channels')}
          />
          <StatCard
            label="Applied inflow"
            value={formatCompactValue(totalInflow)}
            fullValue={formatValue(totalInflow)}
            icon={<TrendingUp className="text-[var(--success)]" />}
            numericValue={totalInflow}
            onClick={() => navigate('/channels')}
          />
          <StatCard
            label="Applied outflow"
            value={formatCompactValue(totalOutflow)}
            fullValue={formatValue(totalOutflow)}
            icon={<TrendingDown className="text-[var(--danger)]" />}
            numericValue={-totalOutflow}
            onClick={() => navigate('/channels')}
          />
          <StatCard
            label="Pending review"
            value={formatCompactValue(totalDeferredActive)}
            fullValue={formatValue(totalDeferredActive)}
            icon={<Clock className="text-[var(--warning)]" />}
            numericValue={totalDeferredActive}
            trend={`${pendingRecordCount} records`}
            onClick={() => navigate('/channels')}
          />
          <StatCard
            label="Open activities"
            value={formatCompactNumber(activeActivitysCount)}
            fullValue={activeActivitysCount.toString()}
            icon={<Activity className="text-[var(--accent)]" />}
            highlight={activeActivitysCount > 0}
            onClick={() => navigate('/activity')}
          />
          <StatCard
            label="Active entities"
            value={formatCompactNumber(activeEntityCount)}
            fullValue={activeEntityCount.toString()}
            icon={<Award className="text-[var(--accent)]" />}
            onClick={() => navigate('/entities')}
          />
          <StatCard
            label="Applied records"
            value={formatCompactNumber(appliedRecordCount)}
            fullValue={appliedRecordCount.toString()}
            icon={<Circle className="text-[var(--accent)]" />}
            onClick={() => navigate('/activity')}
          />
          <StatCard
            label="Broken activities"
            value={formatCompactNumber(brokenActivityCount)}
            fullValue={brokenActivityCount.toString()}
            icon={<AlertCircle className="text-[var(--danger)]" />}
            numericValue={brokenActivityCount > 0 ? -brokenActivityCount : 0}
            className=""
            trend={auditAnomalies.length > 0 ? `${auditAnomalies.length} anomalies` : 'No anomalies'}
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
              <RecentActivitiesList 
                activities={visibleActivities}
                recordsByActivityId={recordsByActivityId}
                limit={5}
              />
            }

          />
        </Suspense>
      </DeferredRender>
    </div>
  );
}

function orgAuditValue(orgAudit: { total_increase?: number; total_decrease?: number; net_amount?: number } | null | undefined, field: 'total_increase' | 'total_decrease' | 'net_amount') {
  return orgAudit?.[field] ?? 0;
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
