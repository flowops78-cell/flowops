import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { UserPlus, Plus, Circle, ArrowUpRight, ArrowDownLeft, Handshake, Search, Filter, Download, Trash2 } from 'lucide-react';
import { formatValue, formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import Papa from 'papaparse';
import MobileRecordCard from '../components/MobileRecordCard';
import CollapsibleWorkspaceSection from '../components/CollapsibleWorkspaceSection';
import { useAppRole } from '../context/AppRoleContext';
import { useNotification } from '../context/NotificationContext';
import { useLabels } from '../lib/labels';

const getAssociateDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed Associate';
};

const getAssociateRoleLabel = (role?: string | null) => {
  switch (role) {
    case 'associate': return 'Direct Associate (Context-driven)';
    case 'channel': return 'Operational Channel (Activity-driven)';
    case 'hybrid': return 'Hybrid Configuration';
    case 'both': return 'Hybrid';
    default: return 'Contextual Associate';
  }
};

export function AssociatesPage({ embedded = false }: { embedded?: boolean }) {
  const { associates, associateAllocations, addAssociate, deleteAssociate, addAssociateAllocation, deleteAssociateAllocation, updateAssociate, units, workspaces, entries, recordSystemEvent } = useData();
  const { canManageValue } = useAppRole();
  const { notify } = useNotification();
  const { tx } = useLabels();
  const [isAdding, setIsAdding] = useState(false);
  const [selectedAssociateId, setSelectedAssociateId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'allocations' | 'units'>('allocations');
  const [deletingAssociateId, setDeletingAssociateId] = useState<string | null>(null);
  const [deletingAssociateAllocationId, setDeletingAssociateAllocationId] = useState<string | null>(null);
  const [archivedAssociateAllocationIds, setArchivedAssociateAllocationIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('associates.archived_allocation_ids');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });
  const [isArchivedAssociateListExpanded, setIsArchivedAssociateListExpanded] = useState(false);
  const [isArchivedAssociateAllocationsExpanded, setIsArchivedAssociateAllocationsExpanded] = useState(false);
  const [allocationSearchQuery, setAllocationSearchQuery] = useState('');
  const [allocationTypeFilter, setAllocationTypeFilter] = useState<'all' | 'input' | 'alignment' | 'output' | 'adjustment'>('all');
  const [entryDateStart, setEntryDateStart] = useState('');
  const [entryDateEnd, setEntryDateEnd] = useState('');
  const [retentionDays, setRetentionDays] = useState(() => {
    if (typeof window === 'undefined') return '90';
    return window.localStorage.getItem('associates.retentionDays') || '90';
  });
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('associates.autoArchiveEnabled') === 'true';
  });

  const [name, setName] = useState('');
  const [role, setRole] = useState<'channel' | 'associate' | 'hybrid'>('channel');
  const [newAssociateAllocationFactor, setNewAssociateAllocationFactor] = useState('0');
  const [newAssociateOverheadWeight, setNewAssociateOverheadWeight] = useState('0');

  const [transType, setTransType] = useState<'input' | 'alignment' | 'output' | 'adjustment'>('input');
  const [transAmount, setTransAmount] = useState('');
  const [editAssociateAllocationFactor, setEditAssociateAllocationFactor] = useState('0');
  const [editAssociateOverheadWeight, setEditAssociateOverheadWeight] = useState('0');
  const [alignmentStartDate, setAlignmentStartDate] = useState('');
  const [alignmentEndDate, setAlignmentEndDate] = useState('');

  const parseNonNegativeNumber = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  const handleAddAssociate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageValue) return;
    try {
      await addAssociate({
        name,
        role: role as any,
        allocation_factor: parseNonNegativeNumber(newAssociateAllocationFactor),
        overhead_weight: parseNonNegativeNumber(newAssociateOverheadWeight),
        total_number: 0,
        status: 'active'
      });
      setIsAdding(false);
      setName('');
      setNewAssociateAllocationFactor('0');
      setNewAssociateOverheadWeight('0');
      notify({ type: 'success', message: 'Associate profile established.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to establish associate profile.' });
    }
  };

  const handleAddAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageValue || !selectedAssociateId || !transAmount) return;
    const today = new Date().toISOString().split('T')[0];

    try {
      await addAssociateAllocation({
        attributed_associate_id: selectedAssociateId,
        type: transType as any,
        amount: parseFloat(transAmount),
        date: today
      });
      setTransAmount('');
      notify({ type: 'success', message: 'Operational allocation recorded.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to record allocation.' });
    }
  };

  const handleDeleteAssociate = async (associateId: string) => {
    if (!canManageValue || deletingAssociateId === associateId) return;
    const confirmed = window.confirm('Remove this associate? This is only allowed when no dependency links remain.');
    if (!confirmed) return;

    try {
      setDeletingAssociateId(associateId);
      await deleteAssociate(associateId);
      if (selectedAssociateId === associateId) {
        setSelectedAssociateId(null);
      }
      notify({ type: 'success', message: 'Associate removed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to remove associate.' });
    } finally {
      setDeletingAssociateId(current => (current === associateId ? null : current));
    }
  };

  const handleArchiveAssociate = async (associateId: string) => {
    if (!canManageValue) return;
    const associate = associates.find(item => item.id === associateId);
    if (!associate || associate.status === 'inactive') return;

    try {
      await updateAssociate({ ...associate, status: 'inactive' });
      if (selectedAssociateId === associateId) {
        setSelectedAssociateId(null);
      }
      void (recordSystemEvent as any)({ 
        action: 'associate_archived',
        entity: 'associate',
        entity_id: associateId,
        details: `Associate ${getAssociateDisplayName(associate.name)} moved to hidden`,
      });
      notify({ type: 'success', message: 'Associate hidden.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to hide associate.' });
    }
  };

  const handleUnarchiveAssociate = async (associateId: string) => {
    if (!canManageValue) return;
    const associate = associates.find(item => item.id === associateId);
    if (!associate || associate.status !== 'inactive') return;

    try {
      await updateAssociate({ ...associate, status: 'active' });
      void (recordSystemEvent as any)({ 
        action: 'associate_unarchived',
        entity: 'associate',
        entity_id: associateId,
        details: `Associate ${getAssociateDisplayName(associate.name)} restored`,
      });
      notify({ type: 'success', message: 'Associate restored.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to restore associate.' });
    }
  };

  const handleDeleteAssociateAllocation = async (allocationId: string) => {
    if (!canManageValue || deletingAssociateAllocationId === allocationId) return;
    const confirmed = window.confirm('Remove this allocation? This will reverse its impact.');
    if (!confirmed) return;

    try {
      setDeletingAssociateAllocationId(allocationId);
      await deleteAssociateAllocation(allocationId);
      notify({ type: 'success', message: 'Allocation removed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to remove allocation.' });
    } finally {
      setDeletingAssociateAllocationId(current => (current === allocationId ? null : current));
    }
  };

  const handleArchiveAssociateAllocation = (allocationId: string) => {
    setArchivedAssociateAllocationIds(current => (current.includes(allocationId) ? current : [...current, allocationId]));
    void (recordSystemEvent as any)({ 
      action: 'associate_allocation_archived',
      entity: 'associate_allocation',
      entity_id: allocationId,
      details: 'Allocation moved to hidden repository',
    });
    notify({ type: 'success', message: 'Allocation hidden.' });
  };

  const handleUnarchiveAssociateAllocation = (allocationId: string) => {
    setArchivedAssociateAllocationIds(current => current.filter(item => item !== allocationId));
    void (recordSystemEvent as any)({ 
      action: 'associate_allocation_unarchived',
      entity: 'associate_allocation',
      entity_id: allocationId,
      details: 'Allocation restored to active set',
    });
    notify({ type: 'success', message: 'Allocation restored.' });
  };

  const selectedAssociate = associates.find(a => a.id === selectedAssociateId);
  const selectedAssociateUnits = useMemo(
    () => units
      .filter(unit => unit.attributed_associate_id === selectedAssociateId)
      .sort((a, b) => (b.total || 0) - (a.total || 0)),
    [units, selectedAssociateId]
  );
  const selectedAllocations = associateAllocations.filter(t => t.attributed_associate_id === selectedAssociateId);
  const archivedAssociateAllocationIdSet = useMemo(() => new Set(archivedAssociateAllocationIds), [archivedAssociateAllocationIds]);
  const activeSelectedAllocations = useMemo(
    () => selectedAllocations.filter(allocation => !archivedAssociateAllocationIdSet.has(allocation.id)),
    [selectedAllocations, archivedAssociateAllocationIdSet]
  );
  const archivedSelectedAllocations = useMemo(
    () => selectedAllocations.filter(allocation => archivedAssociateAllocationIdSet.has(allocation.id)),
    [selectedAllocations, archivedAssociateAllocationIdSet]
  );
  const normalizedAllocationSearch = allocationSearchQuery.trim().toLowerCase();
  const filteredActiveSelectedAllocations = useMemo(() => activeSelectedAllocations.filter(allocation => {
    if (allocationTypeFilter !== 'all' && allocation.type !== allocationTypeFilter) return false;
    if (entryDateStart && allocation.date < entryDateStart) return false;
    if (entryDateEnd && allocation.date > entryDateEnd) return false;
    if (!normalizedAllocationSearch) return true;
    return (
      allocation.type.toLowerCase().includes(normalizedAllocationSearch) ||
      allocation.date.toLowerCase().includes(normalizedAllocationSearch)
    );
  }), [activeSelectedAllocations, allocationTypeFilter, entryDateStart, entryDateEnd, normalizedAllocationSearch]);
  const filteredArchivedSelectedAllocations = useMemo(() => archivedSelectedAllocations.filter(allocation => {
    if (allocationTypeFilter !== 'all' && allocation.type !== allocationTypeFilter) return false;
    if (entryDateStart && allocation.date < entryDateStart) return false;
    if (entryDateEnd && allocation.date > entryDateEnd) return false;
    if (!normalizedAllocationSearch) return true;
    return (
      allocation.type.toLowerCase().includes(normalizedAllocationSearch) ||
      allocation.date.toLowerCase().includes(normalizedAllocationSearch)
    );
  }), [archivedSelectedAllocations, allocationTypeFilter, entryDateStart, entryDateEnd, normalizedAllocationSearch]);
  const retentionDaysNumber = useMemo(() => {
    const parsed = Number(retentionDays);
    if (!Number.isFinite(parsed)) return 90;
    return Math.max(1, Math.floor(parsed));
  }, [retentionDays]);
  const oldAssociateAllocationIds = useMemo(() => {
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - retentionDaysNumber);
    const thresholdTime = threshold.getTime();
    return associateAllocations
      .filter(allocation => !archivedAssociateAllocationIdSet.has(allocation.id))
      .filter(allocation => {
        const date = new Date(allocation.date);
        return Number.isFinite(date.getTime()) && date.getTime() < thresholdTime;
      })
      .map(allocation => allocation.id);
  }, [associateAllocations, archivedAssociateAllocationIdSet, retentionDaysNumber]);
  const activeAssociates = useMemo(() => associates.filter(associate => associate.status !== 'inactive'), [associates]);
  const archivedAssociates = useMemo(() => associates.filter(associate => associate.status === 'inactive'), [associates]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('associates.archived_allocation_ids', JSON.stringify(archivedAssociateAllocationIds));
  }, [archivedAssociateAllocationIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('associates.retentionDays', retentionDays);
  }, [retentionDays]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('associates.autoArchiveEnabled', autoArchiveEnabled ? 'true' : 'false');
  }, [autoArchiveEnabled]);

  useEffect(() => {
    if (!autoArchiveEnabled || oldAssociateAllocationIds.length === 0) return;
    setArchivedAssociateAllocationIds(current => {
      const next = new Set(current);
      oldAssociateAllocationIds.forEach(id => next.add(id));
      if (next.size === current.length) return current;
      void (recordSystemEvent as any)({ 
        action: 'associate_allocations_auto_archived',
        entity: 'associate_allocation',
        amount: oldAssociateAllocationIds.length,
        details: `Auto-hidden allocations older than ${retentionDaysNumber} days`,
      });
      return Array.from(next);
    });
  }, [autoArchiveEnabled, oldAssociateAllocationIds, recordSystemEvent, retentionDaysNumber]);

  useEffect(() => {
    if (!selectedAssociate) {
      setEditAssociateAllocationFactor('0');
      setEditAssociateOverheadWeight('0');
      setAlignmentStartDate('');
      setAlignmentEndDate('');
      return;
    }

    setEditAssociateAllocationFactor((selectedAssociate.allocation_factor || 0).toString());
    setEditAssociateOverheadWeight((selectedAssociate.overhead_weight || 0).toString());

    const attributedUnitIds = new Set(
      units
        .filter(unit => unit.attributed_associate_id === selectedAssociate.id)
        .map(unit => unit.id)
    );

    const relatedWorkspaceDateSet = new Set<string>();
    entries.forEach(entry => {
      if (!attributedUnitIds.has(entry.unit_id)) return;
      const workspace = workspaces.find(item => item.id === entry.workspace_id);
      if (workspace?.date) relatedWorkspaceDateSet.add(workspace.date);
    });

    const sortedDates = Array.from(relatedWorkspaceDateSet).sort();
    if (sortedDates.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      setAlignmentStartDate(today);
      setAlignmentEndDate(today);
      return;
    }

    setAlignmentStartDate(sortedDates[0]);
    setAlignmentEndDate(sortedDates[sortedDates.length - 1]);
  }, [selectedAssociateId, selectedAssociate, units, entries, workspaces]);

  const selectedAssociateMetrics = useMemo(() => {
    if (!selectedAssociate) {
      return {
        attributedUnits: 0,
        attributedActivity: 0,
        attributedContribution: 0,
        perWorkspaceAlignments: [] as Array<{
          workspaceId: string;
          date: string;
          channel: string;
          activityUnits: number;
          systemContribution: number;
          associateAdjustment: number;
          overheadAdjustment: number;
          totalAdjustment: number;
        }>,
        summary: {
          totalAssociateAdjustment: 0,
          totalOverheadAdjustment: 0,
          totalOverallAdjustment: 0,
        },
        attributedActivityCount: 0,
        attributedContributionTotal: 0,
        totalAdjustment: 0,
      };
    }

    const isInDateRange = (dateStr: string) => {
      if (!dateStr) return false;
      if (alignmentStartDate && dateStr < alignmentStartDate) return false;
      if (alignmentEndDate && dateStr > alignmentEndDate) return false;
      return true;
    };

    const attributedUnitIds = new Set(
      units
        .filter(unit => unit.attributed_associate_id === selectedAssociate.id)
        .map(unit => unit.id)
    );

    const workspaceLookup = new Map(workspaces.map(w => [w.id, w]));
    const alignmentAccumulator = new Map<string, { workspaceId: string; date: string; channel: string; activityUnits: number; systemContribution: number }>();

    entries.forEach(entry => {
      if (!attributedUnitIds.has(entry.unit_id)) return;
      const workspace = workspaceLookup.get(entry.workspace_id);
      if (!workspace || !isInDateRange(workspace.date)) return;

      const current = alignmentAccumulator.get(workspace.id) || {
        workspaceId: workspace.id,
        date: workspace.date,
        channel: workspace.channel || 'Operational Context',
        activityUnits: 0,
        systemContribution: workspace.operational_contribution || 0,
      };
      current.activityUnits += entry.activity_count || 0;
      alignmentAccumulator.set(workspace.id, current);
    });

    const perWorkspaceAlignments = Array.from(alignmentAccumulator.values())
      .map(item => {
        const associateAdjustment = (selectedAssociate.role === 'associate' || selectedAssociate.role === 'hybrid')
          ? item.activityUnits * (selectedAssociate.allocation_factor || 0)
          : 0;
        const overheadAdjustment = (selectedAssociate.role === 'channel' || selectedAssociate.role === 'hybrid')
          ? item.systemContribution * ((selectedAssociate.overhead_weight || 0) / 100)
          : 0;
        return {
          ...item,
          associateAdjustment,
          overheadAdjustment,
          totalAdjustment: associateAdjustment + overheadAdjustment,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    const totalActivity = perWorkspaceAlignments.reduce((sum, item) => sum + item.activityUnits, 0);
    const totalContribution = perWorkspaceAlignments.reduce((sum, item) => sum + item.systemContribution, 0);

    return {
      attributedUnits: attributedUnitIds.size,
      attributedActivity: totalActivity,
      attributedContribution: totalContribution,
      perWorkspaceAlignments,
      summary: {
        totalAssociateAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.associateAdjustment, 0),
        totalOverheadAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.overheadAdjustment, 0),
        totalOverallAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.totalAdjustment, 0),
      },
      attributedActivityCount: totalActivity,
      attributedContributionTotal: totalContribution,
      totalAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.totalAdjustment, 0),
    };
  }, [selectedAssociate, units, entries, workspaces, alignmentStartDate, alignmentEndDate]);

  const allAssociateMetrics = useMemo(() => {
    const metricsMap = new Map<string, { units: number; activity: number; contribution: number }>();
    
    associates.forEach(associate => {
      const unitIds = new Set(
        units
          .filter(u => u.attributed_associate_id === associate.id)
          .map(u => u.id)
      );
      
      let activityCount = 0;
      let contributionSum = 0;
      
      entries.forEach(entry => {
        if (!unitIds.has(entry.unit_id)) return;
        activityCount += entry.activity_count || 0;
        const workspace = workspaces.find(w => w.id === entry.workspace_id);
        if (workspace?.operational_contribution) {
          contributionSum += workspace.operational_contribution;
        }
      });
      
      metricsMap.set(associate.id, {
        units: unitIds.size,
        activity: activityCount,
        contribution: contributionSum
      });
    });
    
    return metricsMap;
  }, [associates, units, entries, workspaces]);

  const handleSaveAssociateRules = async () => {
    if (!selectedAssociate || !canManageValue) return;
    try {
      await updateAssociate({
        ...selectedAssociate,
        allocation_factor: parseNonNegativeNumber(editAssociateAllocationFactor),
        overhead_weight: parseNonNegativeNumber(editAssociateOverheadWeight),
      });
      notify({ type: 'success', message: 'Associate configuration updated.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to update associate configuration.' });
    }
  };

  const handleRecordEstimatedAdjustment = async () => {
    if (!selectedAssociate || !canManageValue) return;
    if (alignmentStartDate && alignmentEndDate && alignmentStartDate > alignmentEndDate) {
      notify({ type: 'error', message: 'The defined alignment date range is invalid.' });
      return;
    }
    const estimatedAmount = selectedAssociateMetrics.totalAdjustment;
    if (estimatedAmount <= 0) {
      notify({ type: 'error', message: 'No pending activity found within this range.' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    try {
      await addAssociateAllocation({
        attributed_associate_id: selectedAssociate.id,
        type: 'adjustment',
        amount: estimatedAmount,
        date: today,
      });
      notify({ type: 'success', message: 'Operational adjustment calculated and logged.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to calculate operational adjustment.' });
    }
  };

  const handleArchiveAllocationsByDateRange = () => {
    if (!canManageValue || !selectedAssociateId) return;
    if (!entryDateStart || !entryDateEnd) {
      notify({ type: 'error', message: 'Please select both start and end date boundaries.' });
      return;
    }
    if (entryDateStart > entryDateEnd) {
      notify({ type: 'error', message: 'Boundary start date cannot exceed end date.' });
      return;
    }

    const targetedIds = activeSelectedAllocations
      .filter(alloc => alloc.date >= entryDateStart && alloc.date <= entryDateEnd)
      .map(alloc => alloc.id);

    if (targetedIds.length === 0) {
      notify({ type: 'error', message: 'No active allocations matching this criteria.' });
      return;
    }

    setArchivedAssociateAllocationIds(current => Array.from(new Set([...current, ...targetedIds])));
    void (recordSystemEvent as any)({ 
      action: 'associate_allocations_archived_range',
      entity: 'associate_allocation',
      amount: targetedIds.length,
      details: `Filtered hidden allocations from ${entryDateStart} to ${entryDateEnd}`,
    });
    notify({ type: 'success', message: `Moved ${targetedIds.length} allocations to hidden repository.` });
  };

  const handleArchiveOldAllocations = () => {
    if (!canManageValue) return;
    if (oldAssociateAllocationIds.length === 0) {
      notify({ type: 'error', message: `No allocations found older than ${retentionDaysNumber} days.` });
      return;
    }
    setArchivedAssociateAllocationIds(current => Array.from(new Set([...current, ...oldAssociateAllocationIds])));
    void (recordSystemEvent as any)({ 
      action: 'associate_allocations_archived_legacy',
      entity: 'associate_allocation',
      amount: oldAssociateAllocationIds.length,
      details: `Moved legacy allocations (> ${retentionDaysNumber} days) to hidden repository`,
    });
    notify({ type: 'success', message: `Archived ${oldAssociateAllocationIds.length} legacy allocations.` });
  };

  const handleRestoreAllArchivedAllocations = () => {
    if (!canManageValue || !selectedAssociateId) return;
    const targets = archivedSelectedAllocations.map(alloc => alloc.id);
    if (targets.length === 0) {
      notify({ type: 'error', message: 'No hidden allocations available to restore for this associate.' });
      return;
    }

    setArchivedAssociateAllocationIds(current => current.filter(id => !targets.includes(id)));
    void (recordSystemEvent as any)({ 
      action: 'associate_allocations_restored_bulk',
      entity: 'associate_allocation',
      amount: targets.length,
      details: 'Restored all hidden allocations for selected associate',
    });
    notify({ type: 'success', message: `Restored ${targets.length} hidden allocations.` });
  };

  return (
    <div className="page-shell animate-in fade-in">
      {!canManageValue && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 px-4 py-2 text-sm">
          Read-only mode: only admin/operator can create associates or log allocations.
        </div>
      )}
      {!embedded ? (
        <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">Collaborations</h2>
            <p className="text-stone-500 dark:text-stone-400 text-sm">Associate network, configuration, and activity logs.</p>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                Associates: <span className="font-mono text-stone-900 dark:text-stone-100">{associates.length}</span>
              </span>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                Allocations: <span className="font-mono text-stone-900 dark:text-stone-100">{associateAllocations.length}</span>
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsAdding(true)}
                disabled={!canManageValue}
                className="action-btn-primary"
              >
                <Plus size={16} />
                Add Associate
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setIsAdding(true)}
            disabled={!canManageValue}
            className="action-btn-primary"
          >
            <Plus size={16} />
            Add Associate
          </button>
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleAddAssociate} className="section-card p-6 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">New Associate</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <input 
              className="control-input" 
              placeholder="Name (optional)" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              disabled={!canManageValue}
            />
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Type</label>
              <select 
                className="control-input"
                value={role}
                onChange={e => setRole(e.target.value as 'associate' | 'channel' | 'hybrid')}
                disabled={!canManageValue}
              >
                <option value="channel">Channel</option>
                <option value="associate">Associate</option>
                <option value="hybrid">Hybrid</option>
              </select>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Defines how this associate participates in activities.</p>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 p-4 mb-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Associate Rules (optional)</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">Define allocation parameters for this associate.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Allocation Factor / Unit</label>
                <input
                  className="control-input"
                  type="number"
                  step="0.01"
                  value={newAssociateAllocationFactor}
                  onChange={e => setNewAssociateAllocationFactor(e.target.value)}
                  disabled={!canManageValue}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Overhead Weight %</label>
                <input
                  className="control-input"
                  type="number"
                  step="0.1"
                  value={newAssociateOverheadWeight}
                  onChange={e => setNewAssociateOverheadWeight(e.target.value)}
                  disabled={!canManageValue}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button 
              type="button" 
              onClick={() => setIsAdding(false)}
              className="action-btn-tertiary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={!canManageValue}
              className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-md text-sm hover:bg-stone-800 dark:hover:bg-stone-200"
            >
              Save Associate
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Associate List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="section-card p-4">
            <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100">Directory</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">Search associates from the list below.</p>
          </div>
          {activeAssociates.map(associate => (
            <div 
              key={associate.id}
              onClick={() => setSelectedAssociateId(associate.id)}
              className={cn(
                "section-card-hover p-4 cursor-pointer",
                selectedAssociateId === associate.id 
                  ? "border-emerald-500 ring-1 ring-emerald-500" 
                  : ""
              )}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-stone-900 dark:text-stone-100">{getAssociateDisplayName(associate.name)}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 capitalize">
                      {getAssociateRoleLabel(associate.role)}
                    </span>
                  </div>
                  <div className="text-xs text-stone-400 mt-1">
                    {units.filter(p => p.attributed_associate_id === associate.id).length} Linked Participants
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider">Total</p>
                  <p className={cn(
                    "font-mono font-medium",
                    associate.total_number > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                    associate.total_number < 0 ? "text-red-600 dark:text-red-400" : "text-stone-400"
                  )}>
                    {formatValue(associate.total_number)}
                  </p>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (canManageValue) void handleArchiveAssociate(associate.id);
                      }}
                      disabled={!canManageValue}
                      className="action-btn-tertiary px-2 py-1 text-[11px] disabled:opacity-50"
                    >
                      Hide
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (canManageValue) void handleDeleteAssociate(associate.id);
                      }}
                      disabled={!canManageValue || deletingAssociateId === associate.id}
                      className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={deletingAssociateId === associate.id ? 'Removing…' : 'Remove Associate'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {activeAssociates.length === 0 && (
            <div className="text-center py-12 text-stone-400 bg-stone-50 dark:bg-stone-900 rounded-xl border border-dashed border-stone-200 dark:border-stone-800">
              No associates found.
            </div>
          )}

          {archivedAssociates.length > 0 && (
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Hidden Associates</h4>
                <button
                  type="button"
                  onClick={() => setIsArchivedAssociateListExpanded(prev => !prev)}
                  className="action-btn-secondary px-2.5 py-1 text-xs"
                >
                  {isArchivedAssociateListExpanded ? 'Hide' : `Show (${archivedAssociates.length})`}
                </button>
              </div>

              {isArchivedAssociateListExpanded && (
                <div className="mt-3 space-y-3">
                  {archivedAssociates.map(associate => (
                    <div
                      key={associate.id}
                      className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <h3 className="font-medium text-stone-900 dark:text-stone-100">{getAssociateDisplayName(associate.name)}</h3>
                          <p className="text-xs text-stone-500 dark:text-stone-400">{getAssociateRoleLabel(associate.role)} • hidden</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-0.5">Summary</p>
                          <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                            {allAssociateMetrics.get(associate.id)?.units || 0} units • {allAssociateMetrics.get(associate.id)?.activity || 0} units • {formatValue(allAssociateMetrics.get(associate.id)?.contribution || 0)}
                          </p>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => { if (canManageValue) void handleUnarchiveAssociate(associate.id); }}
                              disabled={!canManageValue}
                              className="action-btn-tertiary px-2 py-1 text-[11px] disabled:opacity-50"
                            >
                              Unhide
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (canManageValue) void handleDeleteAssociate(associate.id);
                              }}
                              disabled={!canManageValue || deletingAssociateId === associate.id}
                              className="action-btn-tertiary px-2 py-1 text-[11px] text-red-600 dark:text-red-400 disabled:opacity-50"
                            >
                              {deletingAssociateId === associate.id ? 'Removing…' : 'Remove'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail View */}
        <div className="lg:col-span-2">
          {selectedAssociate ? (
            <div className="section-card h-full flex flex-col">
              <div className="p-6 border-b border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-light text-stone-900 dark:text-stone-100">{getAssociateDisplayName(selectedAssociate.name)}</h2>
                  <p className="text-sm text-stone-500 dark:text-stone-400">{getAssociateRoleLabel(selectedAssociate.role)} • {selectedAssociate.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-stone-500 dark:text-stone-400">Current Total Balance</p>
                  <p className={cn(
                    "text-2xl font-light",
                    selectedAssociate.total_number > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                    selectedAssociate.total_number < 0 ? "text-red-600 dark:text-red-400" : "text-stone-900 dark:text-stone-100"
                  )}>
                    {formatValue(selectedAssociate.total_number)}
                  </p>
                  <p className="text-xs text-stone-400">
                    {selectedAssociate.total_number > 0 ? "Net toward system" : selectedAssociate.total_number < 0 ? "Net toward associate" : "Aligned"}
                  </p>
                </div>
              </div>

              <div className="p-6 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 space-y-3">
                <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100">Configuration Parameters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Allocation Factor / Unit</label>
                    <input
                      className="control-input"
                      type="number"
                      step="0.01"
                      value={editAssociateAllocationFactor}
                      onChange={e => setEditAssociateAllocationFactor(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Overhead Weight %</label>
                    <input
                      className="control-input"
                      type="number"
                      step="0.1"
                      value={editAssociateOverheadWeight}
                      onChange={e => setEditAssociateOverheadWeight(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-stone-500 dark:text-stone-400">Alignment Start Bound</label>
                    <input
                      type="date"
                      className="control-input"
                      value={alignmentStartDate}
                      onChange={e => setAlignmentStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-stone-500 dark:text-stone-400">Alignment End Bound</label>
                    <input
                      type="date"
                      className="control-input"
                      value={alignmentEndDate}
                      onChange={e => setAlignmentEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2">
                    <p className="text-stone-500 dark:text-stone-400">Activity Unit Volume</p>
                    <p className="font-mono text-stone-900 dark:text-stone-100">{selectedAssociateMetrics.attributedActivityCount}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2">
                    <p className="text-stone-500 dark:text-stone-400">Cumulative Contribution</p>
                    <p className="font-mono text-stone-900 dark:text-stone-100">{formatValue(selectedAssociateMetrics.attributedContributionTotal)}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2">
                    <p className="text-stone-500 dark:text-stone-400">Calculated Adjustment</p>
                    <p className="font-mono text-stone-900 dark:text-stone-100">{formatValue(selectedAssociateMetrics.totalAdjustment)}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
                  <div className="px-3 py-2 border-b border-stone-200 dark:border-stone-700 text-xs text-stone-500 dark:text-stone-400">
                    Segmented participation alignment in selected range
                  </div>
                  <CollapsibleWorkspaceSection
                    title="Segmented Participation Alignment"
                    summary={`${selectedAssociateMetrics.perWorkspaceAlignments.length} segments`}
                    defaultExpanded={false}
                    maxExpandedHeightClass="max-h-52"
                    maxCollapsedHeightClass="max-h-[96px]"
                  >
                    <table className="w-full text-left text-[12px]">
                      <thead className="sticky top-0 bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">Segment Date</th>
                          <th className="px-3 py-2 font-medium">Segment Node</th>
                          <th className="px-3 py-2 font-medium text-right">Unit Volume</th>
                          <th className="px-3 py-2 font-medium text-right">Contribution Sum</th>
                          <th className="px-3 py-2 font-medium text-right">Net Adjustment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                        {selectedAssociateMetrics.perWorkspaceAlignments.map(item => (
                          <tr key={item.workspaceId}>
                            <td className="px-3 py-2 text-stone-600 dark:text-stone-300">{formatDate(item.date)}</td>
                            <td className="px-3 py-2 text-stone-600 dark:text-stone-300">{item.channel}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{item.activityUnits}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(item.systemContribution)}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(item.totalAdjustment)}</td>
                          </tr>
                        ))}
                        {selectedAssociateMetrics.perWorkspaceAlignments.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-stone-400">No activity segments captured in this range.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CollapsibleWorkspaceSection>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { void handleSaveAssociateRules(); }}
                    disabled={!canManageValue}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    Synchronize Rules
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleRecordEstimatedAdjustment(); }}
                    disabled={!canManageValue}
                    className="action-btn-primary text-xs disabled:opacity-50"
                  >
                    Commit Estimated Adjustment
                  </button>
                </div>
              </div>

              <div className="p-6 bg-stone-50 dark:bg-stone-800/50 border-b border-stone-200 dark:border-stone-800">
                <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-3">Commit New Allocation</h3>
                <form onSubmit={handleAddAllocation} className="flex flex-col sm:flex-row gap-2">
                  <select 
                    className="control-input text-sm"
                    value={transType}
                    onChange={e => setTransType(e.target.value as 'input' | 'output' | 'alignment' | 'adjustment')}
                    disabled={!canManageValue}
                  >
                    <option value="input">Input (Source &rarr; System)</option>
                    <option value="alignment">Alignment</option>
                    <option value="output">Output (System &rarr; Node)</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                  <input 
                    type="number" 
                    placeholder="Volume Amount" 
                    className="control-input text-sm w-32"
                    value={transAmount}
                    onChange={e => setTransAmount(e.target.value)}
                    disabled={!canManageValue}
                    required
                  />

                  <button type="submit" disabled={!canManageValue} className="action-btn-primary text-sm disabled:opacity-50">
                    Commit Allocation
                  </button>
                </form>
              </div>

              <div className="p-6 border-b border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/40 space-y-3">
                <h4 className="text-sm font-medium text-stone-900 dark:text-stone-100">Allocation Visibility Controls</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    className="control-input"
                    placeholder="Search allocation logs..."
                    value={allocationSearchQuery}
                    onChange={event => setAllocationSearchQuery(event.target.value)}
                  />
                  <select
                    className="control-input"
                    value={allocationTypeFilter}
                    onChange={event => setAllocationTypeFilter(event.target.value as typeof allocationTypeFilter)}
                  >
                    <option value="all">All flow types</option>
                    <option value="input">Input</option>
                    <option value="alignment">Alignment</option>
                    <option value="output">Output</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="date" className="control-input" value={entryDateStart} onChange={event => setEntryDateStart(event.target.value)} />
                  <input type="date" className="control-input" value={entryDateEnd} onChange={event => setEntryDateEnd(event.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleArchiveAllocationsByDateRange}
                    disabled={!canManageValue || !selectedAssociateId}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    Hide by Date Range
                  </button>
                  <button
                    type="button"
                    onClick={handleArchiveOldAllocations}
                    disabled={!canManageValue}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    Hide Legacy ({retentionDaysNumber}+d)
                  </button>
                  <button
                    type="button"
                    onClick={handleRestoreAllArchivedAllocations}
                    disabled={!canManageValue || archivedSelectedAllocations.length === 0}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    Restore All Hidden
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center">
                  <input
                    type="number"
                    min="1"
                    className="control-input"
                    value={retentionDays}
                    onChange={event => setRetentionDays(event.target.value)}
                    placeholder="Retention days"
                  />
                  <button
                    type="button"
                    onClick={() => setAutoArchiveEnabled(value => !value)}
                    disabled={!canManageValue}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    {autoArchiveEnabled ? 'Auto-Hide: Enabled' : 'Auto-Hide: Disabled'}
                  </button>
                  <span className="text-xs text-stone-500 dark:text-stone-400">Targeting older than {retentionDaysNumber} days</span>
                </div>
              </div>

              {/* Tabs for Allocations vs Units */}
              <div className="border-b border-stone-200 dark:border-stone-800 px-6">
                <div className="flex gap-4">
                  <button 
                    onClick={() => setActiveTab('allocations')}
                    className={cn(
                      "py-3 text-sm font-medium border-b-2 transition-colors",
                      activeTab === 'allocations' ? "border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100" : "border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700"
                    )}
                  >
                    Allocations
                  </button>
                  <button 
                    onClick={() => setActiveTab('units')}
                    className={cn(
                      "py-3 text-sm font-medium border-b-2 transition-colors",
                      activeTab === 'units' ? "border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100" : "border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700"
                    )}
                  >
                    Linked Participants
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-0">
                {activeTab === 'allocations' ? (
                  <>
                    <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
                    {filteredActiveSelectedAllocations.map(t => (
                      <MobileRecordCard
                        key={t.id}
                        title={<span className="text-xs text-stone-500 dark:text-stone-400 font-normal">{formatDate(t.date)}</span>}
                        right={(
                          <p className={cn(
                            "font-mono text-sm font-medium",
                            t.type === 'input' ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                          )}>
                            {t.type === 'input' ? '+' : '-'}{formatValue(t.amount)}
                          </p>
                        )}
                        meta={<span className="capitalize">{t.type}</span>}
                      >
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleArchiveAssociateAllocation(t.id)}
                            disabled={!canManageValue}
                            className="action-btn-tertiary px-2.5 py-1 text-xs disabled:opacity-50"
                          >
                            Hide
                          </button>
                          <button
                            type="button"
                            onClick={() => { if (canManageValue) void handleDeleteAssociateAllocation(t.id); }}
                            disabled={!canManageValue || deletingAssociateAllocationId === t.id}
                            className="action-btn-tertiary px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                          >
                            {deletingAssociateAllocationId === t.id ? 'Removing…' : 'Remove'}
                          </button>
                        </div>
                      </MobileRecordCard>
                    ))}
                    {filteredActiveSelectedAllocations.length === 0 && (
                      <div className="px-6 py-10 text-center text-stone-400 text-sm">No allocations recorded.</div>
                    )}
                    </div>

                    {archivedSelectedAllocations.length > 0 && (
                      <div className="mt-4 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/40 p-3 md:hidden">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Hidden Allocations</h4>
                        <button
                          type="button"
                          onClick={() => setIsArchivedAssociateAllocationsExpanded(prev => !prev)}
                          className="action-btn-secondary px-2.5 py-1 text-xs"
                        >
                          {isArchivedAssociateAllocationsExpanded ? 'Hide' : `Show (${filteredArchivedSelectedAllocations.length})`}
                        </button>
                      </div>
                      {isArchivedAssociateAllocationsExpanded && (
                        <div className="mt-3 divide-y divide-stone-100 dark:divide-stone-800">
                          {filteredArchivedSelectedAllocations.map(t => (
                            <MobileRecordCard
                              key={t.id}
                              title={<span className="text-xs text-stone-500 dark:text-stone-400 font-normal">{formatDate(t.date)}</span>}
                              right={<p className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">{formatValue(t.amount)}</p>}
                              meta={<span className="capitalize">{t.type}</span>}
                            >
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleUnarchiveAssociateAllocation(t.id)}
                                  disabled={!canManageValue}
                                  className="action-btn-tertiary px-2.5 py-1 text-xs disabled:opacity-50"
                                >
                                  Unhide
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { if (canManageValue) void handleDeleteAssociateAllocation(t.id); }}
                                  disabled={!canManageValue || deletingAssociateAllocationId === t.id}
                                  className="action-btn-tertiary px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                                >
                                  {deletingAssociateAllocationId === t.id ? 'Removing…' : 'Remove'}
                                </button>
                              </div>
                            </MobileRecordCard>
                          ))}
                        </div>
                      )}
                      </div>
                    )}

                    <CollapsibleWorkspaceSection
                      title="Allocation Repository"
                      summary={`${filteredActiveSelectedAllocations.length} items`}
                      className="hidden md:block"
                      defaultExpanded={false}
                      maxExpandedHeightClass="max-h-[420px]"
                      maxCollapsedHeightClass="max-h-[96px]"
                    >
                      <table className="w-full min-w-[760px] workspace-fixed text-left text-[13px]">
                        <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                          <tr>
                            <th className="px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Date</th>
                            <th className="px-6 py-2.5 w-[170px] text-[11px] font-semibold uppercase tracking-wide">Flow Type</th>
                            <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Amount</th>
                            <th className="px-6 py-2.5 w-[170px] text-right text-[11px] font-semibold uppercase tracking-wide">Manage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                          {filteredActiveSelectedAllocations.map(t => (
                            <tr key={t.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors">
                              <td className="px-6 py-2.5 text-stone-500 dark:text-stone-400">{formatDate(t.date)}</td>
                              <td className="px-6 py-2.5 capitalize">{t.type}</td>
                              <td className={cn(
                                "px-6 py-2.5 text-right font-mono",
                                t.type === 'input' ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                              )}>
                                {t.type === 'input' ? '+' : '-'}{formatValue(t.amount)}
                              </td>
                              <td className="px-6 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleArchiveAssociateAllocation(t.id)}
                                  disabled={!canManageValue}
                                  className="action-btn-tertiary px-2 py-1 text-[11px] mr-1.5 disabled:opacity-50"
                                >
                                  Hide
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { if (canManageValue) void handleDeleteAssociateAllocation(t.id); }}
                                  disabled={!canManageValue || deletingAssociateAllocationId === t.id}
                                  className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={deletingAssociateAllocationId === t.id ? 'Removing…' : 'Remove Allocation'}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filteredActiveSelectedAllocations.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-stone-400">
                                No active allocation logs.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </CollapsibleWorkspaceSection>

                    {archivedSelectedAllocations.length > 0 && (
                      <div className="hidden md:block mt-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <h4 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Hidden Logs</h4>
                          <button
                            type="button"
                            onClick={() => setIsArchivedAssociateAllocationsExpanded(prev => !prev)}
                            className="action-btn-secondary text-xs px-2.5 py-1.5"
                          >
                            {isArchivedAssociateAllocationsExpanded ? 'Hide' : `Show (${filteredArchivedSelectedAllocations.length})`}
                          </button>
                        </div>
                        {isArchivedAssociateAllocationsExpanded && (
                          <CollapsibleWorkspaceSection
                            title="Hidden Operational Logs"
                            summary={`${filteredArchivedSelectedAllocations.length} items`}
                            defaultExpanded={false}
                            maxExpandedHeightClass="max-h-[420px]"
                            maxCollapsedHeightClass="max-h-[96px]"
                          >
                            <table className="w-full min-w-[760px] workspace-fixed text-left text-[13px]">
                              <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                                <tr>
                                  <th className="px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Date</th>
                                  <th className="px-6 py-2.5 w-[170px] text-[11px] font-semibold uppercase tracking-wide">Type</th>
                                  <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Amount</th>
                                  <th className="px-6 py-2.5 w-[170px] text-right text-[11px] font-semibold uppercase tracking-wide">Manage</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                                {filteredArchivedSelectedAllocations.map(t => (
                                  <tr key={t.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors">
                                    <td className="px-6 py-2.5 text-stone-500 dark:text-stone-400">{formatDate(t.date)}</td>
                                    <td className="px-6 py-2.5 capitalize">{t.type}</td>
                                    <td className="px-6 py-2.5 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(t.amount)}</td>
                                    <td className="px-6 py-2.5 text-right">
                                      <button
                                        type="button"
                                        onClick={() => handleUnarchiveAssociateAllocation(t.id)}
                                        disabled={!canManageValue}
                                        className="action-btn-tertiary px-2 py-1 text-[11px] mr-1.5 disabled:opacity-50"
                                      >
                                        Unhide
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { if (canManageValue) void handleDeleteAssociateAllocation(t.id); }}
                                        disabled={!canManageValue || deletingAssociateAllocationId === t.id}
                                        className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={deletingAssociateAllocationId === t.id ? 'Removing…' : 'Remove Log'}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {filteredArchivedSelectedAllocations.length === 0 && (
                                  <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-stone-400">No hidden logs match current filters.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </CollapsibleWorkspaceSection>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
                      {selectedAssociateUnits.map(unit => {
                        const unitActivityCount = entries.filter(entry => entry.unit_id === unit.id).length;
                        const lastWorkspaceDate = entries
                          .filter(entry => entry.unit_id === unit.id)
                          .map(entry => workspaces.find(workspace => workspace.id === entry.workspace_id)?.date)
                          .filter((date): date is string => Boolean(date))
                          .sort((a, b) => b.localeCompare(a))[0];

                        return (
                          <MobileRecordCard
                            key={unit.id}
                            title={unit.name}
                            right={<span className="font-mono text-sm text-stone-900 dark:text-stone-100">{formatValue(unit.total || 0)}</span>}
                            meta={<span>{unitActivityCount} activities • {lastWorkspaceDate ? formatDate(lastWorkspaceDate) : 'No activity yet'}</span>}
                          >
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500 dark:text-stone-400">
                              <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-1">Participant ID: {unit.id.slice(0, 8)}</span>
                              <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-1">Linked to {getAssociateDisplayName(selectedAssociate.name)}</span>
                            </div>
                          </MobileRecordCard>
                        );
                      })}
                      {selectedAssociateUnits.length === 0 && (
                        <div className="px-6 py-10 text-center text-stone-400 text-sm">No participants are linked to this associate.</div>
                      )}
                    </div>

                    <CollapsibleWorkspaceSection
                      title="Participant Repository"
                      summary={`${selectedAssociateUnits.length} linked`}
                      className="hidden md:block"
                      defaultExpanded={false}
                      maxExpandedHeightClass="max-h-[420px]"
                      maxCollapsedHeightClass="max-h-[96px]"
                    >
                      <table className="w-full min-w-[760px] workspace-fixed text-left text-[13px]">
                        <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                          <tr>
                            <th className="px-6 py-2.5 w-[260px] text-[11px] font-semibold uppercase tracking-wide">Participant</th>
                            <th className="px-6 py-2.5 w-[150px] text-[11px] font-semibold uppercase tracking-wide">Identifier</th>
                            <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Balance</th>
                            <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Activity Count</th>
                            <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Last Activity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                          {selectedAssociateUnits.map(unit => {
                            const unitEntries = entries.filter(entry => entry.unit_id === unit.id);
                            const lastWorkspaceDate = unitEntries
                              .map(entry => workspaces.find(workspace => workspace.id === entry.workspace_id)?.date)
                              .filter((date): date is string => Boolean(date))
                              .sort((a, b) => b.localeCompare(a))[0];

                            return (
                              <tr key={unit.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors">
                                <td className="px-6 py-2.5 text-stone-900 dark:text-stone-100">{unit.name}</td>
                                <td className="px-6 py-2.5 font-mono text-stone-500 dark:text-stone-400">{unit.id.slice(0, 8)}</td>
                                <td className="px-6 py-2.5 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(unit.total || 0)}</td>
                                <td className="px-6 py-2.5 text-right font-mono text-stone-900 dark:text-stone-100">{unitEntries.length}</td>
                                <td className="px-6 py-2.5 text-right text-stone-500 dark:text-stone-400">{lastWorkspaceDate ? formatDate(lastWorkspaceDate) : 'No activity yet'}</td>
                              </tr>
                            );
                          })}
                          {selectedAssociateUnits.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-6 py-12 text-center text-stone-400">No participants are linked to this associate.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </CollapsibleWorkspaceSection>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-stone-400 bg-stone-50 dark:bg-stone-900 rounded-xl border border-dashed border-stone-200 dark:border-stone-800">
              Select an associate to view node details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssociatesPage;
