import React, { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { Plus, Calendar, ChevronRight, Clock, Trash2, Loader2, History, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { APP_MIN_DATE, cn, formatValue, formatDate } from '../lib/utils';
import { useNotification } from '../context/NotificationContext';
import { useAppRole } from '../context/AppRoleContext';
import { useAuth } from '../context/AuthContext';
import DataActionMenu from '../components/DataActionMenu';
import LoadingLine from '../components/LoadingLine';
import { useLabels } from '../lib/labels';
import EmptyState from '../components/EmptyState';
import { Activity, ActivityRecord } from '../types';

export default function Activities({ embedded = false }: { embedded?: boolean }) {
  const { 
    activities, 
    addActivity, 
    deleteActivity, 
    entities, 
    loading, 
    loadingProgress,
    recordsByActivityId
  } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { role, canOperateLog } = useAppRole();
  const { user } = useAuth();
  const { tx } = useLabels();
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingActivity, setIsSavingActivity] = useState(false);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [isArchivedSectionExpanded, setIsArchivedSectionExpanded] = useState(false);
  
  // New Activity Form
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(new Date().toTimeString().slice(0, 5));
  const [activityName, setActivityName] = useState('');

  const resetCreateActivityForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setStartTime(new Date().toTimeString().slice(0, 5));
    setActivityName('');
  };

  const closeCreateOverlay = () => {
    if (isSavingActivity) return;
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

  useEffect(() => {
    if (!isCreating) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCreateOverlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreating, isSavingActivity]);

  const buildStartTime = (activityDate: string, activityTime: string) => {
    if (!activityDate || !activityTime) return undefined;
    const combined = new Date(`${activityDate}T${activityTime}:00`);
    if (Number.isNaN(combined.getTime())) return undefined;
    return combined.toISOString();
  };

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingActivity) return;
    if (!canOperateLog) {
      notify({ type: 'error', message: 'Only admin/operator can create an activity.' });
      return;
    }

    setIsSavingActivity(true);

    try {
      await addActivity({
        date,
        name: activityName.trim() || undefined,
        start_time: buildStartTime(date, startTime),
        status: 'active',
        assigned_user_id: user?.id,
        activity_category: 'Standard',
        org_code: undefined,
      });
      resetCreateActivityForm();
      setIsCreating(false);
      notify({ type: 'success', message: 'Activity created successfully.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to create activity.' });
    } finally {
      setIsSavingActivity(false);
    }
  };



  const handleDeleteActivity = async (event: React.MouseEvent, activityId: string) => {
    event.preventDefault();
    event.stopPropagation();

    if (deletingActivityId === activityId) return;

    const confirmed = window.confirm('Delete this activity? This will remove related records records for that activity.');
    if (!confirmed) return;

    try {
      setDeletingActivityId(activityId);
      await deleteActivity(activityId);
      notify({ type: 'success', message: 'Activity deleted successfully.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to delete activity.' });
    } finally {
      setDeletingActivityId(current => (current === activityId ? null : current));
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

  const ActivityCard = React.memo(({ 
    activity, 
    activityEntries, 
    onDelete, 
    deletingId, 
    tx, 
    formatDate, 
    formatValue 
  }: { 
    activity: Activity; 
    activityEntries: ActivityRecord[]; 
    onDelete: (e: React.MouseEvent, id: string) => void;
    deletingId: string | null;
    tx: any;
    formatDate: any;
    formatValue: any;
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
                  {formatDate(activity.date)}
                </p>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <Clock size={12} />
                  {activity.start_time
                    ? new Date(activity.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Time N/A'}
                </div>
                <div className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  activity.status === 'active'
                    ? 'badge-active'
                    : activity.status === 'completed'
                      ? 'badge-completed'
                      : 'badge-archived'
                }`}>
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
            <button
              type="button"
              onClick={(event) => { onDelete(event, activity.id); }}
              disabled={deletingId === activity.id}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-400 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-red-900 dark:hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-70"
              title={deletingId === activity.id ? tx('Deleting activity…') : tx('Delete Activity')}
            >
              {deletingId === activity.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
            <ChevronRight className="text-stone-300 dark:text-stone-700 group-hover:text-stone-600 dark:group-hover:text-stone-300 hidden md:block" />
          </div>
        </div>
      </Link>
    );
  });
  ActivityCard.displayName = 'ActivityCard';



  return (
    <div className="page-shell">
      {!embedded ? (
        <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 shadow-sm border border-stone-200 dark:border-stone-700">
              <History size={24} className="text-stone-900 dark:text-stone-100" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Activities</h2>
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                {tx('Activities')}: <span className="font-mono text-stone-900 dark:text-stone-100">{activities.length}</span>
              </span>
            </div>
            {!isCreating && (
              <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(0,1fr)_auto]">
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
            )}
          </div>
        </div>
      ) : (
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(0,1fr)_auto] sm:justify-end">

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
        <div className="fixed inset-0 z-50 bg-stone-950/45 p-4 backdrop-blur-sm animate-in fade-in" onClick={closeCreateOverlay}>
          <div className="flex min-h-full items-center justify-center">
            <form
              onSubmit={handleCreateActivity}
              onClick={event => event.stopPropagation()}
              className="section-card w-full max-w-2xl p-6 animate-in zoom-in-95"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-stone-900 dark:text-stone-100">{tx('Create Activity')}</h3>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Name it, set the date, set the start time.</p>
                </div>
                <button
                  type="button"
                  onClick={closeCreateOverlay}
                  disabled={isSavingActivity}
                  className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                  aria-label="Close create activity"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mb-4 space-y-1">
                <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Activity Name (Optional)</label>
                <input 
                  type="text"
                  className="control-input w-full" 
                  placeholder="e.g. Afternoon Session, High Intensity Segment..."
                  value={activityName} 
                  onChange={e => setActivityName(e.target.value)} 
                  maxLength={60}
                  autoFocus
                />
                <p className="text-[10px] text-stone-400 px-1">Optional label for quick identification (max 60 chars)</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-5">
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
              </div>

              <div className="flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={closeCreateOverlay}
                  disabled={isSavingActivity}
                  className="action-btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSavingActivity}
                  className="action-btn-primary"
                >
                  {isSavingActivity ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {isSavingActivity ? tx('Saving...') : tx('Create Activity')}
                </button>
              </div>
            </form>
          </div>
        </div>
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
              {activeActivitys.map(activity => (
                <ActivityCard 
                  key={activity.id}
                  activity={activity}
                  activityEntries={recordsByActivityId[activity.id] || []}
                  onDelete={handleDeleteActivity}
                  deletingId={deletingActivityId}
                  tx={tx}
                  formatDate={formatDate}
                  formatValue={formatValue}
                />
              ))}
            </div>
          </div>
        )}

        {completedActivitys.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{tx('Completed Activities')}</h3>
            <div className="space-y-4">
              {completedActivitys.map(activity => (
                <ActivityCard 
                  key={activity.id}
                  activity={activity}
                  activityEntries={recordsByActivityId[activity.id] || []}
                  onDelete={handleDeleteActivity}
                  deletingId={deletingActivityId}
                  tx={tx}
                  formatDate={formatDate}
                  formatValue={formatValue}
                />
              ))}
            </div>
          </div>
        )}

        {activeActivitys.length === 0 && role === 'operator' && (
          <div className="text-center py-8 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-900/70">
            {tx('No live activities are currently assigned to your operator account.')}
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
                {archivedActivitys.map(activity => (
                  <ActivityCard 
                    key={activity.id}
                    activity={activity}
                    activityEntries={recordsByActivityId[activity.id] || []}
                    onDelete={handleDeleteActivity}
                    deletingId={deletingActivityId}
                    tx={tx}
                    formatDate={formatDate}
                    formatValue={formatValue}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activities.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-900/70">
            <EmptyState
              title="No activities yet"
              description="Create your first activity to start tracking records and outcomes."
              actionLabel="Create Activity"
              onAction={() => {
                if (!canOperateLog) {
                  notify({ type: 'error', message: 'Only admin/operator can create an activity.' });
                  return;
                }
                setIsCreating(true);
              }}
              actionIcon={<Plus size={16} />}
            />
          </div>
        )}
      </div>
    </div>
  );
}
