import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronRight, Activity as ActivityIcon } from 'lucide-react';
import { cn, formatDate, formatValue } from '../../lib/utils';
import { useLabels, sanitizeLabel } from '../../lib/labels';

import { Activity, ActivityRecord } from '../../types';

interface RecentActivitiesListProps {
  activities: Activity[];
  recordsByActivityId: Record<string, ActivityRecord[]>;
  limit?: number;
  showViewAll?: boolean;
  className?: string;
}

export default function RecentActivitiesList({
  activities,
  recordsByActivityId,
  limit = 5,
  showViewAll = true,
  className
}: RecentActivitiesListProps) {
  const { getMetricLabel, tx } = useLabels();

  const sortedActivities = useMemo(() => {
    return [...activities]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }, [activities, limit]);

  if (activities.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
        <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-3 text-stone-400">
          <ActivityIcon size={24} />
        </div>
        <p className="text-sm font-medium text-stone-500 dark:text-stone-400">No activities recorded yet.</p>
        <Link to="/activity?action=create-activity" className="mt-2 text-xs text-[var(--accent)] font-medium hover:underline">
          Create first activity
        </Link>
      </div>
    );
  }

  return (
    <section className={cn("relative overflow-hidden rounded-2xl border border-stone-200/80 dark:border-stone-800/80 bg-gradient-to-b from-white to-stone-50/60 dark:from-stone-900 dark:to-stone-900/70 p-4", className)}>
      <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
      <div className="relative flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">{getMetricLabel('recentActivityLogs')}</h3>
        {showViewAll && (
          <Link to="/activity" className="text-xs text-[var(--accent)] hover:opacity-90 font-medium interactive-3d rounded px-1.5 py-0.5 whitespace-nowrap">
            {tx('View All')}
          </Link>
        )}
      </div>

      <div className="relative space-y-3">
        {sortedActivities.map((activity) => {
          const activityEntries = recordsByActivityId[activity.id] || [];
          const totalValue = activityEntries.reduce((sum, e) => sum + (e.unit_amount || 0), 0);
          const entityCount = new Set(activityEntries.map(e => e.entity_id)).size;

          return (
            <Link 
              key={activity.id} 
              to={`/activity/${activity.id}`}
              className="group block p-3 rounded-xl border border-stone-200/50 dark:border-stone-800/50 bg-white/50 dark:bg-stone-900/50 hover:bg-white dark:hover:bg-stone-800/80 hover:shadow-sm transition-all interactive-3d"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-colors",
                    activity.status === 'active' 
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" 
                      : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                  )}>
                    <Calendar size={18} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                      {activity.name || formatDate(activity.date)}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] text-stone-500 dark:text-stone-400 font-medium uppercase tracking-wider">
                      <span>{formatDate(activity.date)}</span>
                      <span className="w-1 h-1 rounded-full bg-stone-300 dark:bg-stone-600" />
                      <span>{entityCount} {entityCount === 1 ? 'entity' : 'entities'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                      {formatValue(totalValue)}
                    </p>
                    <p className="text-[9px] text-stone-400 uppercase tracking-tighter">Net Flow</p>
                  </div>
                  <ChevronRight size={14} className="text-stone-300 dark:text-stone-700 group-hover:text-stone-400 transition-colors" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
