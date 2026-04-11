import { useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import {
  parseMethod,
  baseMethodLabel,
  normalizeChannelKey,
  getChannelVisual,
} from '../components/ChannelVisualization';
import type { Activity, ActivityRecord, Entity } from '../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ChannelEntry {
  id: string;
  direction: 'increase' | 'decrease' | 'transfer';
  unit_amount: number;
  created_at?: string;
  method: string;
  notes?: string;
  date: string;
  amount: number;
  status: string;
  activity_id?: string | null;
  entity_id?: string | null;
  transfer_group_id?: string | null;
  source_record_id?: string | null;
  channel_label?: string;
  [key: string]: unknown;
}

export interface AdjustmentEntry {
  id: string;
  entity_id?: string | null;
  source_record_id?: string | null;
  type: 'input' | 'output';
  amount: number;
  date: string;
  status: string;
  [key: string]: unknown;
}

export interface AdjustmentRequest {
  id: string;
  entity_id?: string | null;
  requested_at: string;
  amount: number;
  type: 'input' | 'output';
  status: string;
  [key: string]: unknown;
}

export interface TransferAccount {
  id: string;
  name: string;
  category: string;
  is_active: boolean;
  notes?: string;
  status: string;
  [key: string]: unknown;
}

export interface ChannelCardDatum {
  method: string;
  amount: number;
  label: string;
  base: string;
}

export interface UnresolvedOutflow {
  method: string;
  amount: number;
}

export interface TopChannelInsight {
  label: string;
  share: string;
}

export interface ProposalSummary {
  pendingCount: number;
  deferredCount: number;
  pendingSum: number;
  deferredSum: number;
}

export interface HistoryDatum {
  date: string;
  total: number;
  fullDate: string;
}

export interface DistributionDatum {
  name: string;
  value: number;
  color: string;
}

export interface AvailableChannelCategory {
  value: string;
  label: string;
}

export type LedgerViewFilter = 'all' | 'posted' | 'action';

export type UnifiedLedgerRow =
  | { rowKind: 'posted'; sortKey: string; posted: ChannelEntry; workflow?: undefined }
  | { rowKind: 'pending'; sortKey: string; posted?: undefined; workflow: AdjustmentEntry }
  | { rowKind: 'deferred'; sortKey: string; posted?: undefined; workflow: AdjustmentEntry };

// ---------------------------------------------------------------------------
// Filter params accepted by the hook
// ---------------------------------------------------------------------------

