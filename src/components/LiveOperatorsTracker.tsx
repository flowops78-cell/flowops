import React, { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { User, Activity, Clock3 } from 'lucide-react';
import { useLabels } from '../lib/labels';

export default function LiveOperatorsTracker() {
  const { operatorLogs, systemEvents } = useData();
  const { canAccessAdminUi } = useAppRole();
  const { getEventLabel } = useLabels();

  // Only display for admin-level UI accounts.
  if (!canAccessAdminUi) return null;

  const activeUsers = useMemo(() => {
    const STALENESS_THRESHOLD_MS = 300000; // 5 minutes
    const now = Date.now();
    
    // 1. Filter by active flag AND recent last_active_at
    const trulyActive = operatorLogs.filter(activity => {
      if (!activity.is_active || !activity.last_active_at) return false;
      const lastActive = new Date(activity.last_active_at).getTime();
      return (now - lastActive) < STALENESS_THRESHOLD_MS;
    });

    // 2. Deduplicate by actor_user_id, keeping the most recent activity
    const seenUsers = new Set<string>();
    return trulyActive
      .sort((a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime())
      .filter(activity => {
        if (seenUsers.has(activity.actor_user_id)) return false;
        seenUsers.add(activity.actor_user_id);
        return true;
      });
  }, [operatorLogs]);

  const operatorMetrics = useMemo(() => {
    return activeUsers.map(activity => {
      const theirEntries = systemEvents.filter(
        event => event.actor_user_id === activity.actor_user_id // Match by user ID for consolidated activity
      ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return {
        ...activity,
        entriesLogged: theirEntries.length,
        recentActivity: theirEntries.slice(0, 3) // Last 3 actions
      };
    });
  }, [activeUsers, systemEvents]);

  if (activeUsers.length === 0) {
    return (
      <div className="section mt-6">
        <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100 flex items-center gap-2">
          <Activity size={18} className="text-emerald-600 dark:text-emerald-500" />
          Live Operators
        </h3>
        <p className="text-sm text-stone-500 dark:text-stone-400 p-4 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 rounded-lg">
          No operators are currently active on the channel.
        </p>
      </div>
    );
  }

  return (
    <div className="section mt-6">
      <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100 flex items-center gap-2">
        <Activity size={18} className="text-emerald-600 dark:text-emerald-500" />
        Live Operators
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {operatorMetrics.map(operator => (
          <div key={operator.id} className="border border-stone-200 dark:border-stone-800 rounded-lg p-4 bg-white dark:bg-stone-900">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 p-2 rounded-full shadow-sm">
                  <User size={18} />
                </div>
                <div>
                  <h4 className="font-medium text-stone-900 dark:text-stone-100">{operator.actor_label}</h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400 capitalize">{operator.actor_role}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono bg-stone-50 border border-stone-200 dark:bg-stone-800 dark:border-stone-700 text-stone-700 dark:text-stone-300 px-2 py-1 rounded">
                  {operator.entriesLogged} logged
                </span>
                <div className="flex items-center gap-1.5 justify-end mt-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <p className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Active</p>
                </div>
              </div>
            </div>
 ...
            {operator.recentActivity.length > 0 && (
              <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800/80 space-y-2.5">
                <p className="text-[10px] uppercase font-semibold text-stone-400 tracking-wider">Recent Activity</p>
                {operator.recentActivity.map(event => (
                  <div key={event.id} className="flex items-start gap-2 text-xs">
                    <Clock3 size={13} className="text-stone-400 shrink-0 mt-0.5" />
                    <span className="text-stone-600 dark:text-stone-300 truncate">
                      {getEventLabel(event.action)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
