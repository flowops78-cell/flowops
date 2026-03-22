import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { Activity, LayoutGrid, BarChart3, Maximize2, X } from 'lucide-react';
import { formatValue } from '../lib/utils';
import { cn } from '../lib/utils';
import ContextPanel from '../components/ContextPanel';
import EntitySnapshot from '../components/EntitySnapshot';
import CollapsibleWorkspaceSection from '../components/CollapsibleWorkspaceSection';

export default function Distribution({ embedded = false }: { embedded?: boolean }) {
  const { units, entries, workspaces, updateUnit } = useData();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [fullView, setFullView] = useState<'value' | 'event' | null>(null);

  const selectedUnit = units.find(p => p.id === selectedUnitId);

  const handleUpdateTags = async (id: string, tags: string[]) => {
    const unit = units.find(p => p.id === id);
    if (unit && updateUnit) {
      await updateUnit({ ...unit, tags });
    }
  };

  const stats = useMemo(() => {
    const unitStats = new Map();

    units.forEach(p => {
      const unitEntries = entries.filter(l => l.unit_id === p.id);
      
      // Value Workspace Stats
      const valueEntries = unitEntries.filter(e => {
        const workspace = workspaces.find(g => g.id === e.workspace_id);
        return !workspace?.workspace_mode || workspace.workspace_mode === 'value';
      });
      
      const totalNet = valueEntries.reduce((sum, e) => sum + e.net, 0);
      const totalActivityCount = valueEntries.reduce((sum, e) => sum + (e.activity_count || 0), 0);
      
      const activitys = valueEntries.length;
      const surpluses = valueEntries.filter(e => e.net > 0).length;
      const success_ratio = activitys > 0 ? (surpluses / activitys) * 100 : 0;

      // High Intensity Stats
      const event_entries = unitEntries.filter(e => {
        const workspace = workspaces.find(g => g.id === e.workspace_id);
        return workspace?.workspace_mode === 'high_intensity';
      });

      const event_surpluses = event_entries.filter(e => e.sort_order === 1).length;
      const top3 = event_entries.filter(e => e.sort_order && e.sort_order <= 3).length;
      // Simple points: 1st=10, 2nd=5, 3rd=3, Entry=1
      const event_points = event_entries.reduce((sum, e) => {
        if (e.sort_order === 1) return sum + 10;
        if (e.sort_order === 2) return sum + 5;
        if (e.sort_order === 3) return sum + 3;
        return sum + 1;
      }, 0);

      unitStats.set(p.id, {
        id: p.id,
        name: p.name,
        totalNet,
        totalActivityCount,
        activitys,
        success_ratio,
        event_surpluses,
        top3,
        event_points
      });
    });

    return Array.from(unitStats.values());
  }, [units, entries, workspaces]);

  const valuePerformance = [...stats].sort((a, b) => b.totalNet - a.totalNet).filter(s => s.activitys > 0);
  const event_performance = [...stats].sort((a, b) => b.event_points - a.event_points).filter(s => s.event_points > 0);

  const renderValueWorkspace = (mode: 'default' | 'full' = 'default') => {
    const workspace = (
      <table className="desktop-grid w-full min-w-[760px] workspace-fixed text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
          <tr>
            <th className="px-6 py-2.5 w-12 text-[11px] font-semibold uppercase tracking-wide">#</th>
            <th className="px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Unit</th>
            <th className="px-6 py-2.5 w-[140px] text-right text-[11px] font-semibold uppercase tracking-wide">Net Performance</th>
            <th className="px-6 py-2.5 w-[130px] text-right text-[11px] font-semibold uppercase tracking-wide">Delta Rate</th>
            <th className="px-6 py-2.5 w-[120px] text-right text-[11px] font-semibold uppercase tracking-wide">Activity Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
          {valuePerformance.map((unit, index) => (
            <tr
              key={unit.id}
              onClick={() => setSelectedUnitId(unit.id)}
              className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <td className="px-6 py-2.5 font-mono text-stone-400">{index + 1}</td>
              <td className="px-6 py-2.5 font-medium text-stone-900 dark:text-stone-100 truncate" title={unit.name}>
                {unit.name}
              </td>
              <td className={cn(
                'px-6 py-2.5 text-right font-mono font-medium',
                unit.totalNet > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              )}>
                {formatValue(unit.totalNet)}
              </td>
              <td className="px-6 py-2.5 text-right text-stone-600 dark:text-stone-400">
                {unit.success_ratio.toFixed(0)}%
                <span className="text-xs text-stone-400 ml-1">({unit.activitys})</span>
              </td>
              <td className="px-6 py-2.5 text-right text-stone-500 dark:text-stone-400 font-mono text-xs">
                {unit.totalActivityCount.toLocaleString()}
              </td>
            </tr>
          ))}
          {valuePerformance.length === 0 && (
            <tr><td colSpan={5} className="p-8 text-center text-stone-400">No value distribution data yet.</td></tr>
          )}
        </tbody>
      </table>
    );

    if (mode === 'full') {
      return <div className="overflow-x-auto overflow-y-auto h-full">{workspace}</div>;
    }

    return (
      <CollapsibleWorkspaceSection
        title="Value Focus"
        summary={`${valuePerformance.length} users`}
        defaultExpanded={false}
        maxExpandedHeightClass="max-h-[520px]"
        maxCollapsedHeightClass="max-h-[96px]"
      >
        {workspace}
      </CollapsibleWorkspaceSection>
    );
  };

  const renderEventWorkspace = (mode: 'default' | 'full' = 'default') => {
    const workspace = (
      <table className="desktop-grid w-full min-w-[760px] workspace-fixed text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
          <tr>
            <th className="px-6 py-2.5 w-12 text-[11px] font-semibold uppercase tracking-wide">#</th>
            <th className="px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Unit</th>
            <th className="px-6 py-2.5 w-[120px] text-right text-[11px] font-semibold uppercase tracking-wide">Points</th>
            <th className="px-6 py-2.5 w-[120px] text-right text-[11px] font-semibold uppercase tracking-wide">Surpluses</th>
            <th className="px-6 py-2.5 w-[120px] text-right text-[11px] font-semibold uppercase tracking-wide">Top 3</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
          {event_performance.map((unit, index) => (
            <tr
              key={unit.id}
              onClick={() => setSelectedUnitId(unit.id)}
              className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <td className="px-6 py-2.5 font-mono text-stone-400">{index + 1}</td>
              <td className="px-6 py-2.5 font-medium text-stone-900 dark:text-stone-100 truncate" title={unit.name}>
                {unit.name}
              </td>
              <td className="px-6 py-2.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                {unit.event_points}
              </td>
              <td className="px-6 py-2.5 text-right text-stone-600 dark:text-stone-400">
                {unit.event_surpluses > 0 && (
                  <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full text-xs font-medium">
                    {unit.event_surpluses}
                  </span>
                )}
                {unit.event_surpluses === 0 && '-'}
              </td>
              <td className="px-6 py-2.5 text-right text-stone-500 dark:text-stone-400">
                {unit.top3}
              </td>
            </tr>
          ))}
          {event_performance.length === 0 && (
            <tr><td colSpan={5} className="p-8 text-center text-stone-400">No performance data yet.</td></tr>
          )}
        </tbody>
      </table>
    );

    if (mode === 'full') {
      return <div className="overflow-x-auto overflow-y-auto h-full">{workspace}</div>;
    }

    return (
      <CollapsibleWorkspaceSection
        title="Activity Performance"
        summary={`${event_performance.length} users`}
        defaultExpanded={false}
        maxExpandedHeightClass="max-h-[520px]"
        maxCollapsedHeightClass="max-h-[96px]"
      >
        {workspace}
      </CollapsibleWorkspaceSection>
    );
  };

  return (
    <div className="page-shell animate-in fade-in">
      <ContextPanel isOpen={!!selectedUnitId} onClose={() => setSelectedUnitId(null)}>
        {selectedUnit && (
          <EntitySnapshot 
            entity={selectedUnit} 
            type="unit" 
            onClose={() => setSelectedUnitId(null)}
            onUpdateTags={handleUpdateTags}
            variant="sidebar"
          />
        )}
      </ContextPanel>

      {!embedded && (
        <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">Distribution</h2>
            <p className="text-stone-500 dark:text-stone-400 text-sm">Flow distribution across contacts and operational subsets.</p>
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
              Value Points: <span className="font-mono text-stone-900 dark:text-stone-100">{valuePerformance.length}</span>
            </span>
            <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
              Activity Points: <span className="font-mono text-stone-900 dark:text-stone-100">{event_performance.length}</span>
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
        {/* Value Workspace Rankings */}
        <div className="section-card overflow-hidden min-w-0">
          <div className="p-6 border-b border-stone-200 dark:border-stone-800 bg-emerald-50/50 dark:bg-emerald-900/10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-700 dark:text-emerald-400">
                <BarChart3 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">Value Summary</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">Aggregated by Total Net Distribution</p>
              </div>
              </div>
              <span className="hidden lg:inline-flex text-xs px-2.5 py-1 rounded-full border border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-900/80 text-stone-600 dark:text-stone-300">
                {valuePerformance.length} users
              </span>
              <button
                type="button"
                onClick={() => setFullView('value')}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-900/80 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                title="Open full view"
              >
                <Maximize2 size={12} />
                Full View
              </button>
            </div>
          </div>
          {renderValueWorkspace()}
        </div>

        {/* Tournament Rankings */}
        <div className="section-card overflow-hidden min-w-0">
          <div className="p-6 border-b border-stone-200 dark:border-stone-800 bg-amber-50/50 dark:bg-amber-900/10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-700 dark:text-amber-400">
                <Activity size={24} />
              </div>
              <div>
                <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">Activity Analytics</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">Aggregated performance by operational points</p>
              </div>
              </div>
              <span className="hidden lg:inline-flex text-xs px-2.5 py-1 rounded-full border border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-900/80 text-stone-600 dark:text-stone-300">
                {event_performance.length} users
              </span>
              <button
                type="button"
                onClick={() => setFullView('event')}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-900/80 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                title="Open full view"
              >
                <Maximize2 size={12} />
                Full View
              </button>
            </div>
          </div>
          {renderEventWorkspace()}
        </div>
      </div>

      {fullView && (
        <div className="fixed inset-0 z-[80] bg-stone-950/60 backdrop-blur-sm p-0 sm:p-6">
          <div className="h-full w-full sm:max-w-6xl sm:mx-auto sm:rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {fullView === 'value' ? 'Value Summary · Full View' : 'Activity Analytics · Full View'}
              </h3>
              <button
                type="button"
                onClick={() => setFullView(null)}
                className="p-2 rounded-md text-stone-500 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                title="Close full view"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {fullView === 'value' ? renderValueWorkspace('full') : renderEventWorkspace('full')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
