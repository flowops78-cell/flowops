import React, { useEffect, useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Plus, Calendar, ChevronRight, History, X, Loader2, Trash2, Scale, UserCog } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { APP_MIN_DATE, cn, formatValue, formatDate, formatTime } from '../lib/utils';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAppRole } from '../context/AppRoleContext';
import { useAuth } from '../context/AuthContext';
import LoadingLine from '../components/LoadingLine';
import { useLiveFeedUI } from '../context/LiveFeedUIContext';
import { useLabels, LABELS } from '../lib/labels';
import EmptyState from '../components/EmptyState';
import { Activity, ActivityRecord } from '../types';
import OverlaySavingState from '../components/OverlaySavingState';

type LoadingState = 'idle' | 'saving' | 'success' | 'error';

/** System activity used for workspace ledger rows — never bulk-delete. */
const SYSTEM_LEDGER_ACTIVITY_LABEL = 'Workspace ledger';

export default function Activities({ embedded = false }: { embedded?: boolean }) {
  const { 
    activities, 
    addActivity, 
    deleteActivity, 
    loading, 
    loadingProgress,
    recordsByActivityId
  } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { confirm } = useConfirm();
  const { role, canOperateLog, canManageImpact, canAccessAdminUi } = useAppRole();
  const { user } = useAuth();
  const { tx } = useLabels();
  const liveFeedUi = useLiveFeedUI();
  
  // States
  const [isCreating, setIsCreating] = useState(false);
  const [activityState, setActivityState] = useState<LoadingState>('idle');
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isArchivedSectionExpanded, setIsArchivedSectionExpanded] = useState(false);
  
  // New Activity Form
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(new Date().toTimeString().slice(0, 5));
  const [activityName, setActivityName] = useState('');

  const resetCreateActivityForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setStartTime(new Date().toTimeString().slice(0, 5));
    setActivityName('');
    setActivityState('idle');
  };

  const closeCreateOverlay = () => {
    if (activityState === 'saving') return;
    setIsCreating(false);
    resetCreateActivityForm();
  };

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

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activityState === 'saving') return;
    if (!canOperateLog) {
      notify({ type: 'error', message: 'Only admin/operator can create an activity.' });
      return;
    }

    setActivityState('saving');

    try {
      await addActivity({
        date,
        startTime,
        name: activityName.trim() || undefined,
        status: 'active',
        assigned_user_id: user?.id,
        activity_category: 'Standard',
      });
      setActivityState('success');
      setTimeout(() => {
        resetCreateActivityForm();
        setIsCreating(false);
        notify({ type: 'success', message: 'Activity created successfully.' });
      }, 1000);
    } catch (error: any) {
      setActivityState('error');
      notify({ type: 'error', message: error?.message || 'Unable to create activity.' });
    }
  };

  const handleDeleteActivity = async (event: React.MouseEvent, activityId: string) => {
    event.preventDefault();
    event.stopPropagation();

    if (deletingActivityId === activityId) return;

    const ok = await confirm({
      title: 'Delete activity?',
      message: 'This will remove related records for that activity.',
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      setDeletingActivityId(activityId);
      await deleteActivity(activityId);
      notify({ type: 'success', message: 'Activity deleted successfully.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to delete activity.' });
    } finally {
      setDeletingActivityId(null);
    }
  };

  const bulkDeletableIds = useMemo(
    () => activities.filter(a => a.label !== SYSTEM_LEDGER_ACTIVITY_LABEL).map(a => a.id),
    [activities],
  );

  const handleDeleteAllActivities = async () => {
    if (!canManageImpact || isDeletingAll || bulkDeletableIds.length === 0) return;

    const n = bulkDeletableIds.length;
    const ok = await confirm({
      title: 'Delete all activities?',
      message: `This will permanently remove ${n} ${n === 1 ? 'activity' : 'activities'} and every record tied to them. The workspace ledger activity stays. This cannot be undone.`,
      danger: true,
      confirmLabel: `Delete ${n}`,
    });
    if (!ok) return;

    setIsDeletingAll(true);
    let removed = 0;
    try {
      for (const id of bulkDeletableIds) {
        await deleteActivity(id);
        removed += 1;
      }
      notify({ type: 'success', message: removed === 1 ? 'Deleted 1 activity.' : `Deleted ${removed} activities.` });
    } catch (error: any) {
      notify({
        type: 'error',
        message:
          removed > 0
            ? `${error?.message || 'Delete failed'} (${removed} removed before the error.)`
            : error?.message || 'Unable to delete activities.',
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  const activeActivitys = activities
    .filter(activity => activity.status === 'active')
    .filter(activity => {
      if (role === 'admin' || role === 'viewer') return true;
      if (role === 'operator') {
        if (!user?.id) return false;
        return activity.assigned_user_id === user.id;
      }
      return false;
    });

  const completedActivitys = activities
    .filter(activity => activity.status === 'completed');

  const archivedActivitys = activities
    .filter(activity => activity.status === 'archived');

  const ActivityCard = useMemo(() => {
    return ({ 
      activity, 
      activityEntries, 
      onDelete, 
      deletingId,
      locksDeletes,
    }: { 
      activity: Activity; 
      activityEntries: ActivityRecord[]; 
      onDelete: (e: React.MouseEvent, id: string) => void;
      deletingId: string | null;
      locksDeletes: boolean;
    }) => {
      const totalrecordValue = activityEntries.reduce((sum, e) => sum + e.unit_amount, 0);
      const unitCount = new Set(activityEntries.map(e => e.entity_id)).size;

      return (
        <Link
          to={`/activity/${activity.id}`}
          className="block section-card-hover interactive-3d p-6 group"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center text-stone-500 dark:text-stone-400 group-hover:bg-stone-900 dark:group-hover:bg-stone-100 group-hover:text-white dark:group-hover:text-stone-900 transition-colors shrink-0 shadow-sm">
                <Calendar size={20} />
              </div>
              <div>
                <h3 className="font-medium text-stone-900 dark:text-stone-100 text-lg">
                  {activity.name || formatDate(activity.date)}
                </h3>
                {activity.name && (
                  <p className="text-xs text-stone-500 dark:text-stone-400 -mt-0.5">
                    {formatDate(activity.date)} @ {formatTime(activity.start_time || activity.date)}
                  </p>
                )}
                <div className="mt-1">
                  <div className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    activity.status === 'active' ? 'badge-active' :
                    activity.status === 'completed' ? 'badge-completed' : 'badge-archived'
                  )}>
                    {activity.status}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-8 border-t md:border-t-0 border-stone-100 dark:border-stone-800 pt-4 md:pt-0">
              <div className="text-left md:text-right">
                <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider">Entity Input</p>
                <p className="font-mono font-medium text-stone-900 dark:text-stone-100">{formatValue(totalrecordValue)}</p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider">Entities</p>
                <p className="font-medium text-stone-900 dark:text-stone-100">{unitCount} entities</p>
              </div>
              {canManageImpact && (
                <button
                  type="button"
                  onClick={(event) => { onDelete(event, activity.id); }}
                  disabled={locksDeletes || deletingId === activity.id}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-400 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-red-900 dark:hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-70"
                  title={locksDeletes ? 'Bulk delete in progress' : deletingId === activity.id ? tx('Deleting activity…') : tx('Delete Activity')}
                  aria-label={locksDeletes ? 'Bulk delete in progress' : deletingId === activity.id ? tx('Deleting activity…') : tx('Delete Activity')}
                >
                  {deletingId === activity.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              )}
              <ChevronRight className="text-stone-300 dark:text-stone-700 group-hover:text-stone-600 dark:group-hover:text-stone-300 hidden md:block" />
            </div>
          </div>
        </Link>
      );
    };
  }, [tx, canManageImpact]);

  return (
    <div className={cn("page-shell", embedded && "p-0")}>
      {!embedded && role === 'viewer' && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
          Viewer — read-only.
        </div>
      )}
      {!embedded && (
        <div className="section-card p-5 lg:p-6 mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 shadow-sm border border-stone-200 dark:border-stone-700">
              <History size={24} className="text-stone-900 dark:text-stone-100" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Activities</h2>
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3 font-mono">
            <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-xs text-stone-600 dark:text-stone-300">
              TOTAL: <span className="font-bold text-stone-900 dark:text-stone-100">{activities.length}</span>
            </span>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {liveFeedUi && canAccessAdminUi && (
                <button
                  type="button"
                  onClick={() => { liveFeedUi.openWorkspaceHealth(); }}
                  className="action-btn-secondary w-full sm:w-auto h-11 border-stone-200/80 text-stone-800 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-900/60"
                  title={LABELS.workspacePanels.workspaceHealth.titleHint}
                  aria-label={LABELS.workspacePanels.workspaceHealth.title}
                >
                  <Scale size={16} className="shrink-0" aria-hidden />
                  {LABELS.workspacePanels.workspaceHealth.title}
                </button>
              )}
              {canAccessAdminUi && (
                <button
                  type="button"
                  onClick={() => navigate('/settings#settings-grant-access')}
                  className="action-btn-secondary w-full sm:w-auto h-11 border-stone-200 dark:border-stone-700"
                  title="Invite someone to this workspace"
                  aria-label="Invite member"
                >
                  <UserCog size={16} className="shrink-0" aria-hidden />
                  Invite member
                </button>
              )}
              <button
                onClick={() => {
                  if (!canOperateLog) {
                    notify({ type: 'error', message: 'Only admin/operator can create an activity.' });
                    return;
                  }
                  setIsCreating(true);
                }}
                disabled={!canOperateLog || isDeletingAll}
                className="action-btn-primary w-full sm:w-auto h-11"
              >
                <Plus size={16} />
                {tx('New Activity')}
              </button>
              {canManageImpact && bulkDeletableIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => { void handleDeleteAllActivities(); }}
                  disabled={isDeletingAll}
                  className="action-btn-secondary w-full border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40 sm:w-auto h-11"
                >
                  {isDeletingAll ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Delete all
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {(loading || loadingProgress > 0) && (
        <div className="section-card p-3 mb-6">
          <LoadingLine
            compact
            progress={loadingProgress > 0 ? Math.max(8, Math.min(100, loadingProgress)) : undefined}
            label="Syncing activities..."
          />
        </div>
      )}

      <div className="space-y-8">
          {activeActivitys.length === 0 && completedActivitys.length === 0 && archivedActivitys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-900/70">
              <EmptyState
                title="No activities yet"
                description="Create your first activity to start tracking records and outcomes."
                actionLabel="Create Activity"
                onAction={() => setIsCreating(true)}
                actionIcon={<Plus size={16} />}
              />
            </div>
          ) : (
            <>
              {activeActivitys.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400 pl-1">{tx('Active')}</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {activeActivitys.map(activity => (
                      <ActivityCard 
                        key={activity.id}
                        activity={activity}
                        activityEntries={recordsByActivityId[activity.id] || []}
                        onDelete={handleDeleteActivity}
                        deletingId={deletingActivityId}
                        locksDeletes={isDeletingAll}
                      />
                    ))}
                  </div>
                </div>
              )}

              {completedActivitys.length > 0 && (
                <div className="space-y-4 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400 pl-1">{tx('Completed')}</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {completedActivitys.map(activity => (
                      <ActivityCard 
                        key={activity.id}
                        activity={activity}
                        activityEntries={recordsByActivityId[activity.id] || []}
                        onDelete={handleDeleteActivity}
                        deletingId={deletingActivityId}
                        locksDeletes={isDeletingAll}
                      />
                    ))}
                  </div>
                </div>
              )}

              {archivedActivitys.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-stone-100 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => setIsArchivedSectionExpanded(prev => !prev)}
                    className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    {isArchivedSectionExpanded ? 'Hide' : 'Show'} Archived ({archivedActivitys.length})
                  </button>
                  {isArchivedSectionExpanded && (
                    <div className="grid grid-cols-1 gap-4">
                      {archivedActivitys.map(activity => (
                        <ActivityCard 
                          key={activity.id}
                          activity={activity}
                          activityEntries={recordsByActivityId[activity.id] || []}
                          onDelete={handleDeleteActivity}
                          deletingId={deletingActivityId}
                          locksDeletes={isDeletingAll}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
      </div>


      {isCreating && (
        <div className="overlay-backdrop" onClick={closeCreateOverlay}>
            <div
              className="overlay-card w-full max-w-2xl relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {(activityState === 'saving' || activityState === 'success') && (
                <OverlaySavingState
                  fillParent
                  state={activityState}
                  label={activityState === 'saving' ? 'Creating activity…' : 'Activity created'}
                />
              )}

              <div
                style={{
                  opacity: activityState === 'idle' || activityState === 'error' ? 1 : 0,
                  visibility:
                    activityState === 'idle' || activityState === 'error' ? 'visible' : 'hidden',
                  transition: 'opacity 0.2s',
                }}
              >
                <div className="overlay-header">
                  <div>
                    <h3 className="font-medium text-stone-900 dark:text-stone-100">{tx('Create Activity')}</h3>
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Initialize a new working session.</p>
                  </div>
                  <button onClick={closeCreateOverlay} className="close-btn"><X size={18} /></button>
                </div>

                <form onSubmit={handleCreateActivity} className="p-6 space-y-5">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-stone-500">{tx('Activity Name')}</label>
                    <input
                      type="text"
                      className="control-input w-full"
                      placeholder="e.g. Afternoon session, evening segment…"
                      value={activityName}
                      onChange={e => setActivityName(e.target.value)}
                      maxLength={60}
                      autoFocus
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-stone-500">{tx('Date')}</label>
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
                      <label className="text-xs font-medium text-stone-500">{tx('Start Time')}</label>
                      <input
                        type="time"
                        className="control-input"
                        value={startTime}
                        onChange={e => setStartTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="overlay-footer pt-4">
                    <button type="button" onClick={closeCreateOverlay} className="action-btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" className="action-btn-primary">
                      <Plus size={16} className="shrink-0" aria-hidden />
                      {tx('Create Activity')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        </div>
      )}
    </div>
  );
}
