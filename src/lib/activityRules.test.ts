import { describe, expect, it } from 'vitest';
import { canAddUnitsForStatus, computeEntriesDiscrepancy, isAllowedActivityStatusTransition, isTotaldEntries } from './activityRules';

describe('activityRules', () => {
  it('allows expected lifecycle transitions', () => {
    expect(isAllowedActivityStatusTransition('active', 'completed')).toBe(true);
    expect(isAllowedActivityStatusTransition('completed', 'archived')).toBe(true);
    expect(isAllowedActivityStatusTransition('archived', 'active')).toBe(true);
    expect(isAllowedActivityStatusTransition('active', 'archived')).toBe(false);
  });

  it('computes discrepancy and totald state', () => {
    const records = [
      { id: '1', activity_id: 'g1', entity_id: 'p1', unit_amount: 100, unit_amount: 120, net: 20 },
      { id: '2', activity_id: 'g1', entity_id: 'p2', unit_amount: 200, unit_amount: 180, net: -20 },
    ];

    expect(computeEntriesDiscrepancy(records)).toBe(0);
    expect(isTotaldEntries(records)).toBe(true);
  });

  it('only allows adding entities for active activitys', () => {
    expect(canAddUnitsForStatus('active')).toBe(true);
    expect(canAddUnitsForStatus('completed')).toBe(false);
    expect(canAddUnitsForStatus('archived')).toBe(false);
  });
});
