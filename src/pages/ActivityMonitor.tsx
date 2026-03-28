import React, { useMemo, useState } from 'react';
import { Activity, Radio, Clock, Plus, X, Loader2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { cn, formatDate } from '../lib/utils';
import { useLabels } from '../lib/labels';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { useAppRole } from '../context/AppRoleContext';
import { useAuth } from '../context/AuthContext';
import OverlaySavingState from '../components/OverlaySavingState';

type LoadingState = 'idle' | 'saving' | 'success' | 'error';

export default function ActivityMonitor({ embedded = false }: { embedded?: boolean }) {
  const { activities, addActivity } = useData();
  const { tx } = useLabels();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { canOperateLog } = useAppRole();
  const { user } = useAuth();

  const [activityState, setActivityState] = useState<LoadingState>('idle');
  const [isCreating, setIsCreating] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(new Date().toTimeString().slice(0, 5));
  const [activityName, setActivityName] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');

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

  const handleCreateActivity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (activityState === 'saving') return;
    if (!canOperateLog) {
      notify({ type: 'error', message: 'Only admin/operator can create an activity.' });
      return;
    }

    setActivityState('saving');

    try {
      const activityId = await addActivity({
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
        navigate(`/activity/${activityId}`);
      }, 1000);
    } catch (error: any) {
      setActivityState('error');
      notify({ type: 'error', message: error?.message || 'Unable to create activity.' });
    }
  };

  const feed = useMemo(() => {
    return [...activities]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter(a => {
        if (statusFilter === 'active' && a.status !== 'active') return false;
        if (statusFilter === 'completed' && a.status !== 'completed') return false;
        return true;
      })
      .slice(0, 20); // Limit to top 20 for feed
  }, [activities, statusFilter]);

  return (
    <div className={cn("flex flex-col h-full", !embedded && "page-shell")}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 flex items-center gap-2">
          <Activity size={16} />
          {tx('Live Feed')}
        </h3>
        {!embedded && (
          <button 
            onClick={() => setIsCreating(true)}
            className="action-btn-primary scale-90"
          >
            <Plus size={14} />
            {tx('New')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {feed.length === 0 ? (
          <div className="py-10 text-center text-sm text-stone-400">
            No activity yet
          </div>
        ) : (
          feed.map((act) => (
            <div
              key={act.id}
              className="group flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 transition-all cursor-pointer shadow-sm hover:shadow"
              onClick={() => navigate(`/activity/${act.id}`)}
            >
              <div className={cn(
                "mt-1.5 shrink-0 w-2 h-2 rounded-full",
                act.status === 'active' 
                  ? "bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.500)]" 
                  : "bg-stone-300 dark:bg-stone-600"
              )} />
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate group-hover:text-stone-700 dark:group-hover:text-white">
                    {act.name || act.label || tx('Untitled Activity')}
                  </p>
                  <span className="shrink-0 text-[10px] text-stone-400 font-mono">
                    {formatDate(act.date)}
                  </span>
                </div>
                
                <div className="mt-1 flex items-center gap-3 text-[11px] text-stone-500 dark:text-stone-400 uppercase tracking-tighter">
                  <span className="flex items-center gap-1">
                    <Radio size={10} className="text-stone-400" />
                    {act.channel_label || 'Direct'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={10} className="text-stone-400" />
                    {act.status}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isCreating && (
        <div className="overlay-backdrop" onClick={closeCreateOverlay}>
            <div
              className="overlay-card w-full max-w-lg relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {activityState !== 'idle' && (
                <OverlaySavingState 
                  state={activityState as 'saving' | 'success' | 'error'} 
                  label={activityState === 'saving' ? "Creating activity..." : "Activity created"} 
                />
              )}

              <div style={{ opacity: activityState === 'idle' ? 1 : 0, visibility: activityState === 'idle' ? 'visible' : 'hidden', transition: 'opacity 0.2s' }}>
                <div className="overlay-header">
                  <div>
                    <h3 className="font-medium text-stone-900 dark:text-stone-100">{tx('Create Activity')}</h3>
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Initialize a new work session.</p>
                  </div>
                  <button onClick={closeCreateOverlay} className="close-btn"><X size={18} /></button>
                </div>

                <form onSubmit={handleCreateActivity} className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-stone-500">Name</label>
                    <input
                      type="text"
                      className="control-input w-full"
                      value={activityName}
                      onChange={e => setActivityName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-stone-500">Date</label>
                      <input type="date" className="control-input" value={date} onChange={e => setDate(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-stone-500">Start Time</label>
                      <input type="time" className="control-input" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                    </div>
                  </div>
                  <div className="overlay-footer pt-4">
                    <button type="button" onClick={closeCreateOverlay} className="action-btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" className="action-btn-primary">
                      <Plus size={16} className="shrink-0" aria-hidden />
                      {tx('Create')}
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
