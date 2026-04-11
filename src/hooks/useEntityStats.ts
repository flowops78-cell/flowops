import { useMemo } from 'react';
import { EntityBalance } from '../context/DataContext';
import { Entity } from '../types';

export interface EntityStatEntry {
  net: number;
  activitys: number;
  lastActive: string | null;
  surpluses: number;
  totalInflow: number;
  avgActivity: number;
}

export interface EntityStatsResult {
  entityStats: Map<string, EntityStatEntry>;
  activeEntitysCount: number;
  positiveDeltaEntitys: number;
}

export function useEntityStats(
  entities: Entity[],
  entityBalances: Map<string, EntityBalance>,
): EntityStatsResult {
  const entityStats = useMemo(() => {
    const stats = new Map<string, EntityStatEntry>();
    entityBalances.forEach((balance: EntityBalance, id: string) => {
      stats.set(id, {
        net: Number(balance.net) || 0,
        activitys: Number(balance.record_count) || 0,
        lastActive: balance.last_active ?? null,
        surpluses: Number(balance.surplus_count) || 0,
        totalInflow: Number(balance.total_inflow) || 0,
        avgActivity: Number(balance.avg_duration_hours) || 0,
      });
    });
    return stats;
  }, [entityBalances]);

  const activeEntitysCount = useMemo(
    () => entities.filter(p => (entityStats.get(p.id)?.net || 0) !== 0).length,
    [entities, entityStats],
  );

  const positiveDeltaEntitys = useMemo(
    () => entities.filter(p => (entityStats.get(p.id)?.net || 0) > 0).length,
    [entities, entityStats],
  );

  return { entityStats, activeEntitysCount, positiveDeltaEntitys };
}
