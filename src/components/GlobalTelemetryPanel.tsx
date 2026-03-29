import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertCircle, Clock3, ExternalLink, Scale } from 'lucide-react';
import ContextPanel from './ContextPanel';
import { useData } from '../context/DataContext';
import { formatDate, formatCompactValue } from '../lib/utils';
import { useLabels, LABELS } from '../lib/labels';

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
  const { activities, auditActivities, auditChannels, auditOrgs, auditAnomalies, systemEvents } = useData();
  const { getEventLabel, getMetricLabel, getActionText } = useLabels();

  const activeActivityIds = useMemo(
    () => new Set(activities.filter(activity => activity.status === 'active').map(activity => activity.id)),
    [activities],
  );

  const orgAudit = auditOrgs[0] ?? null;

  const watchActivities = useMemo(
    () => auditActivities
      .filter(item => item.status === 'broken' || item.open_record_count > 0)
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'broken' ? -1 : 1;
        }
        return Math.abs(right.net_amount) - Math.abs(left.net_amount);
      })
      .slice(0, 5),
    [auditActivities],
  );

  const channelAlerts = useMemo(
    () => auditChannels.filter(channel => channel.status === 'broken').slice(0, 3),
    [auditChannels],
  );

  const issueItems = useMemo(() => {
    const routeForAnomaly = (anomaly: typeof auditAnomalies[number]) => {
      if (anomaly.activity_id) {
        return `/activity/${anomaly.activity_id}`;
      }

      if (anomaly.anomaly_type.includes('channel')) {
        return '/channels';
      }

      if (anomaly.entity_id) {
        return '/entities';
      }

      return '/activity';
    };

    const labelForAnomaly = (anomalyType: string) => {
      switch (anomalyType) {
        case 'activity_imbalance':
          return 'Activity imbalance';
        case 'org_imbalance':
          return 'Workspace imbalance';
        case 'channel_imbalance':
          return 'Channel imbalance';
        case 'missing_transfer_pair':
          return 'Transfer pair missing';
        case 'transfer_missing_target':
          return 'Transfer target missing';
        case 'invalid_exit_time':
          return 'Time anomaly';
        default:
          return 'Audit warning';
      }
    };

    const items: Array<{
      id: string;
      route: string;
      tone: 'amber' | 'red';
      label: string;
      detail: string;
      priority: number;
    }> = [];

    auditAnomalies.slice(0, 6).forEach(item => {
      items.push({
        id: item.anomaly_id,
        route: routeForAnomaly(item),
        tone: item.severity === 'error' ? 'red' : 'amber',
        label: labelForAnomaly(item.anomaly_type),
        detail: item.detail,
        priority: item.severity === 'error' ? 0 : 1,
      });
    });

    return items.sort((a, b) => a.priority - b.priority);
  }, [auditAnomalies]);

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
            <Scale size={16} className="text-emerald-600 dark:text-emerald-400" />
            {LABELS.workspacePanels.workspaceHealth.title}
          </h3>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{LABELS.workspacePanels.workspaceHealth.subtitle}</p>
          <p className="mt-1 text-[10px] text-stone-400 dark:text-stone-500">Attributed actions here are a live slice — for a full trail export, use Settings → Export with dataset “Audit trail”.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-stone-400">{LABELS.workspacePanels.workspaceHealth.sections.integrityIssues}</p>
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
                    {item.tone === 'amber' ? <Scale size={12} /> : <AlertCircle size={12} />}
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
                  {LABELS.workspacePanels.workspaceHealth.empty.noIntegrityIssues}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-stone-400">{LABELS.workspacePanels.workspaceHealth.sections.snapshot}</p>
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500 dark:text-stone-400">{getMetricLabel('openActivities')}</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{activeActivityIds.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 dark:text-stone-400">Broken activities</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{auditActivities.filter(item => item.status === 'broken').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 dark:text-stone-400">Open anomalies</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{auditAnomalies.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 dark:text-stone-400">Workspace net</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{formatCompactValue(orgAudit?.net_amount ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 dark:text-stone-400">Applied records</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{orgAudit?.applied_record_count ?? 0}</span>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-stone-400">{LABELS.workspacePanels.workspaceHealth.sections.watchlist}</p>
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
              {watchActivities.map(item => (
                <button
                  key={item.activity_id}
                  type="button"
                  onClick={() => openRoute(`/activity/${item.activity_id}`)}
                  className="w-full rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-xs font-medium text-stone-900 dark:text-stone-100">{item.activity_label}</p>
                    <span className={item.status === 'broken' ? 'text-[11px] font-medium text-red-700 dark:text-red-300' : 'text-[11px] font-medium text-amber-700 dark:text-amber-300'}>
                      {item.status === 'broken' ? 'Broken' : `${item.open_record_count} open`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                    {formatDate(item.activity_date)} · Net {formatCompactValue(item.net_amount)}
                  </p>
                </button>
              ))}
              {watchActivities.length === 0 && channelAlerts.length > 0 && (
                channelAlerts.map(channel => (
                  <button
                    key={channel.channel_label}
                    type="button"
                    onClick={() => openRoute('/channels')}
                    className="w-full rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-left"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-xs font-medium text-stone-900 dark:text-stone-100">{channel.channel_label}</p>
                      <span className="text-[11px] font-medium text-red-700 dark:text-red-300">Broken</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">Net {formatCompactValue(channel.net_amount)}</p>
                  </button>
                ))
              )}
              {watchActivities.length === 0 && channelAlerts.length === 0 && (
                <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                  {LABELS.workspacePanels.workspaceHealth.empty.noWatchlistItems}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-stone-400">{LABELS.workspacePanels.workspaceHealth.sections.recentAttributedActions}</p>
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
                  {LABELS.workspacePanels.workspaceHealth.empty.noAttributedActions}
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </ContextPanel>
  );
}
