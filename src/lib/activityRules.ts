import { Workspace, Entry } from '../types';

export const VALID_WORKSPACE_STATUSES: Workspace['status'][] = ['active', 'completed', 'archived'];

export const normalizeWorkspaceStatus = (status?: string | null): Workspace['status'] => {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'archived') return 'archived';
  if (normalized === 'completed' || normalized === 'closed' || normalized === 'aligned') return 'completed';
  return 'active';
};

export const isAllowedWorkspaceStatusTransition = (fromStatus: Workspace['status'], toStatus: Workspace['status']) => {
  if (fromStatus === toStatus) return true;

  const allowed: Partial<Record<Workspace['status'], Workspace['status'][]>> = {
    active: ['completed'],
    completed: ['archived'],
    archived: ['active'],
  };

  return allowed[fromStatus]?.includes(toStatus) ?? false;
};

export const computeEntriesDiscrepancy = (entries: Entry[]) => {
  const totalInput = entries.reduce((sum, entry) => sum + entry.input_amount, 0);
  const totalOutput = entries.reduce((sum, entry) => sum + entry.output_amount, 0);
  return totalOutput - totalInput;
};

export const isTotaldEntries = (entries: Entry[], tolerance = 0.01) => {
  return Math.abs(computeEntriesDiscrepancy(entries)) < tolerance;
};

export const canAddUnitsForStatus = (status: Workspace['status']) => status === 'active';