export interface ChannelDataFilters {
  archivedChannelActivityRecordIds: string[];
  archivedAdjustmentIds: string[];
  orgSearchQuery: string;
  orgTypeFilter: 'all' | 'increment' | 'decrement';
  orgDateStart: string;
  orgDateEnd: string;
  adjustmentSearchQuery: string;
  adjustmentTypeFilter: 'all' | 'input' | 'output';
  retentionDays: string;
  ledgerViewFilter: LedgerViewFilter;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseChannelDataReturn {
  // Raw canonical collections (safe defaults applied)
  entities: Entity[];
  records: ActivityRecord[];

  // Derived entries
  channelEntries: ChannelEntry[];
  adjustments: AdjustmentEntry[];
  adjustmentRequests: AdjustmentRequest[];
  transferAccounts: TransferAccount[];

  // Aggregated totals
  channelTotals: Record<string, number>;
  totalChannel: number;
  unresolvedOutflowMethods: UnresolvedOutflow[];
  unresolvedOutflowAmount: number;
  hasUnresolvedOutflowAlert: boolean;
  channelCardData: ChannelCardDatum[];
  p2pChannelOptions: ChannelCardDatum[];
  channelLabelSuggestions: string[];
  topChannelInsight: TopChannelInsight;
  totalOutstanding: number;

  // Filtered / archived split
  activeChannelEntries: ChannelEntry[];
  archivedChannelEntries: ChannelEntry[];
  filteredActiveChannelEntries: ChannelEntry[];
  filteredArchivedChannelEntries: ChannelEntry[];
  activeAdjustments: AdjustmentEntry[];
  archivedAdjustments: AdjustmentEntry[];
  filteredActiveAdjustments: AdjustmentEntry[];
  filteredArchivedAdjustments: AdjustmentEntry[];

  // Archive-related IDs
  oldChannelActivityRecordIds: string[];
  oldAdjustmentIds: string[];
  settledAdjustmentActivityRecordIds: string[];

  // Pending requests
  pendingAdjustmentRequests: AdjustmentRequest[];
  proposalSummary: ProposalSummary;

  // Unified ledger
  unifiedActiveLedgerRows: UnifiedLedgerRow[];

  // Chart data
  historyData: HistoryDatum[];
  distributionData: DistributionDatum[];

  // Channel categories
  availableChannelCategories: AvailableChannelCategory[];
  defaultChannelCategory: string;

  // Helpers
  linkedActivityIdForSourceRecord: (sourceRecordId: string | null | undefined) => string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChannelData(
  filters: ChannelDataFilters,
  tx: (s: string) => string,
): UseChannelDataReturn {
  const {
    entities: rawEntities,
    records: rawRecords,
    channels: rawChannels,
    activities: rawActivities,
  } = useData();

  // Defensive guards
  const entities = rawEntities ?? [];
  const records = rawRecords ?? [];
  const channels = rawChannels ?? [];
  const activities = rawActivities ?? [];

  // ---------- activity map ----------
  const activityMap = useMemo(() => {
    const map = new Map<string, Activity>();
    activities.forEach(a => map.set(a.id, a));
    return map;
  }, [activities]);

  // ---------- channel entries (applied records) ----------
  const channelEntries: ChannelEntry[] = useMemo(() =>
    records.filter(r => r.status === 'applied').map(r => {
      const activity = r.activity_id ? activityMap.get(r.activity_id) : undefined;
      return {
        ...r,
        date: r.created_at || '',
        amount: r.unit_amount || 0,
        method: r.channel_label || r.notes || activity?.channel_label || 'Activity',
      };
    }),
    [records, activityMap]
  );

  // ---------- adjustments (deferred/pending) ----------
  const adjustments: AdjustmentEntry[] = useMemo(() =>
    records.filter(r => r.status === 'deferred' || r.status === 'pending').map(r => ({
      ...r,
      type: (r.direction === 'increase' ? 'input' : 'output') as 'input' | 'output',
      amount: r.unit_amount || 0,
      date: r.created_at || ''
    })),
    [records]
  );

  // ---------- adjustment requests ----------
  const adjustmentRequests: AdjustmentRequest[] = useMemo(() =>
    records.filter(r => r.status === 'pending').map(r => ({
      ...r,
      requested_at: r.created_at || '',
      amount: r.unit_amount || 0,
      type: (r.direction === 'increase' ? 'input' : 'output') as 'input' | 'output',
    })),
    [records]
  );

  // ---------- transfer accounts ----------
  const transferAccounts: TransferAccount[] = useMemo(() =>
    channels.map(c => ({
      ...c,
      category: c.notes || 'other',
      is_active: c.status === 'active'
    })),
    [channels]
  );

  // ---------- channel totals & aggregations ----------
  const {
    channelTotals,
    totalChannel,
    unresolvedOutflowMethods,
    unresolvedOutflowAmount,
    channelCardData,
    p2pChannelOptions,
    channelLabelSuggestions,
  } = useMemo(() => {
    const nextChannelTotals: Record<string, number> = {};

    channelEntries.forEach(record => {
      const multiplier = record.direction === 'increase' ? 1 : -1;
      const amount = (record.unit_amount ?? 0) * multiplier;
      const label = record.method || 'other';
      nextChannelTotals[label] = (nextChannelTotals[label] || 0) + amount;
    });

    const nextTotalChannel = Object.values(nextChannelTotals).reduce((sum, v) => sum + v, 0);
    const nextUnresolvedOutflowMethods = Object.entries(nextChannelTotals)
      .filter(([, value]) => value < 0)
      .map(([method, value]) => ({ method, amount: Math.abs(value) }));
    const nextUnresolvedOutflowAmount = nextUnresolvedOutflowMethods.reduce((sum, item) => sum + item.amount, 0);

    const nextChannelCardData: ChannelCardDatum[] = Object.entries(nextChannelTotals)
      .map(([method, amount]) => ({
        method,
        amount,
        label: (() => {
          const { base, account } = parseMethod(method);
          const label = baseMethodLabel(base);
          return account ? `${label} \u2022 ${account}` : label;
        })(),
        base: parseMethod(method).base,
      }))
      .sort((a, b) => b.amount - a.amount);

    const nextP2pChannelOptions = nextChannelCardData.filter(item => item.base !== 'channel_account' && item.base !== 'value' && item.amount > 0);
    const nextChannelLabelSuggestions = Array.from(new Set(
      nextChannelCardData
        .filter(item => item.base === 'channel_account')
        .map(item => parseMethod(item.method).account)
        .filter((account): account is string => Boolean(account && account.trim()))
    ));

    return {
      channelTotals: nextChannelTotals,
      totalChannel: nextTotalChannel,
      unresolvedOutflowMethods: nextUnresolvedOutflowMethods,
      unresolvedOutflowAmount: nextUnresolvedOutflowAmount,
      channelCardData: nextChannelCardData,
      p2pChannelOptions: nextP2pChannelOptions,
      channelLabelSuggestions: nextChannelLabelSuggestions,
    };
  }, [channelEntries]);

  const hasUnresolvedOutflowAlert = unresolvedOutflowAmount > 0.009;

  // ---------- top channel insight ----------
  const topChannelInsight = useMemo<TopChannelInsight>(() => {
    const primaryChannel = channelCardData.find(item => item.amount > 0) ?? channelCardData[0] ?? null;
    if (!primaryChannel || Math.abs(totalChannel) < 0.01) {
      return { label: tx('No active channel'), share: tx('0%') };
    }
    const share = Math.max(0, Math.min(100, (primaryChannel.amount / totalChannel) * 100));
    return { label: primaryChannel.label, share: `${Math.round(share)}%` };
  }, [channelCardData, totalChannel, tx]);

  // ---------- retention days ----------
  const retentionDaysNumber = useMemo(() => {
    const parsed = Number(filters.retentionDays);
    if (!Number.isFinite(parsed)) return 90;
    return Math.max(1, Math.floor(parsed));
  }, [filters.retentionDays]);

  // ---------- archived / active channel entries ----------
  const archivedChannelActivityRecordIdSet = useMemo(() => new Set(filters.archivedChannelActivityRecordIds), [filters.archivedChannelActivityRecordIds]);
  const activeChannelEntries = useMemo(
    () => channelEntries.filter(record => !archivedChannelActivityRecordIdSet.has(record.id)),
    [channelEntries, archivedChannelActivityRecordIdSet]
  );
  const archivedChannelEntries = useMemo(
    () => channelEntries.filter(record => archivedChannelActivityRecordIdSet.has(record.id)),
    [channelEntries, archivedChannelActivityRecordIdSet]
  );

  // ---------- filtered active channel entries ----------
  const normalizedOrgSearch = filters.orgSearchQuery.trim().toLowerCase();
  const filteredActiveChannelEntries = useMemo(() => activeChannelEntries.filter(record => {
    const normalizedDirection = filters.orgTypeFilter === 'increment' ? 'increase' : filters.orgTypeFilter === 'decrement' ? 'decrease' : 'all';
    if (filters.orgTypeFilter !== 'all' && record.direction !== normalizedDirection) return false;
    const recDate = (record.created_at ?? '').slice(0, 10);
    if (filters.orgDateStart && recDate < filters.orgDateStart) return false;
    if (filters.orgDateEnd && recDate > filters.orgDateEnd) return false;
    if (!normalizedOrgSearch) return true;
    return (
      (record.notes ?? '').toLowerCase().includes(normalizedOrgSearch)
      || recDate.toLowerCase().includes(normalizedOrgSearch)
    );
  }), [activeChannelEntries, filters.orgTypeFilter, filters.orgDateStart, filters.orgDateEnd, normalizedOrgSearch]);

  const filteredArchivedChannelEntries = useMemo(() => archivedChannelEntries.filter(record => {
    const normalizedDirection = filters.orgTypeFilter === 'increment' ? 'increase' : filters.orgTypeFilter === 'decrement' ? 'decrease' : 'all';
    if (filters.orgTypeFilter !== 'all' && record.direction !== normalizedDirection) return false;
    const recDate = (record.created_at ?? '').slice(0, 10);
    if (filters.orgDateStart && recDate < filters.orgDateStart) return false;
    if (filters.orgDateEnd && recDate > filters.orgDateEnd) return false;
    if (!normalizedOrgSearch) return true;
    return (
      (record.notes ?? '').toLowerCase().includes(normalizedOrgSearch)
      || recDate.toLowerCase().includes(normalizedOrgSearch)
    );
  }), [archivedChannelEntries, filters.orgTypeFilter, filters.orgDateStart, filters.orgDateEnd, normalizedOrgSearch]);

  // ---------- old channel record IDs ----------
  const oldChannelActivityRecordIds = useMemo(() => {
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - retentionDaysNumber);
    const thresholdTime = threshold.getTime();
    return activeChannelEntries
      .filter(record => {
        const date = new Date(record.created_at ?? '');
        return Number.isFinite(date.getTime()) && date.getTime() < thresholdTime;
      })
      .map(record => record.id);
  }, [activeChannelEntries, retentionDaysNumber]);

  // ---------- outstanding total ----------
  const totalOutstanding = useMemo(() => {
    const unitAdjustmentTotals: Record<string, number> = {};
    adjustments.forEach(adjustment => {
      if (!adjustment.entity_id) return;
      if (!unitAdjustmentTotals[adjustment.entity_id]) unitAdjustmentTotals[adjustment.entity_id] = 0;
      const multiplier = adjustment.type === 'input' ? 1 : -1;
      unitAdjustmentTotals[adjustment.entity_id] += adjustment.amount * multiplier;
    });
    return Object.values(unitAdjustmentTotals).reduce((sum, v) => sum + v, 0);
  }, [adjustments]);

  // ---------- archived / active adjustments ----------
  const archivedAdjustmentIdSet = useMemo(() => new Set(filters.archivedAdjustmentIds), [filters.archivedAdjustmentIds]);
  const activeAdjustments = useMemo(() => adjustments.filter(a => !archivedAdjustmentIdSet.has(a.id)), [adjustments, archivedAdjustmentIdSet]);
  const archivedAdjustments = useMemo(() => adjustments.filter(a => archivedAdjustmentIdSet.has(a.id)), [adjustments, archivedAdjustmentIdSet]);

  // ---------- filtered adjustments ----------
  const normalizedAdjustmentSearch = filters.adjustmentSearchQuery.trim().toLowerCase();
  const filteredActiveAdjustments = useMemo(() => activeAdjustments.filter(adjustment => {
    if (filters.adjustmentTypeFilter !== 'all' && adjustment.type !== filters.adjustmentTypeFilter) return false;
    if (!normalizedAdjustmentSearch) return true;
    const unitName = (entities.find(unit => unit.id === adjustment.entity_id)?.name || '').toLowerCase();
    return (
      unitName.includes(normalizedAdjustmentSearch)
      || adjustment.date.toLowerCase().includes(normalizedAdjustmentSearch)
    );
  }), [activeAdjustments, filters.adjustmentTypeFilter, normalizedAdjustmentSearch, entities]);

  const filteredArchivedAdjustments = useMemo(() => archivedAdjustments.filter(adjustment => {
    if (filters.adjustmentTypeFilter !== 'all' && adjustment.type !== filters.adjustmentTypeFilter) return false;
    if (!normalizedAdjustmentSearch) return true;
    const unitName = (entities.find(unit => unit.id === adjustment.entity_id)?.name || '').toLowerCase();
    return (
      unitName.includes(normalizedAdjustmentSearch)
      || adjustment.date.toLowerCase().includes(normalizedAdjustmentSearch)
    );
  }), [archivedAdjustments, filters.adjustmentTypeFilter, normalizedAdjustmentSearch, entities]);

  // ---------- old adjustment IDs ----------
  const oldAdjustmentIds = useMemo(() => {
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - retentionDaysNumber);
    const thresholdTime = threshold.getTime();
    return activeAdjustments
      .filter(adjustment => {
        const date = new Date(adjustment.date);
        return Number.isFinite(date.getTime()) && date.getTime() < thresholdTime;
      })
      .map(adjustment => adjustment.id);
  }, [activeAdjustments, retentionDaysNumber]);

