import { describe, expect, it } from 'vitest';
import {
  canAddEntitiesForStatus,
  computeActivityRecordsDiscrepancy,
  isAllowedActivityStatusTransition,
  isTotaledActivityRecords,
} from './activityRules';

describe('activityRules', () => {
  it('allows expected lifecycle transitions', () => {
    expect(isAllowedActivityStatusTransition('active', 'completed')).toBe(true);
    expect(isAllowedActivityStatusTransition('completed', 'archived')).toBe(true);
    expect(isAllowedActivityStatusTransition('archived', 'active')).toBe(true);
    expect(isAllowedActivityStatusTransition('active', 'archived')).toBe(false);
  });

  it('computes discrepancy and totald state', () => {
    const records = [
      { id: '1', org_id: 'o1', activity_id: 'g1', entity_id: 'p1', direction: 'increase' as const, status: 'applied' as const, unit_amount: 120 },
      { id: '2', org_id: 'o1', activity_id: 'g1', entity_id: 'p2', direction: 'decrease' as const, status: 'applied' as const, unit_amount: 120 },
    ];

    expect(computeActivityRecordsDiscrepancy(records)).toBe(0);
    expect(isTotaledActivityRecords(records)).toBe(true);
  });

  it('detects imbalance when outflow does not match inflow', () => {
    const records = [
      { id: '1', org_id: 'o1', activity_id: 'g1', entity_id: 'p1', direction: 'increase' as const, status: 'applied' as const, unit_amount: 100 },
      { id: '2', org_id: 'o1', activity_id: 'g1', entity_id: 'p2', direction: 'decrease' as const, status: 'applied' as const, unit_amount: 80 },
    ];
    expect(computeActivityRecordsDiscrepancy(records)).toBe(-20);
    expect(isTotaledActivityRecords(records)).toBe(false);
  });

  it('only allows adding entities for active activitys', () => {
    expect(canAddEntitiesForStatus('active')).toBe(true);
    expect(canAddEntitiesForStatus('completed')).toBe(false);
    expect(canAddEntitiesForStatus('archived')).toBe(false);
  });
});
