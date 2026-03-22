import React, { useEffect, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { Plus, Calendar, ChevronRight, Smartphone, Clock, Trash2, Loader2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { APP_MIN_DATE, cn, formatValue, formatDate } from '../lib/utils';
import { useNotification } from '../context/NotificationContext';
import { useAppRole } from '../context/AppRoleContext';
import { useAuth } from '../context/AuthContext';
import DataActionMenu from '../components/DataActionMenu';
import LoadingLine from '../components/LoadingLine';
import { useLabels } from '../lib/labels';
import EmptyState from '../components/EmptyState';

export default function Activities({ embedded = false }: { embedded?: boolean }) {
  const { workspaces, addWorkspace, deleteWorkspace, entries, units, loading, loadingProgress } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { role, canOperateLog } = useAppRole();
  const { user } = useAuth();
  const { tx } = useLabels();
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [saveWorkspaceProgress, setSaveWorkspaceProgress] = useState(0);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [isArchivedSectionExpanded, setIsArchivedSectionExpanded] = useState(false);
  const saveWorkspaceProgressTimerRef = useRef<number | null>(null);
  const saveWorkspaceProgressResetTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // New Workspace Form
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(new Date().toTimeString().slice(0, 5));

  // New Fields
  const [channel, setChannel] = useState('Channel 1');

  const clearSaveWorkspaceProgressTimers = () => {
    if (saveWorkspaceProgressTimerRef.current !== null) {
      window.clearInterval(saveWorkspaceProgressTimerRef.current);
      saveWorkspaceProgressTimerRef.current = null;
    }
    if (saveWorkspaceProgressResetTimerRef.current !== null) {
      window.clearTimeout(saveWorkspaceProgressResetTimerRef.current);
      saveWorkspaceProgressResetTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearSaveWorkspaceProgressTimers();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (action !== 'create-activity') return;

    if (!canOperateLog) {
      notify({ type: 'error', message: 'Only admin/operator can create an activity.' });
      return;
    }

    setIsCreating(true);
    params.delete('action');
    const next = params.toString();
    navigate({ pathname: location.pathname, search: next ? `?${next}` : '' }, { replace: true });
  }, [canOperateLog, location.pathname, location.search, navigate, notify]);

  const buildStartTime = (workspaceDate: string, workspaceTime: string) => {
    if (!workspaceDate || !workspaceTime) return undefined;
    const combined = new Date(`${workspaceDate}T${workspaceTime}:00`);
    if (Number.isNaN(combined.getTime())) return undefined;
    return combined.toISOString();
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingWorkspace) return;
    if (!canOperateLog) {
      notify({ type: 'error', message: 'Only admin/operator can create an activity.' });
      return;
    }

    let created = false;
    clearSaveWorkspaceProgressTimers();
    setIsSavingWorkspace(true);
    let progress = 8;
    setSaveWorkspaceProgress(progress);
    saveWorkspaceProgressTimerRef.current = window.setInterval(() => {
      progress = Math.min(progress + (progress < 70 ? 10 : progress < 90 ? 4 : 1), 92);
      setSaveWorkspaceProgress(progress);
    }, 120);

    try {
      await addWorkspace({
        date,
        start_time: buildStartTime(date, startTime),
        status: 'active',
        assigned_operator_id: user?.id,
        activity_category: 'Standard',
        channel,
        org_code: undefined,
      });
      created = true;
      clearSaveWorkspaceProgressTimers();
      setSaveWorkspaceProgress(100);
      // Reset form
      setDate(new Date().toISOString().split('T')[0]);
      setStartTime(new Date().toTimeString().slice(0, 5));
      setChannel('Channel 1');
      notify({ type: 'success', message: 'Activity created successfully.' });
    } catch (error: any) {
      clearSaveWorkspaceProgressTimers();
      setSaveWorkspaceProgress(100);
      notify({ type: 'error', message: error?.message || 'Unable to create activity.' });
    } finally {
      saveWorkspaceProgressResetTimerRef.current = window.setTimeout(() => {
        setIsSavingWorkspace(false);
        setSaveWorkspaceProgress(0);
        if (created) {
          setIsCreating(false);
        }
        saveWorkspaceProgressResetTimerRef.current = null;
      }, 360);
    }
  };

  const handleExportCSV = async () => {
    const Papa = (await import('papaparse')).default;
    const exportData = entries.map(entry => {
      const workspace = workspaces.find(g => g.id === entry.workspace_id);
      const unit = units.find(p => p.id === entry.unit_id);
      return {
        ActivityDate: workspace ? formatDate(workspace.date) : 'Unknown',
        Channel: workspace?.channel || 'Unknown',
        WorkspaceCode: workspace?.org_code || '',
        ActivityType: tx(workspace?.activity_category || ''),
        Participant: unit?.name || 'Unknown',
        Inflow: entry.input_amount,
        Outflow: entry.output_amount,
        ValueDelta: entry.net,
      };
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `activities_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteWorkspace = async (event: React.MouseEvent, workspaceId: string) => {
    event.preventDefault();
    event.stopPropagation();

    if (deletingWorkspaceId === workspaceId) return;

    const confirmed = window.confirm('Delete this activity? This will remove related entries records for that activity.');
    if (!confirmed) return;

    try {
      setDeletingWorkspaceId(workspaceId);
      await deleteWorkspace(workspaceId);
      notify({ type: 'success', message: 'Activity deleted successfully.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to delete activity.' });
    } finally {
      setDeletingWorkspaceId(current => (current === workspaceId ? null : current));
    }
  };

  const activeActivitys = workspaces
    .filter(workspace => workspace.status === 'active')
    .filter(workspace => {
      // Active activitys should be private to the assigned operator.
      if (role === 'admin' || role === 'viewer') return true;
      if (role === 'operator') {
        if (!user?.id) return false;
        return workspace.assigned_operator_id === user.id;
      }
      return false;
    });
  const completedActivitys = workspaces
    .filter(workspace => workspace.status === 'completed')
    .filter(workspace => {
      if (role === 'admin' || role === 'viewer') return true;
      if (role === 'operator') {
        if (!user?.id) return false;
        return workspace.assigned_operator_id === user.id;
      }
      return false;
    });
  const archivedActivitys = workspaces
    .filter(workspace => workspace.status === 'archived')
    .filter(workspace => {
      if (role === 'admin' || role === 'viewer') return true;
      if (role === 'operator') {
        if (!user?.id) return false;
        return workspace.assigned_operator_id === user.id;
      }
      return false;
    });

  const renderWorkspaceCard = (workspace: typeof workspaces[number]) => {
    const workspaceEntries = entries.filter(l => l.workspace_id === workspace.id);
    const totalEntryValue = workspaceEntries.reduce((sum, e) => sum + e.input_amount, 0);
    const unitCount = new Set(workspaceEntries.map(e => e.unit_id)).size;

    return (
      <Link
        key={workspace.id}
        to={`/activity/${workspace.id}`}
        className="block section-card-hover interactive-3d p-6 group"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center text-stone-500 dark:text-stone-400 group-hover:bg-stone-900 dark:group-hover:bg-stone-100 group-hover:text-white dark:group-hover:text-stone-900 transition-colors shrink-0 shadow-sm">
              <Calendar size={20} />
            </div>
            <div>
              <h3 className="font-medium text-stone-900 dark:text-stone-100 text-lg">{formatDate(workspace.date)}</h3>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <Smartphone size={12} />
                  {workspace.channel || 'Unknown'}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <Clock size={12} />
                  {workspace.start_time
                    ? new Date(workspace.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Time N/A'}
                </div>
                <div className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  workspace.status === 'active'
                    ? 'badge-active'
                    : workspace.status === 'completed'
                      ? 'badge-completed'
                      : 'badge-archived'
                }`}>
                  {workspace.status}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-8 border-t md:border-t-0 border-stone-100 dark:border-stone-800 pt-4 md:pt-0">
            <div className="text-left md:text-right">
              <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider">Entry Value</p>
              <p className="font-mono font-medium text-stone-900 dark:text-stone-100">{formatValue(totalEntryValue)}</p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider">Participants</p>
              <p className="font-medium text-stone-900 dark:text-stone-100">{unitCount}</p>
            </div>
            <button
              type="button"
              onClick={(event) => { void handleDeleteWorkspace(event, workspace.id); }}
              disabled={deletingWorkspaceId === workspace.id}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-400 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-red-900 dark:hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-70"
              title={deletingWorkspaceId === workspace.id ? tx('Deleting activity…') : tx('Delete Activity')}
            >
              {deletingWorkspaceId === workspace.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
            <ChevronRight className="text-stone-300 dark:text-stone-700 group-hover:text-stone-600 dark:group-hover:text-stone-300 hidden md:block" />
          </div>
        </div>
      </Link>
    );
  };

  const handleImportWorkspacesFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const Papa = (await import('papaparse')).default;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = (results.data as Record<string, string | number | null | undefined>[])
          .filter(row => row && Object.values(row).some(value => String(value ?? '').trim().length > 0));

        let createdCount = 0;
        let failedCount = 0;

        const parseStartTime = (workspaceDate: string, row: Record<string, string | number | null | undefined>) => {
          const startRaw = String(
            row.StartTime ?? row.start_time ?? row.Start ?? row.start ?? row.STARTTIME ?? row.START ?? '',
          ).trim();
          if (!startRaw) return undefined;

          if (startRaw.includes('T')) {
            const isoDate = new Date(startRaw);
            return Number.isNaN(isoDate.getTime()) ? undefined : isoDate.toISOString();
          }

          const combined = new Date(`${workspaceDate}T${startRaw.length === 5 ? `${startRaw}:00` : startRaw}`);
          return Number.isNaN(combined.getTime()) ? undefined : combined.toISOString();
        };

        for (const row of rows) {
          const dateRaw = String(row.ActivityDate ?? row.activity_date ?? row.activitydate ?? row.Date ?? row.date ?? row.DATE ?? '').trim();
          if (!dateRaw) {
            failedCount += 1;
            continue;
          }

          const normalizedDate = (() => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return dateRaw;
            const parsed = new Date(dateRaw);
            if (Number.isNaN(parsed.getTime())) return '';
            return parsed.toISOString().split('T')[0];
          })();

          if (!normalizedDate) {
            failedCount += 1;
            continue;
          }

          const statusRaw = String(row.Status ?? row.status ?? row.STATUS ?? 'active').trim().toLowerCase();
          const normalizedStatus: 'active' | 'completed' | 'archived' =
            statusRaw === 'archived'
              ? 'archived'
              : (statusRaw === 'completed' || statusRaw === 'closed' || statusRaw === 'aligned')
                ? 'completed'
                : 'active';

          try {
            await addWorkspace({
              date: normalizedDate,
              start_time: parseStartTime(normalizedDate, row),
              status: normalizedStatus,
              activity_category: String(row.ActivityType ?? row.activity_category ?? row.activitytype ?? row.ActivityCategory ?? row.activity_category ?? row.ACTIVITYCATEGORY ?? 'Standard').trim() || 'Standard',
              channel: String(row.Channel ?? row.channel ?? row.PLATFORM ?? 'Channel 1').trim() || 'Channel 1',
              org_code: String(row.WorkspaceCode ?? row.workspace_code ?? row.workspacecode ?? row.OrgCode ?? row.org_code ?? row.orgcode ?? '').trim() || undefined,
            });
            createdCount += 1;
          } catch {
            failedCount += 1;
          }
        }

        if (createdCount > 0 && failedCount === 0) {
          notify({ type: 'success', message: `Imported ${createdCount} activities from CSV.` });
        } else if (createdCount > 0) {
          notify({ type: 'info', message: `Imported ${createdCount} activities. Skipped ${failedCount} invalid row${failedCount > 1 ? 's' : ''}.` });
        } else {
          notify({ type: 'error', message: 'No valid activities were imported from CSV.' });
        }
      },
      error: () => {
        notify({ type: 'error', message: 'Failed to parse activities CSV file.' });
      },
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="page-shell">
      {!embedded ? (
        <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
              Activity Registry
            </div>
            <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">Activity History</h2>
            <p className="text-stone-500 dark:text-stone-400 text-sm">{tx('Track live operations, archived activity, and activity details in one place.')}</p>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                {tx('Activities')}: <span className="font-mono text-stone-900 dark:text-stone-100">{workspaces.length}</span>
              </span>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(0,1fr)_auto]">
              <DataActionMenu
                className="flex-1 sm:flex-none"
                items={[
                  { key: 'export', label: tx('Export CSV'), onClick: () => { void handleExportCSV(); } },
                  { key: 'import', label: tx('Import CSV'), onClick: () => fileInputRef.current?.click() },
                ]}
              />
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv"
                onChange={handleImportWorkspacesFile}
              />
              <button
                onClick={() => {
                  if (!canOperateLog) {
                    notify({ type: 'error', message: 'Only admin/operator can create an activity.' });
                    return;
                  }
                  setIsCreating(true);
                }}
                disabled={!canOperateLog}
                className="action-btn-primary flex-1 sm:flex-none justify-center min-h-[46px]"
                title="Create Activity (C then A)"
              >
                <Plus size={16} />
                {tx('New Activity')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(0,1fr)_auto] sm:justify-end">
          <DataActionMenu
            items={[
              { key: 'export', label: tx('Export CSV'), onClick: () => { void handleExportCSV(); } },
              { key: 'import', label: tx('Import CSV'), onClick: () => fileInputRef.current?.click() },
            ]}
          />
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={handleImportWorkspacesFile}
          />
          <button
            onClick={() => {
              if (!canOperateLog) {
                notify({ type: 'error', message: 'Only admin/operator can create an activity.' });
                return;
              }
              setIsCreating(true);
            }}
            disabled={!canOperateLog}
            className="action-btn-primary min-h-[46px] justify-center"
            title="Create Activity (C then A)"
          >
            <Plus size={16} />
            {tx('New Activity')}
          </button>
        </div>
      )}

      {isCreating && (
        <form onSubmit={handleCreateWorkspace} className="section-card p-6 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">{tx('Create Activity')}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* Date */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Date</label>
              <input 
                type="date"
                className="control-input" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                min={APP_MIN_DATE}
                required 
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Start Time</label>
              <input
                type="time"
                className="control-input"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                step={60}
                required
              />
            </div>

            {/* Channel */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Channel</label>
              <select 
                className="control-input"
                value={channel}
                onChange={e => setChannel(e.target.value)}
              >
                <option value="Channel 1">Channel 1</option>
                <option value="Channel 2">Channel 2</option>
                <option value="Channel 3">Channel 3</option>
                <option value="Other">Other</option>
              </select>
            </div>

          </div>

          <div className="flex justify-end gap-2">
            {saveWorkspaceProgress > 0 && (
              <div className="w-full mr-auto max-w-sm">
                <LoadingLine
                  compact
                  progress={saveWorkspaceProgress}
                  label={tx('Saving activity...')}
                />
              </div>
            )}
            <button 
              type="button" 
              onClick={() => setIsCreating(false)}
              disabled={isSavingWorkspace}
              className="action-btn-secondary"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSavingWorkspace}
              className="action-btn-primary"
            >
              {isSavingWorkspace ? tx('Saving...') : tx('Create Activity')}
            </button>
          </div>
        </form>
      )}

      {(loading || loadingProgress > 0) && (
        <div className="section-card p-3">
          <LoadingLine
            compact
            progress={Math.max(8, Math.min(100, loadingProgress || 8))}
            label="Syncing activities..."
          />
        </div>
      )}

      <div className="space-y-6">
        {activeActivitys.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{tx('Active Activities')}</h3>
            <div className="space-y-4">
              {activeActivitys.map(renderWorkspaceCard)}
            </div>
          </div>
        )}

        {completedActivitys.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{tx('Completed Activities')}</h3>
            <div className="space-y-4">
              {completedActivitys.map(renderWorkspaceCard)}
            </div>
          </div>
        )}

        {activeActivitys.length === 0 && role === 'operator' && (
          <div className="text-center py-8 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-900/70">
            <p className="text-stone-500 dark:text-stone-400 text-sm">{tx('No live activities are currently assigned to your operator account.')}</p>
          </div>
        )}

        {archivedActivitys.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{tx('Archived Activities')}</h3>
              <button
                type="button"
                onClick={() => setIsArchivedSectionExpanded(prev => !prev)}
                className="action-btn-secondary text-xs px-2.5 py-1.5"
              >
                {isArchivedSectionExpanded ? tx('Hide archived') : `${tx('Show archived')} (${archivedActivitys.length})`}
              </button>
            </div>
            {isArchivedSectionExpanded && (
              <div className="space-y-4">
                {archivedActivitys.map(renderWorkspaceCard)}
              </div>
            )}
          </div>
        )}

        {workspaces.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-900/70">
            <EmptyState
              title="No activities yet"
              description="Create your first activity to start tracking entries and outcomes."
              actionLabel="Create Activity"
              onAction={() => setIsCreating(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
