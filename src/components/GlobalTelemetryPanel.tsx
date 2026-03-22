import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertCircle, Clock3, ExternalLink, Briefcase } from 'lucide-react';
import ContextPanel from './ContextPanel';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { formatDate, formatCompactValue } from '../lib/utils';
import { useLabels } from '../lib/labels';

interface GlobalTelemetryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Remove local formatValueCompact as we'll use the one from utils

export default function GlobalTelemetryPanel({ isOpen, onClose }: GlobalTelemetryPanelProps) {
  const navigate = useNavigate();
  const { workspaces, entries, reserveEntries, systemEvents } = useData();
  const { canManageValue } = useAppRole();
  const { getEventLabel, getMetricLabel, getActionText } = useLabels();

  const activeWorkspaceIds = useMemo(
    () => new Set(workspaces.filter(workspace => workspace.status === 'active').map(workspace => workspace.id)),
    [workspaces],
  );

  const activeEntries = useMemo(
    () => entries.filter(entry => activeWorkspaceIds.has(entry.workspace_id) && !entry.left_at),
    [activeWorkspaceIds, entries],
  );



  const discrepancyWarnings = useMemo(() => {
    const warningList: Array<{ workspaceId: string; date?: string; discrepancy: number }> = [];

    workspaces.forEach(workspace => {
      if (workspace.status !== 'active') return;
      const workspaceEntries = entries.filter(entry => entry.workspace_id === workspace.id);
      const totalInflow = workspaceEntries.reduce((sum, entry) => sum + entry.input_amount, 0);
      const totalOutflow = workspaceEntries.reduce((sum, entry) => sum + entry.output_amount, 0);
      const discrepancy = totalOutflow - totalInflow;
      if (Math.abs(discrepancy) >= 0.01) {
        warningList.push({ workspaceId: workspace.id, date: workspace.date, discrepancy });
      }
    });

    return warningList
      .sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy))
      .slice(0, 6);
  }, [workspaces, entries]);

  const activeTotalTotal = useMemo(
    () => activeEntries.reduce((sum, entry) => sum + (entry.output_amount || 0), 0),
    [activeEntries],
  );

  const pendingAlignmentAlerts = useMemo<Array<{ id: string }>>(
    () => [],
    [],
  );

  const issueItems = useMemo(() => {
    const items: Array<{
      id: string;
      route: string;
      tone: 'amber' | 'red';
      label: string;
      detail: string;
      priority: number;
    }> = [];

    if (canManageValue) {
      pendingAlignmentAlerts.slice(0, 3).forEach(alert => {
        items.push({
          id: `alignment-${alert.id}`,
          route: '/channels',
          tone: 'amber',
          label: 'Pending alignment',
          detail: 'Alignment request awaiting output.',
          priority: 0,
        });
      });
    }

    discrepancyWarnings.forEach(item => {
      const shortId = item.workspaceId.slice(0, 8).toUpperCase();
      items.push({
        id: `imtotal-${item.workspaceId}`,
        route: `/activity/${item.workspaceId}`,
        tone: 'red',
        label: 'Activity variance',
        detail: `${item.date ? `${formatDate(item.date)} · ` : ''}Activity ${shortId} · ${formatCompactValue(item.discrepancy)}`,
        priority: 1,
      });
    });

    return items.sort((a, b) => a.priority - b.priority);
  }, [canManageValue, discrepancyWarnings, pendingAlignmentAlerts]);

  const recentActions = useMemo(
    () => [...systemEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 14),
    [systemEvents],
  );

  const openRoute = (route: string) => {
    onClose();
    navigate(route);
  };

  return (
    <ContextPanel isOpen={isOpen} onClose={onClose}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
            <Activity size={16} className="text-emerald-600 dark:text-emerald-400" />
            Control Panel
          </h3>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">Issues · Overview · Activity Log</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">

          {/* Issues */}
          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-stone-400">Issues</p>
            <div className="space-y-2">
              {issueItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openRoute(item.route)}
                  className={item.tone === 'amber'
                    ? 'w-full text-left rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/20 px-3 py-2'
                    : 'w-full text-left rounded-lg border border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-900/20 px-3 py-2'}
                >
                  <p className={item.tone === 'amber'
                    ? 'text-xs font-medium text-amber-800 dark:text-amber-400 inline-flex items-center gap-1'
                    : 'text-xs font-medium text-red-800 dark:text-red-400 inline-flex items-center gap-1'}>
                    {item.tone === 'amber' ? <Briefcase size={12} /> : <AlertCircle size={12} />}
                    {item.label}
                  </p>
                  <p className={item.tone === 'amber'
                    ? 'text-[11px] text-amber-700 dark:text-amber-300 mt-0.5 truncate'
                    : 'text-[11px] text-red-700 dark:text-red-300 mt-0.5'}>
                    {item.detail}
                  </p>
                </button>
              ))}

              {issueItems.length === 0 && (
                <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                  No open issues.
                </div>
              )}
            </div>
          </section>

          {/* Overview */}
          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-stone-400">Overview</p>
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500 dark:text-stone-400">{getMetricLabel('openActivities')}</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{activeWorkspaceIds.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 dark:text-stone-400">{getMetricLabel('activeUnits')}</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{activeEntries.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 dark:text-stone-400">{getMetricLabel('netTotal')}</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{formatCompactValue(activeTotalTotal)}</span>
              </div>
            </div>
          </section>

          {/* Activity Log */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-stone-400">Activity Log</p>
              <button
                type="button"
                onClick={() => openRoute('/activity')}
                className="text-[11px] text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
              >
                {getActionText('viewAll')}
                <ExternalLink size={11} />
              </button>
            </div>
            <div className="space-y-1.5">
              {recentActions.map(event => (
                <div
                  key={event.id}
                  className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2"
                >
                  <p className="text-xs text-stone-900 dark:text-stone-100 truncate">{getEventLabel(event.action)}</p>
                  <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 inline-flex items-center gap-1">
                    <Clock3 size={11} />
                    {formatTime(event.timestamp)} · by {event.actor_role}
                  </p>
                </div>
              ))}
              {recentActions.length === 0 && (
                <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                  No recent activity.
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </ContextPanel>
  );
}
