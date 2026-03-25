import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Calendar, Filter, Archive, RotateCcw, Activity as ActivityIcon, Handshake, Search, UserPlus, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { useNotification } from '../context/NotificationContext';
import { Entity, Collaboration, CollaborationAllocation, ActivityRecord, Activity } from '../types';
import { formatValue, formatDate, parseNonNegativeNumber } from '../lib/utils';
import { cn } from '../lib/utils';
import CollapsibleActivitySection from '../components/CollapsibleActivitySection';
import MobileActivityRecordCard from '../components/MobileActivityRecordCard';
import EmptyState from '../components/EmptyState';

const getCollaborationRoleLabel = (role: string) => {
  switch (role) {
    case 'collaboration': return 'Collaboration Profile';
    case 'channel': return 'Operational Node';
    case 'hybrid': return 'Interconnected Hub';
    default: return 'Defined Entity';
  }
};

const getCollaborationDisplayName = (name?: string) => name || 'Unnamed Collaboration';

export default function CollaborationNetwork({ embedded = false }: { embedded?: boolean }) {
  const { notify } = useNotification();
  const { role: appRole, canManageImpact } = useAppRole();
  // Canonical DataContext properties
  const {
    collaborations: rawCollaborations,
    entities: rawEntities,
    recordsByEntityId,
    recordsByActivityId,
    records: rawRecords,
    activities: rawActivities,
  } = useData();
  const collaborations = rawCollaborations ?? [];
  const entities = rawEntities ?? [];
  const records = rawRecords ?? [];
  const activities = rawActivities ?? [];

  // Removed APIs — stubbed until CollaborationNetwork is fully migrated
  const collaborationParticipations: any[] = [];
  const addCollaboration = async (_data: any) => '';
  const deleteCollaboration = async (_id: string) => {};
  const updateCollaboration = async (_data: any) => {};
  const addCollaborationParticipation = async (_data: any) => {};
  const deleteCollaborationParticipation = async (_id: string) => {};
  const recordSystemEvent = async (_data: any) => {};

  const [selectedCollaborationId, setSelectedCollaborationId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'collaboration' | 'channel' | 'hybrid'>('channel');
  const [newParticipationFactor, setNewParticipationFactor] = useState('0');
  const [newCollaborationOverheadWeight, setNewCollaborationOverheadWeight] = useState('0');
  
  const [transType, setTransType] = useState<'input' | 'output' | 'alignment' | 'adjustment'>('adjustment');
  const [transAmount, setTransAmount] = useState('');
  
  const [participationSearchQuery, setParticipationSearchQuery] = useState('');
  const [participationTypeFilter, setParticipationTypeFilter] = useState<'all' | 'input' | 'output' | 'alignment' | 'adjustment'>('all');
  const [recordDateStart, setRecordDateStart] = useState('');
  const [recordDateEnd, setRecordDateEnd] = useState('');
  const [retentionDays, setRetentionDays] = useState('90');
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(false);
  
  const [archivedCollaborationParticipationIds, setArchivedCollaborationParticipationIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem('collaborations.archived_participation_ids');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const [isArchivedParticipationHistoryExpanded, setIsArchivedParticipationHistoryExpanded] = useState(false);
  const [isArchivedCollaborationListExpanded, setIsArchivedCollaborationListExpanded] = useState(false);
  const [deletingCollaborationId, setDeletingCollaborationId] = useState<string | null>(null);
  const [deletingParticipationId, setDeletingParticipationId] = useState<string | null>(null);

  const [editParticipationFactor, setEditParticipationFactor] = useState('0');
  const [editCollaborationOverheadWeight, setEditCollaborationOverheadWeight] = useState('0');
  const [activeTab, setActiveTab] = useState<'participations' | 'entities'>('participations');

  const [alignmentStartDate, setAlignmentStartDate] = useState('');
  const [alignmentEndDate, setAlignmentEndDate] = useState('');

  const handleAddCollaboration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageImpact) return;
    try {
      await addCollaboration({
        name,
        role: role as any,
        allocation_factor: parseNonNegativeNumber(newParticipationFactor),
        overhead_weight: parseNonNegativeNumber(newCollaborationOverheadWeight),
        total_number: 0,
        status: 'active'
      });
      setIsAdding(false);
      setName('');
      setNewParticipationFactor('0');
      setNewCollaborationOverheadWeight('0');
      notify({ type: 'success', message: 'Collaboration profile established.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to establish collaboration.' });
    }
  };

  const handleAddParticipation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageImpact || !selectedCollaborationId || !transAmount) return;
    const today = new Date().toISOString().split('T')[0];

    try {
      await addCollaborationParticipation({
        collaboration_id: selectedCollaborationId,
        type: transType as any,
        amount: parseFloat(transAmount),
        date: today
      });
      setTransAmount('');
      notify({ type: 'success', message: 'Operational participation recorded.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to record participation.' });
    }
  };

  const handleDeleteCollaboration = async (collaborationId: string) => {
    if (!canManageImpact || deletingCollaborationId === collaborationId) return;
    const confirmed = window.confirm('Remove this collaboration? This is only allowed when no dependency links remain.');
    if (!confirmed) return;

    try {
      setDeletingCollaborationId(collaborationId);
      await deleteCollaboration(collaborationId);
      if (selectedCollaborationId === collaborationId) {
        setSelectedCollaborationId(null);
      }
      notify({ type: 'success', message: 'Collaboration removed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to remove collaboration.' });
    } finally {
      setDeletingCollaborationId((current: string | null) => (current === collaborationId ? null : current));
    }
  };

  const handleArchiveCollaboration = async (collaborationId: string) => {
    if (!canManageImpact) return;
    const collaboration = collaborations.find((item: Collaboration) => item.id === collaborationId);
    if (!collaboration || collaboration.status === 'inactive') return;

    try {
      await updateCollaboration({ ...collaboration, status: 'inactive' });
      if (selectedCollaborationId === collaborationId) {
        setSelectedCollaborationId(null);
      }
      void (recordSystemEvent as any)({ 
        action: 'collaboration_archived',
        entity: 'collaboration',
        entity_id: collaborationId,
        details: `Collaboration ${getCollaborationDisplayName(collaboration.name)} moved to hidden`,
      });
      notify({ type: 'success', message: 'Collaboration hidden.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to hide collaboration.' });
    }
  };

  const handleUnarchiveCollaboration = async (collaborationId: string) => {
    if (!canManageImpact) return;
    const collaboration = collaborations.find((item: Collaboration) => item.id === collaborationId);
    if (!collaboration || collaboration.status !== 'inactive') return;

    try {
      await updateCollaboration({ ...collaboration, status: 'active' });
      void (recordSystemEvent as any)({ 
        action: 'collaboration_unarchived',
        entity: 'collaboration',
        entity_id: collaborationId,
        details: `Collaboration ${getCollaborationDisplayName(collaboration.name)} restored`,
      });
      notify({ type: 'success', message: 'Collaboration restored.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to restore collaboration.' });
    }
  };

  const handleDeleteParticipation = async (participationId: string) => {
    if (!canManageImpact || deletingParticipationId === participationId) return;
    const confirmed = window.confirm('Remove this participation ActivityRecord? This will reverse its impact.');
    if (!confirmed) return;

    try {
      setDeletingParticipationId(participationId);
      await deleteCollaborationParticipation(participationId);
      notify({ type: 'success', message: 'Participation removed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to remove participation.' });
    } finally {
      setDeletingParticipationId((current: string | null) => (current === participationId ? null : current));
    }
  };

  const handleArchiveParticipation = (participationId: string) => {
    setArchivedCollaborationParticipationIds((current: string[]) => (current.includes(participationId) ? current : [...current, participationId]));
    void (recordSystemEvent as any)({ 
      action: 'collaboration_participation_archived',
      entity: 'collaboration_participation',
      entity_id: participationId,
      details: 'Participation moved to hidden repository',
    });
    notify({ type: 'success', message: 'Participation hidden.' });
  };

  const handleUnarchiveParticipation = (participationId: string) => {
    setArchivedCollaborationParticipationIds((current: string[]) => current.filter((item: string) => item !== participationId));
    void (recordSystemEvent as any)({ 
      action: 'collaboration_participation_unarchived',
      entity: 'collaboration_participation',
      entity_id: participationId,
      details: 'Participation restored to active set',
    });
    notify({ type: 'success', message: 'Participation restored.' });
  };

  const selectedCollaboration = collaborations.find((a: Collaboration) => a.id === selectedCollaborationId);
  
  const selectedCollaborationEntitys = useMemo(
    () => entities
      .filter((entity: Entity) => entity.collaboration_id === selectedCollaborationId)
      .sort((a, b) => (b.total || 0) - (a.total || 0)),
    [entities, selectedCollaborationId]
  );

  const selectedParticipations = collaborationParticipations.filter((p: CollaborationAllocation) => p.collaboration_id === selectedCollaborationId);
  const archivedCollaborationParticipationIdSet = useMemo(() => new Set(archivedCollaborationParticipationIds), [archivedCollaborationParticipationIds]);
  
  const activeSelectedParticipations = useMemo(
    () => selectedParticipations.filter((participation: CollaborationAllocation) => !archivedCollaborationParticipationIdSet.has(participation.id)),
    [selectedParticipations, archivedCollaborationParticipationIdSet]
  );
  
  const archivedSelectedParticipations = useMemo(
    () => selectedParticipations.filter((participation: CollaborationAllocation) => archivedCollaborationParticipationIdSet.has(participation.id)),
    [selectedParticipations, archivedCollaborationParticipationIdSet]
  );

  const filteredActiveSelectedParticipations = useMemo(() => {
    let filtered = activeSelectedParticipations;

    if (participationSearchQuery) {
      const q = participationSearchQuery.toLowerCase();
      filtered = filtered.filter((a: CollaborationAllocation) => 
        a.id.toLowerCase().includes(q) || 
        a.amount.toString().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.date.toLowerCase().includes(q)
      );
    }
    
    if (participationTypeFilter !== 'all') {
      filtered = filtered.filter((a: CollaborationAllocation) => a.type === participationTypeFilter);
    }
    if (recordDateStart) filtered = filtered.filter((a: CollaborationAllocation) => a.date >= recordDateStart);
    if (recordDateEnd) filtered = filtered.filter((a: CollaborationAllocation) => a.date <= recordDateEnd);

    return filtered;
  }, [activeSelectedParticipations, participationTypeFilter, recordDateStart, recordDateEnd, participationSearchQuery]);

  const filteredArchivedSelectedParticipations = useMemo(() => {
    let filtered = archivedSelectedParticipations;

    if (participationSearchQuery) {
      const q = participationSearchQuery.toLowerCase();
      filtered = filtered.filter((a: CollaborationAllocation) => 
        a.id.toLowerCase().includes(q) || 
        a.amount.toString().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.date.toLowerCase().includes(q)
      );
    }
    
    if (participationTypeFilter !== 'all') {
      filtered = filtered.filter((a: CollaborationAllocation) => a.type === participationTypeFilter);
    }
    if (recordDateStart) filtered = filtered.filter((a: CollaborationAllocation) => a.date >= recordDateStart);
    if (recordDateEnd) filtered = filtered.filter((a: CollaborationAllocation) => a.date <= recordDateEnd);

    return filtered;
  }, [archivedSelectedParticipations, participationTypeFilter, recordDateStart, recordDateEnd, participationSearchQuery]);

  const retentionDaysNumber = useMemo(() => {
    const parsed = Number(retentionDays);
    if (!Number.isFinite(parsed)) return 90;
    return Math.max(1, Math.floor(parsed));
  }, [retentionDays]);
  const oldCollaborationParticipationIds = useMemo(() => {
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - retentionDaysNumber);
    const thresholdTime = threshold.getTime();
    return collaborationParticipations
      .filter((participation: CollaborationAllocation) => !archivedCollaborationParticipationIdSet.has(participation.id))
      .filter((participation: CollaborationAllocation) => {
        const date = new Date(participation.date);
        return Number.isFinite(date.getTime()) && date.getTime() < thresholdTime;
      })
      .map((participation: CollaborationAllocation) => participation.id);
  }, [collaborationParticipations, archivedCollaborationParticipationIdSet, retentionDaysNumber]);
  const activeCollaborations = useMemo(() => collaborations.filter((collaboration: Collaboration) => collaboration.status !== 'inactive'), [collaborations]);
  const archivedCollaborations = useMemo(() => collaborations.filter((collaboration: Collaboration) => collaboration.status === 'inactive'), [collaborations]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('collaborations.archived_participation_ids', JSON.stringify(archivedCollaborationParticipationIds));
  }, [archivedCollaborationParticipationIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('collaborations.retentionDays', retentionDays);
  }, [retentionDays]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('collaborations.autoArchiveEnabled', autoArchiveEnabled ? 'true' : 'false');
  }, [autoArchiveEnabled]);

  useEffect(() => {
    if (!autoArchiveEnabled || oldCollaborationParticipationIds.length === 0) return;
    setArchivedCollaborationParticipationIds((current: string[]) => {
      const next = new Set(current);
      oldCollaborationParticipationIds.forEach((id: string) => next.add(id));
      if (next.size === current.length) return current;
      void (recordSystemEvent as any)({ 
        action: 'collaboration_participations_auto_archived',
        entity: 'collaboration_participation',
        amount: oldCollaborationParticipationIds.length,
        details: `Auto-hidden participations older than ${retentionDaysNumber} days`,
      });
      return Array.from(next);
    });
  }, [autoArchiveEnabled, oldCollaborationParticipationIds, recordSystemEvent, retentionDaysNumber]);

  useEffect(() => {
    if (!selectedCollaboration) {
      setEditParticipationFactor('0');
      setEditCollaborationOverheadWeight('0');
      setAlignmentStartDate('');
      setAlignmentEndDate('');
      return;
    }

    setEditParticipationFactor((selectedCollaboration.allocation_factor || 0).toString());
    setEditCollaborationOverheadWeight((selectedCollaboration.overhead_weight || 0).toString());

    const attributedEntityIds = new Set(
      entities
        .filter((entity: Entity) => entity.collaboration_id === selectedCollaboration.id)
        .map((entity: Entity) => entity.id)
    );

    const relatedActivityDateSet = new Set<string>();
    attributedEntityIds.forEach(entityId => {
      const entityRecords = recordsByEntityId[entityId] || [];
      entityRecords.forEach(record => {
        const activity = activities.find((item: Activity) => item.id === record.activity_id);
        if (activity?.date) relatedActivityDateSet.add(activity.date);
      });
    });

    const sortedDates = Array.from(relatedActivityDateSet).sort();
    if (sortedDates.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      setAlignmentStartDate(today);
      setAlignmentEndDate(today);
      return;
    }

    setAlignmentStartDate(sortedDates[0]);
    setAlignmentEndDate(sortedDates[sortedDates.length - 1]);
  }, [selectedCollaborationId, selectedCollaboration, entities, records, activities]);

  const selectedCollaborationMetrics = useMemo(() => {
    if (!selectedCollaboration) {
      return {
        attributedEntitys: 0,
        attributedActivity: 0,
        attributedContribution: 0,
        perActivityAlignments: [] as Array<{
          activityId: string;
          date: string;
          channel: string;
          activityUnits: number;
          systemContribution: number;
          collaborationAdjustment: number;
          overheadAdjustment: number;
          totalAdjustment: number;
        }>,
        summary: {
          totalCollaborationAdjustment: 0,
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

    const attributedEntityIds = new Set(
      entities
        .filter((entity: Entity) => entity.collaboration_id === selectedCollaboration.id)
        .map((entity: Entity) => entity.id)
    );

    const activityLookup = new Map(activities.map((w: Activity) => [w.id, w]));
    const alignmentAccumulator = new Map<string, { activityId: string; date: string; channel: string; activityUnits: number; systemContribution: number }>();

    attributedEntityIds.forEach(entityId => {
      const entityRecords = recordsByEntityId[entityId] || [];
      entityRecords.forEach(record => {
        const activity = activityLookup.get(record.activity_id);
        if (!activity || !isInDateRange(activity.date)) return;

        const current = alignmentAccumulator.get(activity.id) || {
          activityId: activity.id,
          date: activity.date,
          channel: activity.channel_label || 'Operational Context',
          activityUnits: 0,
          systemContribution: activity.operational_weight || 0,
        };
        current.activityUnits += record.unit_amount || 0;
        alignmentAccumulator.set(activity.id, current);
      });
    });

    const perActivityAlignments = Array.from(alignmentAccumulator.values())
      .map((item: { activityId: string; date: string; channel: string; activityUnits: number; systemContribution: number }) => {
        const collaborationAdjustment = (selectedCollaboration.collaboration_type === 'collaboration' || selectedCollaboration.collaboration_type === 'hybrid')
          ? item.activityUnits * (selectedCollaboration.participation_factor || 0)
          : 0;
        const overheadAdjustment = (selectedCollaboration.collaboration_type === 'channel' || selectedCollaboration.collaboration_type === 'hybrid')
          ? item.systemContribution * ((selectedCollaboration.overhead_weight_pct || 0) / 100)
          : 0;
        return {
          ...item,
          collaborationAdjustment,
          overheadAdjustment,
          totalAdjustment: collaborationAdjustment + overheadAdjustment,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    const totalActivity = perActivityAlignments.reduce((sum, item) => sum + item.activityUnits, 0);
    const totalContribution = perActivityAlignments.reduce((sum, item) => sum + item.systemContribution, 0);

    return {
      attributedEntitys: attributedEntityIds.size,
      attributedActivity: perActivityAlignments.reduce((sum, item) => sum + item.activityUnits, 0),
      attributedContribution: perActivityAlignments.reduce((sum, item) => sum + item.systemContribution, 0),
      perActivityAlignments,
      summary: {
        totalCollaborationAdjustment: perActivityAlignments.reduce((sum, item) => sum + item.collaborationAdjustment, 0),
        totalOverheadAdjustment: perActivityAlignments.reduce((sum, item) => sum + item.overheadAdjustment, 0),
        totalOverallAdjustment: perActivityAlignments.reduce((sum, item) => sum + item.totalAdjustment, 0),
      },
      attributedActivityCount: perActivityAlignments.reduce((sum, item) => sum + item.activityUnits, 0),
      attributedContributionTotal: perActivityAlignments.reduce((sum, item) => sum + item.systemContribution, 0),
      totalAdjustment: perActivityAlignments.reduce((sum, item) => sum + item.totalAdjustment, 0),
    };
  }, [selectedCollaboration, entities, records, activities, alignmentStartDate, alignmentEndDate]);

  const allCollaborationMetrics = useMemo(() => {
    const metricsMap = new Map<string, { entities: number; activity: number; contribution: number }>();
    
    collaborations.forEach((collaboration: Collaboration) => {
      const entityIds = new Set(
        entities
          .filter((p: Entity) => p.collaboration_id === collaboration.id)
          .map((p: Entity) => p.id)
      );
      
      let activityUnits = 0;
      let contributionSum = 0;
      
      entityIds.forEach(entityId => {
        const entityRecords = recordsByEntityId[entityId] || [];
        entityRecords.forEach(record => {
          activityUnits += record.unit_amount || 0;
          const activity = activities.find((w: Activity) => w.id === record.activity_id);
          if (activity?.operational_weight) {
            contributionSum += activity.operational_weight;
          }
        });
      });
      
      metricsMap.set(collaboration.id, {
        entities: entityIds.size,
        activity: activityUnits,
        contribution: contributionSum
      });
    });
    
    return metricsMap;
  }, [collaborations, entities, records, activities]);

  const handleSaveCollaborationRules = async () => {
    if (!selectedCollaboration || !canManageImpact) return;
    try {
      await updateCollaboration({
        ...selectedCollaboration,
        allocation_factor: parseNonNegativeNumber(editParticipationFactor),
        overhead_weight: parseNonNegativeNumber(editCollaborationOverheadWeight),
      });
      notify({ type: 'success', message: 'Collaboration configuration updated.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to update collaboration configuration.' });
    }
  };

  const handleActivityRecordEstimatedAdjustment = async () => {
    if (!selectedCollaboration || !canManageImpact) return;
    if (alignmentStartDate && alignmentEndDate && alignmentStartDate > alignmentEndDate) {
      notify({ type: 'error', message: 'The defined alignment date range is invalid.' });
      return;
    }
    const estimatedAmount = selectedCollaborationMetrics.totalAdjustment;
    if (estimatedAmount <= 0) {
      notify({ type: 'error', message: 'No pending activity found within this range.' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    try {
      await addCollaborationParticipation({
        collaboration_id: selectedCollaboration.id,
        type: 'adjustment',
        amount: estimatedAmount,
        date: today,
      });
      notify({ type: 'success', message: 'Operational adjustment calculated and logged.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to calculate operational adjustment.' });
    }
  };

  const handleArchiveParticipationsByDateRange = () => {
    if (!canManageImpact || !selectedCollaborationId) return;
    if (!recordDateStart || !recordDateEnd) {
      notify({ type: 'error', message: 'Please select both start and end date boundaries.' });
      return;
    }
    if (recordDateStart > recordDateEnd) {
      notify({ type: 'error', message: 'Boundary start date cannot exceed end date.' });
      return;
    }

    const targetedIds = activeSelectedParticipations
      .filter((p: CollaborationAllocation) => p.date >= recordDateStart && p.date <= recordDateEnd)
      .map((p: CollaborationAllocation) => p.id);

    if (targetedIds.length === 0) {
      notify({ type: 'error', message: 'No active participations matching this criteria.' });
      return;
    }

    setArchivedCollaborationParticipationIds((current: string[]) => Array.from(new Set([...current, ...targetedIds])));
    void (recordSystemEvent as any)({ 
      action: 'collaboration_participations_archived_range',
      entity: 'collaboration_participation',
      entity_id: selectedCollaborationId,
      details: `Filtered hidden participations from ${recordDateStart} to ${recordDateEnd} (${targetedIds.length} records)`,
    });
    notify({ type: 'success', message: `Moved ${targetedIds.length} participations to hidden repository.` });
  };

  const handleArchiveOldParticipations = () => {
    if (!canManageImpact) return;
    const legacyIds = oldCollaborationParticipationIds;
    if (legacyIds.length === 0) {
      notify({ type: 'error', message: `No participations found older than ${retentionDaysNumber} days.` });
      return;
    }
    setArchivedCollaborationParticipationIds((current: string[]) => Array.from(new Set([...current, ...legacyIds])));
    void (recordSystemEvent as any)({ 
      action: 'collaboration_participations_archived_legacy',
      entity: 'collaboration_participation',
      amount: legacyIds.length,
      details: `Moved legacy participations (> ${retentionDaysNumber} days) to hidden repository`,
    });
    notify({ type: 'success', message: `Archived ${legacyIds.length} legacy participations.` });
  };

  const handleRestoreAllArchivedParticipations = () => {
    if (!canManageImpact || !selectedCollaborationId) return;
    const targets = archivedSelectedParticipations.map((p: CollaborationAllocation) => p.id);
    if (targets.length === 0) {
      notify({ type: 'error', message: 'No hidden participations available to restore for this collaboration.' });
      return;
    }

    setArchivedCollaborationParticipationIds((current: string[]) => current.filter((id: string) => !targets.includes(id)));
    void (recordSystemEvent as any)({ 
      action: 'collaboration_participations_restored_bulk',
      entity: 'collaboration_participation',
      entity_id: selectedCollaborationId,
      details: `Restored ${targets.length} hidden participations`,
    });
    notify({ type: 'success', message: `Restored ${targets.length} hidden participations.` });
  };

  return (
    <div className="page-shell animate-in fade-in">
      {!canManageImpact && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 px-4 py-2 text-sm">
          Read-only mode: only admin/operator can create collaborations or log participations.
        </div>
      )}
      {!embedded ? (
        <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 shadow-sm border border-stone-200 dark:border-stone-700">
              <Handshake size={24} className="text-stone-900 dark:text-stone-100" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Collaborations</h2>
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                Collaborations: <span className="font-mono text-stone-900 dark:text-stone-100">{collaborations.length}</span>
              </span>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                Participations: <span className="font-mono text-stone-900 dark:text-stone-100">{collaborationParticipations.length}</span>
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsAdding(true)}
                disabled={!canManageImpact}
                className="action-btn-primary flex items-center gap-2"
              >
                <Plus size={16} />
                Add Collaboration
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setIsAdding(true)}
            disabled={!canManageImpact}
            className="action-btn-primary"
          >
            <Plus size={16} />
            Add Collaboration
          </button>
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleAddCollaboration} className="section-card p-6 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">New Collaboration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <input 
              className="control-input" 
              placeholder="Name (optional)" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              disabled={!canManageImpact}
            />
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Type</label>
              <select 
                className="control-input"
                value={role}
                onChange={e => setRole(e.target.value as 'collaboration' | 'channel' | 'hybrid')}
                disabled={!canManageImpact}
              >
                <option value="channel">Channel</option>
                <option value="collaboration">Collaboration</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 p-4 mb-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Collaboration Rules (optional)</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">Define participation parameters for this collaboration profile.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                 <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Participation Factor</label>
                <input
                  className="control-input"
                  type="number"
                  step="0.01"
                  value={newParticipationFactor}
                  onChange={e => setNewParticipationFactor(e.target.value)}
                  disabled={!canManageImpact}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Overhead Weight %</label>
                <input
                  className="control-input"
                  type="number"
                  step="0.1"
                  value={newCollaborationOverheadWeight}
                  onChange={e => setNewCollaborationOverheadWeight(e.target.value)}
                  disabled={!canManageImpact}
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
              disabled={!canManageImpact}
              className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-md text-sm hover:bg-stone-800 dark:hover:bg-stone-200"
            >
              Save Collaboration
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Collaboration List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="section-card p-4">
            <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100">Directory</h3>
          </div>
          {activeCollaborations.map((collaboration: Collaboration) => (
            <div 
              key={collaboration.id}
              onClick={() => setSelectedCollaborationId(collaboration.id)}
              className={cn(
                "section-card-hover p-4 cursor-pointer transitions-all",
                selectedCollaborationId === collaboration.id 
                  ? "border-emerald-500 ring-1 ring-emerald-500 shadow-sm" 
                  : ""
              )}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-500">
                    <Handshake size={20} />
                  </div>
                  <div>
                    <h3 className="font-medium text-stone-900 dark:text-stone-100">{getCollaborationDisplayName(collaboration.name)}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 capitalize">
                        {getCollaborationRoleLabel(collaboration.collaboration_type || (collaboration as any).role)}
                      </span>
                    </div>
                    <div className="text-xs text-stone-400 mt-1">
                      {entities.filter((p: Entity) => p.collaboration_id === collaboration.id).length} Linked Entities
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider">Total</p>
                  <p className={cn(
                    "font-mono font-medium",
                    collaboration.total_number > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                    collaboration.total_number < 0 ? "text-red-600 dark:text-red-400" : "text-stone-400"
                  )}>
                    {formatValue(collaboration.total_number)}
                  </p>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (canManageImpact) void handleArchiveCollaboration(collaboration.id);
                      }}
                      disabled={!canManageImpact}
                      className="action-btn-tertiary px-2 py-1 text-[11px] disabled:opacity-50"
                    >
                      Hide
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (canManageImpact) void handleDeleteCollaboration(collaboration.id);
                      }}
                      disabled={!canManageImpact || deletingCollaborationId === collaboration.id}
                      className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={deletingCollaborationId === collaboration.id ? 'Removing…' : 'Remove Collaboration'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {activeCollaborations.length === 0 && (
            <div className="text-center py-12 text-stone-400 bg-stone-50 dark:bg-stone-900 rounded-xl border border-dashed border-stone-200 dark:border-stone-800">
              No collaborations found.
            </div>
          )}

          {archivedCollaborations.length > 0 && (
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Hidden Repository</h4>
                <button
                  type="button"
                  onClick={() => setIsArchivedCollaborationListExpanded(prev => !prev)}
                  className="action-btn-secondary px-2.5 py-1 text-xs"
                >
                  {isArchivedCollaborationListExpanded ? 'Hide' : `Show (${archivedCollaborations.length})`}
                </button>
              </div>

              {isArchivedCollaborationListExpanded && (
                <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2">
                  {archivedCollaborations.map((collaboration: Collaboration) => (
                    <div
                      key={collaboration.id}
                      className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <h3 className="font-medium text-stone-900 dark:text-stone-100">{getCollaborationDisplayName(collaboration.name)}</h3>
                          <p className="text-xs text-stone-500 dark:text-stone-400">{getCollaborationRoleLabel(collaboration.collaboration_type || (collaboration as any).role)} • hidden</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-0.5">Summary</p>
                          <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                             {allCollaborationMetrics.get(collaboration.id)?.entities || 0} linked • {allCollaborationMetrics.get(collaboration.id)?.activity || 0} activity
                          </p>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => { if (canManageImpact) void handleUnarchiveCollaboration(collaboration.id); }}
                              disabled={!canManageImpact}
                              className="action-btn-tertiary px-2 py-1 text-[11px] disabled:opacity-50"
                            >
                              Unhide
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (canManageImpact) void handleDeleteCollaboration(collaboration.id);
                              }}
                              disabled={!canManageImpact || deletingCollaborationId === collaboration.id}
                              className="action-btn-tertiary px-2 py-1 text-[11px] text-red-600 dark:text-red-400 disabled:opacity-50"
                            >
                              {deletingCollaborationId === collaboration.id ? 'Removing…' : 'Remove'}
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
          {selectedCollaboration ? (
            <div className="section-card h-full flex flex-col">
              <div className="p-6 border-b border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-light text-stone-900 dark:text-stone-100">{getCollaborationDisplayName(selectedCollaboration.name)}</h2>
                  <p className="text-sm text-stone-500 dark:text-stone-400">{getCollaborationRoleLabel(selectedCollaboration.collaboration_type || (selectedCollaboration as any).role)} • {selectedCollaboration.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-stone-500 dark:text-stone-400">Current Total Balance</p>
                  <p className={cn(
                    "text-2xl font-light",
                    selectedCollaboration.total_number > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                    selectedCollaboration.total_number < 0 ? "text-red-600 dark:text-red-400" : "text-stone-900 dark:text-stone-100"
                  )}>
                    {formatValue(selectedCollaboration.total_number)}
                  </p>
                  <p className="text-xs text-stone-400">
                    {selectedCollaboration.total_number > 0 ? "Net toward system" : selectedCollaboration.total_number < 0 ? "Net toward collaboration" : "Aligned"}
                  </p>
                </div>
              </div>

              <div className="p-6 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 space-y-3">
                <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100">Configuration Parameters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Participation Factor</label>
                    <input
                      className="control-input"
                      type="number"
                      step="0.01"
                      value={editParticipationFactor}
                      onChange={e => setEditParticipationFactor(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Overhead Weight %</label>
                    <input
                      className="control-input"
                      type="number"
                      step="0.1"
                      value={editCollaborationOverheadWeight}
                      onChange={e => setEditCollaborationOverheadWeight(e.target.value)}
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
                    <p className="text-stone-500 dark:text-stone-400">Activity Volume</p>
                    <p className="font-mono text-stone-900 dark:text-stone-100">{selectedCollaborationMetrics.attributedActivityCount}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2">
                    <p className="text-stone-500 dark:text-stone-400">Cumulative Contribution</p>
                    <p className="font-mono text-stone-900 dark:text-stone-100">{formatValue(selectedCollaborationMetrics.attributedContributionTotal)}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2">
                    <p className="text-stone-500 dark:text-stone-400">Calculated Adjustment</p>
                    <p className="font-mono text-stone-900 dark:text-stone-100">{formatValue(selectedCollaborationMetrics.totalAdjustment)}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
                  <div className="px-3 py-2 border-b border-stone-200 dark:border-stone-700 text-xs text-stone-500 dark:text-stone-400">
                    Segmented participation alignment in selected range
                  </div>
                  <CollapsibleActivitySection
                    title="Segmented Participation Alignment"
                    summary={`${selectedCollaborationMetrics.perActivityAlignments.length} segments`}
                    defaultExpanded={false}
                    maxExpandedHeightClass="max-h-52"
                    maxCollapsedHeightClass="max-h-[96px]"
                  >
                    <table className="w-full text-left text-[12px]">
                      <thead className="sticky top-0 bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">Segment Date</th>
                          <th className="px-3 py-2 font-medium">Segment Node</th>
                          <th className="px-3 py-2 font-medium text-right">Activity</th>
                          <th className="px-3 py-2 font-medium text-right">Contribution Sum</th>
                          <th className="px-3 py-2 font-medium text-right">Net Adjustment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                        {selectedCollaborationMetrics.perActivityAlignments.map((item: { activityId: string; date: string; channel: string; activityUnits: number; systemContribution: number; collaborationAdjustment: number; overheadAdjustment: number; totalAdjustment: number; }) => (
                          <tr key={item.activityId}>
                            <td className="px-3 py-2 text-stone-600 dark:text-stone-300">{formatDate(item.date)}</td>
                            <td className="px-3 py-2 text-stone-600 dark:text-stone-300">{item.channel}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{item.activityUnits}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(item.systemContribution)}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(item.totalAdjustment)}</td>
                          </tr>
                        ))}
                        {selectedCollaborationMetrics.perActivityAlignments.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-stone-400">No activity segments captured in this range.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CollapsibleActivitySection>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { void handleSaveCollaborationRules(); }}
                    disabled={!canManageImpact}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    Synchronize Rules
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleActivityRecordEstimatedAdjustment(); }}
                    disabled={!canManageImpact}
                    className="action-btn-primary text-xs disabled:opacity-50"
                  >
                    Commit Estimated Adjustment
                  </button>
                </div>
              </div>

              <div className="p-6 bg-stone-50 dark:bg-stone-800/50 border-b border-stone-200 dark:border-stone-800">
                <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-3">Commit New Participation</h3>
                <form onSubmit={handleAddParticipation} className="flex flex-col sm:flex-row gap-2">
                  <select 
                    className="control-input text-sm"
                    value={transType}
                    onChange={e => setTransType(e.target.value as 'input' | 'output' | 'alignment' | 'adjustment')}
                    disabled={!canManageImpact}
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
                    disabled={!canManageImpact}
                    required
                  />

                  <button type="submit" disabled={!canManageImpact} className="action-btn-primary text-sm disabled:opacity-50">
                    Commit Participation
                  </button>
                </form>
              </div>

              <div className="p-6 border-b border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/40 space-y-3">
                <h4 className="text-sm font-medium text-stone-900 dark:text-stone-100">Participation Visibility Controls</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                    <input
                      className="control-input pl-9"
                      placeholder="Search participation logs..."
                      value={participationSearchQuery}
                      onChange={event => setParticipationSearchQuery(event.target.value)}
                    />
                  </div>
                  <select
                    className="control-input"
                    value={participationTypeFilter}
                    onChange={event => setParticipationTypeFilter(event.target.value as any)}
                  >
                    <option value="all">All flow types</option>
                    <option value="input">Input</option>
                    <option value="alignment">Alignment</option>
                    <option value="output">Output</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-stone-500">From Date</label>
                    <input type="date" className="control-input" value={recordDateStart} onChange={event => setRecordDateStart(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-stone-500">To Date</label>
                    <input type="date" className="control-input" value={recordDateEnd} onChange={event => setRecordDateEnd(event.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1 border-t border-stone-200/50 dark:border-stone-700/50">
                  <button
                    type="button"
                    onClick={handleArchiveParticipationsByDateRange}
                    disabled={!canManageImpact || !selectedCollaborationId}
                    className="action-btn-tertiary text-xs disabled:opacity-50"
                  >
                    <Archive size={12} className="mr-1.5" />
                    Hide by Date Range
                  </button>
                  <button
                    type="button"
                    onClick={handleArchiveOldParticipations}
                    disabled={!canManageImpact}
                    className="action-btn-tertiary text-xs disabled:opacity-50"
                  >
                    <Archive size={12} className="mr-1.5" />
                    Hide Legacy ({retentionDaysNumber}+d)
                  </button>
                  <button
                    type="button"
                    onClick={handleRestoreAllArchivedParticipations}
                    disabled={!canManageImpact || archivedSelectedParticipations.length === 0}
                    className="action-btn-tertiary text-xs disabled:opacity-50"
                  >
                    <RotateCcw size={12} className="mr-1.5" />
                    Restore All Hidden
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[100px_auto_1fr] gap-3 items-center">
                  <input
                    type="number"
                    min="1"
                    className="control-input text-xs"
                    value={retentionDays}
                    onChange={event => setRetentionDays(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setAutoArchiveEnabled(value => !value)}
                    disabled={!canManageImpact}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                      autoArchiveEnabled 
                        ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" 
                        : "bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300"
                    )}
                  >
                    {autoArchiveEnabled ? 'Auto-Hide Enabled' : 'Auto-Hide Disabled'}
                  </button>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400">Targeting older than {retentionDaysNumber} days</span>
                </div>
              </div>

              {/* Tabs for Participations vs Entities */}
              <div className="border-b border-stone-200 dark:border-stone-800 px-6">
                <div className="flex gap-6">
                  <button 
                    onClick={() => setActiveTab('participations')}
                    className={cn(
                      "py-4 text-sm font-medium border-b-2 transition-all",
                      activeTab === 'participations' 
                        ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" 
                        : "border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700"
                    )}
                  >
                    Participations
                  </button>
                  <button 
                    onClick={() => setActiveTab('entities')}
                    className={cn(
                      "py-4 text-sm font-medium border-b-2 transition-all",
                      activeTab === 'entities' 
                        ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" 
                        : "border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700"
                    )}
                  >
                    Linked Entities
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-0 scrollbar-thin">
                {activeTab === 'participations' ? (
                  <div className="p-0">
                    <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
                    {filteredActiveSelectedParticipations.map(p => (
                      <MobileActivityRecordCard
                        key={p.id}
                        title={<span className="text-xs text-stone-500 dark:text-stone-400 font-normal">{formatDate(p.date)}</span>}
                        right={(
                          <p className={cn(
                            "font-mono text-sm font-medium",
                            p.type === 'input' ? "text-emerald-600 dark:text-emerald-400" : "text-stone-900 dark:text-stone-100"
                          )}>
                            {p.type === 'input' ? '+' : '-'}{formatValue(p.amount)}
                          </p>
                        )}
                        meta={<span className="capitalize">{p.type}</span>}
                      >
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleArchiveParticipation(p.id)}
                            disabled={!canManageImpact}
                            className="action-btn-tertiary px-2.5 py-1 text-xs disabled:opacity-50"
                          >
                            Hide
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingParticipationId(p.id)}
                            disabled={!canManageImpact}
                            className="action-btn-tertiary px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </MobileActivityRecordCard>
                    ))}
                    {filteredActiveSelectedParticipations.length === 0 && (
                      <div className="px-6 py-12 text-center text-stone-400 text-sm italic">No participation records found matching criteria.</div>
                    )}
                    </div>

                    <div className="hidden md:block">
                      <table className="w-full text-left text-[13px]">
                        <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                          <tr>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px]">Date</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px]">Flow Type</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Amount</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                          {filteredActiveSelectedParticipations.map(p => (
                            <tr key={p.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                              <td className="px-6 py-3 text-stone-500 dark:text-stone-400">{formatDate(p.date)}</td>
                              <td className="px-6 py-3">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[11px] font-medium uppercase",
                                  p.type === 'input' ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" :
                                  p.type === 'output' ? "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300" :
                                  "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                                )}>
                                  {p.type}
                                </span>
                              </td>
                              <td className={cn(
                                "px-6 py-3 text-right font-mono font-medium",
                                p.type === 'input' ? "text-emerald-600 dark:text-emerald-400" : "text-stone-900 dark:text-stone-100"
                              )}>
                                {p.type === 'input' ? '+' : '-'}{formatValue(p.amount)}
                              </td>
                              <td className="px-6 py-3 text-right">
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => handleArchiveParticipation(p.id)}
                                    disabled={!canManageImpact}
                                    className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all disabled:opacity-50"
                                    title="Move to hidden repository"
                                  >
                                    <Archive size={14} />
                                  </button>
                                  <button
                                    onClick={() => setDeletingParticipationId(p.id)}
                                    disabled={!canManageImpact}
                                    className="p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50"
                                    title="Permanently remove record"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredActiveSelectedParticipations.length === 0 && (
                        <div className="px-6 py-12 text-center text-stone-400 text-sm italic">No participation logs matching configuration.</div>
                      )}
                    </div>

                    {archivedSelectedParticipations.length > 0 && (
                      <div className="mt-6 px-6 pb-6">
                        <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/40 overflow-hidden">
                          <button
                            onClick={() => setIsArchivedParticipationHistoryExpanded(prev => !prev)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-100/50 dark:hover:bg-stone-800/50 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Archive size={14} className="text-stone-400" />
                              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Hidden Repository ({archivedSelectedParticipations.length})</span>
                            </div>
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{isArchivedParticipationHistoryExpanded ? 'Collapse' : 'Expand'}</span>
                          </button>
                          
                          {isArchivedParticipationHistoryExpanded && (
                            <div className="border-t border-stone-200 dark:border-stone-700 animate-in slide-in-from-top-2">
                              <table className="w-full text-left text-[12px]">
                                <thead className="bg-stone-100/50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400">
                                  <tr>
                                    <th className="px-4 py-2 font-medium">Date</th>
                                    <th className="px-4 py-2 font-medium">Type</th>
                                    <th className="px-4 py-2 font-medium text-right">Amount</th>
                                    <th className="px-4 py-2 font-medium text-right">Manage</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                                  {filteredArchivedSelectedParticipations.map(p => (
                                    <tr key={p.id}>
                                      <td className="px-4 py-2 text-stone-500">{formatDate(p.date)}</td>
                                      <td className="px-4 py-2 capitalize opacity-60">{p.type}</td>
                                      <td className="px-4 py-2 text-right font-mono opacity-60">{formatValue(p.amount)}</td>
                                      <td className="px-4 py-2 text-right">
                                        <button
                                          onClick={() => handleUnarchiveParticipation(p.id)}
                                          disabled={!canManageImpact}
                                          className="text-emerald-600 dark:text-emerald-400 hover:underline text-[11px] font-medium mr-3"
                                        >
                                          Restore
                                        </button>
                                        <button
                                          onClick={() => setDeletingParticipationId(p.id)}
                                          disabled={!canManageImpact}
                                          className="text-red-600 dark:text-red-400 hover:underline text-[11px] font-medium"
                                        >
                                          Remove
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-0">
                    <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
                      {selectedCollaborationEntitys.map(entity => {
                        const entityActivityCount = records.filter(record => record.entity_id === entity.id).length;
                        const lastActivityDate = records
                          .filter(record => record.entity_id === entity.id)
                          .map(record => activities.find(activity => activity.id === record.activity_id)?.date)
                          .filter((date): date is string => Boolean(date))
                          .sort((a, b) => b.localeCompare(a))[0];

                        return (
                          <MobileActivityRecordCard
                            key={entity.id}
                            title={entity.name}
                            right={<span className="font-mono text-sm text-stone-900 dark:text-stone-100">{formatValue(entity.total || 0)}</span>}
                            meta={<span>{entityActivityCount} activities • {lastActivityDate ? formatDate(lastActivityDate) : 'No activity yet'}</span>}
                          >
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500 dark:text-stone-400">
                              <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-1">Entity ID: {entity.id.slice(0, 8)}</span>
                            </div>
                          </MobileActivityRecordCard>
                        );
                      })}
                      {selectedCollaborationEntitys.length === 0 && (
                        <div className="px-6 py-12 text-center text-stone-400 text-sm italic">No entities currently linked to this profile.</div>
                      )}
                    </div>

                    <div className="hidden md:block">
                      <table className="w-full text-left text-[13px]">
                        <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                          <tr>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px]">Entity Name</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px]">ID Reference</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Gross Total</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Activities</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Last Sync</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                          {selectedCollaborationEntitys.map(entity => {
                            const entityEntries = records.filter(record => record.entity_id === entity.id);
                            const lastActivityDate = entityEntries
                              .map(record => activities.find(activity => activity.id === record.activity_id)?.date)
                              .filter((date): date is string => Boolean(date))
                              .sort((a, b) => b.localeCompare(a))[0];

                            return (
                              <tr key={entity.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                                <td className="px-6 py-3 font-medium text-stone-900 dark:text-stone-100">{entity.name}</td>
                                <td className="px-6 py-3 font-mono text-[11px] text-stone-400">{entity.id.slice(0, 8)}</td>
                                <td className="px-6 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatValue(entity.total || 0)}</td>
                                <td className="px-6 py-3 text-right font-mono text-stone-600 dark:text-stone-300">{entityEntries.length}</td>
                                <td className="px-6 py-3 text-right text-stone-400">{lastActivityDate ? formatDate(lastActivityDate) : 'Never'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {selectedCollaborationEntitys.length === 0 && (
                        <div className="px-6 py-12 text-center text-stone-400 text-sm italic">No linked entities found. Use the Entities module to establish links.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-stone-50 dark:bg-stone-900 rounded-2xl border border-dashed border-stone-200 dark:border-stone-800">
              <Handshake size={48} className="text-stone-200 dark:text-stone-800 mb-4" />
              <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">Select a Collaboration Profile</h3>
              <p className="max-w-xs text-stone-500 dark:text-stone-400 text-sm mt-1">Select a profile from the directory to view operational flows, configuration, and linked entities.</p>
            </div>
          )}
        </div>
      </div>

      {deletingParticipationId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-stone-200 dark:border-stone-800 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">Remove Participation ActivityRecord?</h3>
            <p className="text-stone-500 dark:text-stone-400 mt-2 text-sm">This action will reverse the participation's impact on balance totals. This process is irreversible.</p>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setDeletingParticipationId(null)}
                className="flex-1 px-4 py-2 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-600 dark:text-stone-300 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
              >
                Keep ActivityRecord
              </button>
              <button 
                onClick={async () => {
                  const id = deletingParticipationId;
                  setDeletingParticipationId(null);
                  await handleDeleteParticipation(id);
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 shadow-md shadow-red-500/20 transition-all"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