  // ---------- settled adjustment record IDs ----------
  const settledAdjustmentActivityRecordIds = useMemo(() => {
    const unitTotals = new Map<string, number>();
    activeAdjustments.forEach(adjustment => {
      if (!adjustment.entity_id) return;
      const current = unitTotals.get(adjustment.entity_id) || 0;
      const multiplier = adjustment.type === 'input' ? 1 : -1;
      unitTotals.set(adjustment.entity_id, current + (adjustment.amount * multiplier));
    });
    const settledUnits = new Set(
      Array.from(unitTotals.entries())
        .filter(([, total]) => Math.abs(total) < 0.01)
        .map(([unitId]) => unitId)
    );
    return activeAdjustments.filter(a => a.entity_id && settledUnits.has(a.entity_id)).map(a => a.id);
  }, [activeAdjustments]);

  // ---------- pending adjustment requests ----------
  const pendingAdjustmentRequests = useMemo(
    () => adjustmentRequests
      .filter(request => request.status === 'pending')
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at)),
    [adjustmentRequests],
  );

  // ---------- proposal summary ----------
  const proposalSummary = useMemo<ProposalSummary>(() => {
    const pending = activeAdjustments.filter(a => a.status === 'pending');
    const deferred = activeAdjustments.filter(a => a.status === 'deferred');
    return {
      pendingCount: pending.length,
      deferredCount: deferred.length,
      pendingSum: pending.reduce((s, a) => s + (a.amount || 0), 0),
      deferredSum: deferred.reduce((s, a) => s + (a.amount || 0), 0),
    };
  }, [activeAdjustments]);

  // ---------- unified ledger rows ----------
  const unifiedActiveLedgerRows = useMemo<UnifiedLedgerRow[]>(() => {
    const postedPart: UnifiedLedgerRow[] = filteredActiveChannelEntries.map(posted => ({
      rowKind: 'posted' as const,
      sortKey: posted.created_at || '',
      posted,
    }));
    const wfPart: UnifiedLedgerRow[] = filteredActiveAdjustments.map(workflow => ({
      rowKind: (workflow.status === 'pending' ? 'pending' : 'deferred') as 'pending' | 'deferred',
      sortKey: workflow.date || '',
      workflow,
    }));
    let merged: UnifiedLedgerRow[] = [...postedPart, ...wfPart].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    if (filters.ledgerViewFilter === 'posted') merged = merged.filter(r => r.rowKind === 'posted');
    if (filters.ledgerViewFilter === 'action') merged = merged.filter(r => r.rowKind !== 'posted');
    return merged;
  }, [filteredActiveChannelEntries, filteredActiveAdjustments, filters.ledgerViewFilter]);

  // ---------- linked activity helper ----------
  const linkedActivityIdForSourceRecord = useCallback((sourceRecordId: string | null | undefined) => {
    if (!sourceRecordId) return null;
    const source = records.find(r => r.id === sourceRecordId);
    const aid = source?.activity_id;
    return aid && String(aid).trim() ? String(aid) : null;
  }, [records]);

  // ---------- chart data ----------
  const historyData = useMemo<HistoryDatum[]>(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    return last30Days.map(dateStr => {
      const dailyTotal = (channelEntries || [])
        .filter(r => (r.created_at ?? '').startsWith(dateStr))
        .reduce((sum, r) => sum + (r.direction === 'increase' ? r.unit_amount : -r.unit_amount), 0);
      return { date: dateStr.slice(5), total: dailyTotal, fullDate: dateStr };
    });
  }, [channelEntries]);

  const distributionData = useMemo<DistributionDatum[]>(() => {
    return channelCardData
      .filter(item => Math.abs(item.amount) > 0.01)
      .map(item => ({
        name: item.label,
        value: Math.abs(item.amount),
        color: getChannelVisual(item.base).chartColor,
      }));
  }, [channelCardData]);

  // ---------- available channel categories ----------
  const availableChannelCategories = useMemo<AvailableChannelCategory[]>(() => {
    const options = new Map<string, AvailableChannelCategory>();
    const blockedBases = new Set(['channel_account', 'value', 'asset', 'other']);

    for (const account of transferAccounts) {
      const key = normalizeChannelKey(account.category);
      if (!key || blockedBases.has(key)) continue;
      options.set(key, { value: account.category, label: baseMethodLabel(account.category) });
    }

    for (const item of channelCardData) {
      const key = normalizeChannelKey(item.base);
      if (!key || blockedBases.has(key)) continue;
      options.set(key, { value: item.base, label: baseMethodLabel(item.base) });
    }

    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [channelCardData, transferAccounts]);

  const defaultChannelCategory = availableChannelCategories[0]?.value || '';

  return {
    entities,
    records,
    channelEntries,
    adjustments,
    adjustmentRequests,
    transferAccounts,
    channelTotals,
    totalChannel,
    unresolvedOutflowMethods,
    unresolvedOutflowAmount,
    hasUnresolvedOutflowAlert,
    channelCardData,
    p2pChannelOptions,
    channelLabelSuggestions,
    topChannelInsight,
    totalOutstanding,
    activeChannelEntries,
    archivedChannelEntries,
    filteredActiveChannelEntries,
    filteredArchivedChannelEntries,
    activeAdjustments,
    archivedAdjustments,
    filteredActiveAdjustments,
    filteredArchivedAdjustments,
    oldChannelActivityRecordIds,
    oldAdjustmentIds,
    settledAdjustmentActivityRecordIds,
    pendingAdjustmentRequests,
    proposalSummary,
    unifiedActiveLedgerRows,
    historyData,
    distributionData,
    availableChannelCategories,
    defaultChannelCategory,
    linkedActivityIdForSourceRecord,
  };
}
