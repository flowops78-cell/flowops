import { useMemo } from 'react';
import { ActivityRecord, Entity } from '../types';

export interface ActivityDetailDerivedData {
  /** Sum of all 'increase' direction entry amounts. */
  totalInflow: number;
  /** Sum of all 'decrease' direction entry amounts. */
  totalOutflow: number;
  /** Difference: outflow minus inflow. */
  discrepancy: number;
  /** Whether the discrepancy is within rounding tolerance (< 0.01). */
  isTotald: boolean;
  /** Entities not already active in this activity. */
  availableEntities: Entity[];
  /** Map from entity ID to the most recent activity record for that entity. */
  entityToLatestRecord: Map<string, ActivityRecord>;
}

export function useActivityDetailData(
  activityEntries: ActivityRecord[],
  entities: Entity[],
): ActivityDetailDerivedData {
  const activeActivityEntries = useMemo(
    () => activityEntries.filter(record => !record.left_at),
    [activityEntries],
  );

  const totalInflow = useMemo(
    () => activityEntries.reduce((sum, e) => sum + (e.direction === 'increase' ? e.unit_amount : 0), 0),
    [activityEntries],
  );

  const totalOutflow = useMemo(
    () => activityEntries.reduce((sum, e) => sum + (e.direction === 'decrease' ? e.unit_amount : 0), 0),
    [activityEntries],
  );

  const discrepancy = totalOutflow - totalInflow;
  const isTotald = Math.abs(discrepancy) < 0.01;

  const availableEntities = useMemo(
    () => entities.filter(entity => !activeActivityEntries.some(record => record.entity_id === entity.id)),
    [entities, activeActivityEntries],
  );

  const entityToLatestRecord = useMemo(() => {
    const map = new Map<string, ActivityRecord>();
    for (const record of activityEntries) {
      const entityId = record.entity_id;
      if (!entityId) continue;
      const existing = map.get(entityId);
      if (
        !existing ||
        new Date(record.created_at || 0).getTime() > new Date(existing.created_at || 0).getTime()
      ) {
        map.set(entityId, record);
      }
    }
    return map;
  }, [activityEntries]);

  return {
    totalInflow,
    totalOutflow,
    discrepancy,
    isTotald,
    availableEntities,
    entityToLatestRecord,
  };
}
