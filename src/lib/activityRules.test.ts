import { describe, expect, it } from 'vitest';
import { canAddUnitsForStatus, computeEntriesDiscrepancy, isAllowedWorkspaceStatusTransition, isTotaldEntries } from './activityRules';

describe('activityRules', () => {
  it('allows expected lifecycle transitions', () => {
    expect(isAllowedWorkspaceStatusTransition('active', 'completed')).toBe(true);
    expect(isAllowedWorkspaceStatusTransition('completed', 'archived')).toBe(true);
    expect(isAllowedWorkspaceStatusTransition('archived', 'active')).toBe(true);
    expect(isAllowedWorkspaceStatusTransition('active', 'archived')).toBe(false);
  });

  it('computes discrepancy and totald state', () => {
    const entries = [
      { id: '1', workspace_id: 'g1', unit_id: 'p1', input_amount: 100, output_amount: 120, net: 20 },
      { id: '2', workspace_id: 'g1', unit_id: 'p2', input_amount: 200, output_amount: 180, net: -20 },
    ];

    expect(computeEntriesDiscrepancy(entries)).toBe(0);
    expect(isTotaldEntries(entries)).toBe(true);
  });

  it('only allows adding units for active activitys', () => {
    expect(canAddUnitsForStatus('active')).toBe(true);
    expect(canAddUnitsForStatus('completed')).toBe(false);
    expect(canAddUnitsForStatus('archived')).toBe(false);
  });
});
