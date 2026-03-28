import React, { useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Radio, Clock, UserCheck } from 'lucide-react';
import { useData } from '../context/DataContext';
import { cn, formatDate } from '../lib/utils';
import ContextBreadcrumbs from '../components/ContextBreadcrumbs';
import { useLabels } from '../lib/labels';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds?: number): string {
  if (!seconds || seconds < 1) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return formatDate(iso);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ActivityMonitor() {
  const { activityLogs } = useData();
  const { tx } = useLabels();

  // Advanced filters (collapsed by default)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'operator'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'ended'>('all');

  // Derive counts
  const activeCount = useMemo(
    () => activityLogs.filter(l => l.is_active).length,
    [activityLogs]
  );

  // Sorted + filtered feed
  const feed = useMemo(() => {
    return [...activityLogs]
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .filter(l => {
        if (roleFilter !== 'all' && l.actor_role !== roleFilter) return false;
        if (statusFilter === 'active' && !l.is_active) return false;
        if (statusFilter === 'ended' && l.is_active) return false;
        return true;
      });
  }, [activityLogs, roleFilter, statusFilter]);

  return (
    <div className="page-shell space-y-5 animate-in fade-in">
      {/* Header */}
      <div className="section-card px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <ContextBreadcrumbs items={[tx('Activity Monitor')]} className="mb-1" />
          <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            {tx('Activity Monitor')}
          </h2>
        </div>

        {/* Key number */}
        <div className="text-right shrink-0">
          <p className="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">
            {activeCount > 0 ? 'Active now' : 'Total logged'}
          </p>
          <p className={cn(
            'tabular-nums font-mono text-3xl font-bold leading-none',
            activeCount > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-stone-900 dark:text-stone-100'
          )}>
            {activeCount > 0 ? activeCount : activityLogs.length}
          </p>
        </div>
      </div>

      {/* Advanced filters */}
      <div className="section-card overflow-hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(p => !p)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
        >
          <span className="font-medium">Advanced</span>
          {filtersOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {filtersOpen && (
          <div className="px-5 pb-4 border-t border-stone-100 dark:border-stone-800 pt-3 flex flex-wrap gap-3 animate-in fade-in slide-in-from-top-1">
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-stone-400">Role</label>
              <select
                className="control-input text-sm"
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as typeof roleFilter)}
              >
                <option value="all">All roles</option>
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-stone-400">Status</label>
              <select
                className="control-input text-sm"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="section-card divide-y divide-stone-100 dark:divide-stone-800">
        {feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-stone-400 dark:text-stone-500">
            <Radio size={28} strokeWidth={1.5} />
            <p className="text-sm">No activity yet</p>
          </div>
        ) : (
          feed.map(log => (
            <div
              key={log.id}
              className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
            >
              {/* Status dot */}
              <span className={cn(
                'shrink-0 w-2 h-2 rounded-full',
                log.is_active
                  ? 'bg-emerald-500 shadow-[0_0_6px_theme(colors.emerald.400)]'
                  : 'bg-stone-300 dark:bg-stone-600'
              )} />

              {/* Label + meta */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                  {log.actor_label || log.actor_role}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
                  <span className="flex items-center gap-1">
                    <UserCheck size={10} />
                    {log.actor_role}
                  </span>
                  {log.duration_seconds != null && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDuration(log.duration_seconds)}
                    </span>
                  )}
                </div>
              </div>

              {/* Time */}
              <p className="shrink-0 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
                {timeAgo(log.started_at)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
