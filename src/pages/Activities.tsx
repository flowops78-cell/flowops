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
  const { activities, addActivity, deleteActivity, records, entities, loading, loadingProgress } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { role, canOperateLog } = useAppRole();
  const { user } = useAuth();
  const { tx } = useLabels();
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingActivity, setIsSavingActivity] = useState(false);
  const [saveActivityProgress, setSaveActivityProgress] = useState(0);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [isArchivedSectionExpanded, setIsArchivedSectionExpanded] = useState(false);
  const saveActivityProgressTimerRef = useRef<number | null>(null);
  const saveActivityProgressResetTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // New Activity Form
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(new Date().toTimeString().slice(0, 5));

  // New Fields
  const [channel, setChannel] = useState('Channel 1');

  const clearSaveActivityProgressTimers = () => {
    if (saveActivityProgressTimerRef.current !== null) {
      window.clearInterval(saveActivityProgressTimerRef.current);
      saveActivityProgressTimerRef.current = null;
    }
    if (saveActivityProgressResetTimerRef.current !== null) {
      window.clearTimeout(saveActivityProgressResetTimerRef.current);
      saveActivityProgressResetTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearSaveActivityProgressTimers();
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

    let created = false;
    clearSaveActivityProgressTimers();
    setIsSavingActivity(true);
    let progress = 8;
    setSaveActivityProgress(progress);
    saveActivityProgressTimerRef.current = window.setInterval(() => {
      progress = Math.min(progress + (progress < 70 ? 10 : progress < 90 ? 4 : 1), 92);
      setSaveActivityProgress(progress);
    }, 120);

    try {
      await addActivity({
        date,
        start_time: buildStartTime(date, startTime),
        status: 'active',
        assigned_user_id: user?.id,
        activity_category: 'Standard',
        channel,
        org_code: undefined,
      });
      created = true;
      clearSaveActivityProgressTimers();
      setSaveActivityProgress(100);
      // Reset form
      setDate(new Date().toISOString().split('T')[0]);
      setStartTime(new Date().toTimeString().slice(0, 5));
      setChannel('Channel 1');
      notify({ type: 'success', message: 'Activity created successfully.' });
    } catch (error: any) {
      clearSaveActivityProgressTimers();
      setSaveActivityProgress(100);
      notify({ type: 'error', message: error?.message || 'Unable to create activity.' });
    } finally {
      saveActivityProgressResetTimerRef.current = window.setTimeout(() => {
        setIsSavingActivity(false);
        setSaveActivityProgress(0);
        if (created) {
          setIsCreating(false);
        }
        saveActivityProgressResetTimerRef.current = null;
      }, 360);
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

  const renderActivityCard = (activity: typeof activities[number]) => {
    const activityEntries = records.filter(l => l.activity_id === activity.id);
    const totalrecordValue = activityEntries.reduce((sum, e) => sum + e.unit_amount, 0);
    const unitCount = new Set(activityEntries.map(e => e.entity_id)).size;

    return (
      <Link
        key={activity.id}
        to={`/activity/${activity.id}`}
        className="block section-card-hover interactive-3d p-6 group"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center text-stone-500 dark:text-stone-400 group-hover:bg-stone-900 dark:group-hover:bg-stone-100 group-hover:text-white dark:group-hover:text-stone-900 transition-colors shrink-0 shadow-sm">
              <Calendar size={20} />
            </div>
            <div>
              <h3 className="font-medium text-stone-900 dark:text-stone-100 text-lg">{formatDate(activity.date)}</h3>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <Smartphone size={12} />
                  {activity.channel_label || 'Unknown'}
                </div>
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
              onClick={(event) => { void handleDeleteActivity(event, activity.id); }}
              disabled={deletingActivityId === activity.id}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-400 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-red-900 dark:hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-70"
              title={deletingActivityId === activity.id ? tx('Deleting activity…') : tx('Delete Activity')}
            >
              {deletingActivityId === activity.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
            <ChevronRight className="text-stone-300 dark:text-stone-700 group-hover:text-stone-600 dark:group-hover:text-stone-300 hidden md:block" />
          </div>
        </div>
      </Link>
    );
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
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                {tx('Activities')}: <span className="font-mono text-stone-900 dark:text-stone-100">{activities.length}</span>
              </span>
            </div>
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
        <form onSubmit={handleCreateActivity} className="section-card p-6 animate-in fade-in slide-in-from-top-4">
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
            {saveActivityProgress > 0 && (
              <div className="w-full mr-auto max-w-sm">
                <LoadingLine
                  compact
                  progress={saveActivityProgress}
                  label={tx('Saving activity...')}
                />
              </div>
            )}
            <button 
              type="button" 
              onClick={() => setIsCreating(false)}
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
              {isSavingActivity ? tx('Saving...') : tx('Create Activity')}
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
              {activeActivitys.map(renderActivityCard)}
            </div>
          </div>
        )}

        {completedActivitys.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{tx('Completed Activities')}</h3>
            <div className="space-y-4">
              {completedActivitys.map(renderActivityCard)}
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
                {archivedActivitys.map(renderActivityCard)}
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
              onAction={() => setIsCreating(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
