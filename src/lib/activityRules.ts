import { Activity, ActivityRecord as ActivityRecord } from '../types';

export const VALID_ACTIVITY_STATUSES: Activity['status'][] = ['active', 'completed', 'archived'];

export const normalizeActivityStatus = (status?: string | null): Activity['status'] => {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'archived') return 'archived';
  if (normalized === 'completed' || normalized === 'closed' || normalized === 'aligned') return 'completed';
  return 'active';
};

export const isAllowedActivityStatusTransition = (fromStatus: Activity['status'], toStatus: Activity['status']) => {
  if (fromStatus === toStatus) return true;

  const allowed: Partial<Record<Activity['status'], Activity['status'][]>> = {
    active: ['completed'],
    completed: ['archived'],
    archived: ['active'],
  };

  return allowed[fromStatus]?.includes(toStatus) ?? false;
};

export const computeActivityRecordsDiscrepancy = (records: ActivityRecord[]) => {
  const totalInput = records.reduce(
    (sum, record) => sum + (record.direction === 'increase' ? (record.unit_amount ?? 0) : 0),
    0,
  );
  const totalOutput = records.reduce(
    (sum, record) => sum + (record.direction === 'decrease' ? (record.unit_amount ?? 0) : 0),
    0,
  );
  return totalOutput - totalInput;
};

export const isTotaledActivityRecords = (records: ActivityRecord[], tolerance = 0.01) => {
  return Math.abs(computeActivityRecordsDiscrepancy(records)) < tolerance;
};

export const canAddEntitiesForStatus = (status: Activity['status']) => status === 'active';

