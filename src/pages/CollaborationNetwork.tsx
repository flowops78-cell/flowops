import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Calendar, Filter, Archive, RotateCcw, Activity, Handshake, Search, UserPlus, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useData } from '../lib/DataContext';
import { formatValue, formatDate, parseNonNegativeNumber } from '../lib/utils';
import { cn } from '../lib/utils';
import { notify } from '../components/InAppNotification';
import { CollapsibleWorkspaceSection } from '../components/CollapsibleWorkspaceSection';
import { MobileRecordCard } from '../components/MobileRecordCard';

const getCollaborationRoleLabel = (role: string) => {
  switch (role) {
    case 'associate': return 'Collaboration Profile';
    case 'channel': return 'Operational Node';
    case 'hybrid': return 'Interconnected Hub';
    default: return 'Defined Entity';
  }
};

const getCollaborationDisplayName = (name?: string) => name || 'Unnamed Collaboration';

export const CollaborationNetwork: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { 
    associates, 
    units: participants, 
    associateAllocations: associateParticipations, 
    entries, 
    workspaces,
    addAssociate, 
    deleteAssociate, 
    updateAssociate,
    addAssociateAllocation: addAssociateParticipation,
    deleteAssociateAllocation: deleteAssociateParticipation,
    recordSystemEvent,
    userRole 
  } = useData();

  const [selectedCollaborationId, setSelectedCollaborationId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'associate' | 'channel' | 'hybrid'>('channel');
  const [newParticipationFactor, setNewParticipationFactor] = useState('0');
  const [newCollaborationOverheadWeight, setNewCollaborationOverheadWeight] = useState('0');
  
  const [transType, setTransType] = useState<'input' | 'output' | 'alignment' | 'adjustment'>('adjustment');
  const [transAmount, setTransAmount] = useState('');
  
  const [participationSearchQuery, setParticipationSearchQuery] = useState('');
  const [participationTypeFilter, setParticipationTypeFilter] = useState<'all' | 'input' | 'output' | 'alignment' | 'adjustment'>('all');
  const [entryDateStart, setEntryDateStart] = useState('');
  const [entryDateEnd, setEntryDateEnd] = useState('');
  const [retentionDays, setRetentionDays] = useState('90');
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(false);
  
  const [archivedAssociateParticipationIds, setArchivedAssociateParticipationIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem('associates.archived_participation_ids');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const [isArchivedParticipationHistoryExpanded, setIsArchivedParticipationHistoryExpanded] = useState(false);
  const [isArchivedCollaborationListExpanded, setIsArchivedCollaborationListExpanded] = useState(false);
  const [deletingCollaborationId, setDeletingCollaborationId] = useState<string | null>(null);
  const [deletingParticipationId, setDeletingParticipationId] = useState<string | null>(null);

  const [editParticipationFactor, setEditParticipationFactor] = useState('0');
  const [editCollaborationOverheadWeight, setEditCollaborationOverheadWeight] = useState('0');
  const [activeTab, setActiveTab] = useState<'participations' | 'participants'>('participations');

  const [alignmentStartDate, setAlignmentStartDate] = useState('');
  const [alignmentEndDate, setAlignmentEndDate] = useState('');

  const canManageValue = userRole === 'admin' || userRole === 'operator';

  const handleAddCollaboration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageValue) return;
    try {
      await addAssociate({
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
    if (!canManageValue || !selectedCollaborationId || !transAmount) return;
    const today = new Date().toISOString().split('T')[0];

    try {
      await addAssociateParticipation({
        attributed_associate_id: selectedCollaborationId,
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

  const handleDeleteCollaboration = async (associateId: string) => {
    if (!canManageValue || deletingCollaborationId === associateId) return;
    const confirmed = window.confirm('Remove this collaboration? This is only allowed when no dependency links remain.');
    if (!confirmed) return;

    try {
      setDeletingCollaborationId(associateId);
      await deleteAssociate(associateId);
      if (selectedCollaborationId === associateId) {
        setSelectedCollaborationId(null);
      }
      notify({ type: 'success', message: 'Collaboration removed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to remove collaboration.' });
    } finally {
      setDeletingCollaborationId(current => (current === associateId ? null : current));
    }
  };

  const handleArchiveCollaboration = async (associateId: string) => {
    if (!canManageValue) return;
    const associate = associates.find(item => item.id === associateId);
    if (!associate || associate.status === 'inactive') return;

    try {
      await updateAssociate({ ...associate, status: 'inactive' });
      if (selectedCollaborationId === associateId) {
        setSelectedCollaborationId(null);
      }
      void (recordSystemEvent as any)({ 
        action: 'associate_archived',
        entity: 'associate',
        unit_id: associateId,
        details: `Collaboration ${getCollaborationDisplayName(associate.name)} moved to hidden`,
      });
      notify({ type: 'success', message: 'Collaboration hidden.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to hide collaboration.' });
    }
  };

  const handleUnarchiveCollaboration = async (associateId: string) => {
    if (!canManageValue) return;
    const associate = associates.find(item => item.id === associateId);
    if (!associate || associate.status !== 'inactive') return;

    try {
      await updateAssociate({ ...associate, status: 'active' });
      void (recordSystemEvent as any)({ 
        action: 'associate_unarchived',
        entity: 'associate',
        unit_id: associateId,
        details: `Collaboration ${getCollaborationDisplayName(associate.name)} restored`,
      });
      notify({ type: 'success', message: 'Collaboration restored.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to restore collaboration.' });
    }
  };

  const handleDeleteParticipation = async (participationId: string) => {
    if (!canManageValue || deletingParticipationId === participationId) return;
    const confirmed = window.confirm('Remove this participation Record? This will reverse its impact.');
    if (!confirmed) return;

    try {
      setDeletingParticipationId(participationId);
      await deleteAssociateParticipation(participationId);
      notify({ type: 'success', message: 'Participation removed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to remove participation.' });
    } finally {
      setDeletingParticipationId(current => (current === participationId ? null : current));
    }
  };

  const handleArchiveParticipation = (participationId: string) => {
    setArchivedAssociateParticipationIds(current => (current.includes(participationId) ? current : [...current, participationId]));
    void (recordSystemEvent as any)({ 
      action: 'associate_participation_archived',
      entity: 'associate_participation',
      unit_id: participationId,
      details: 'Participation moved to hidden repository',
    });
    notify({ type: 'success', message: 'Participation hidden.' });
  };

  const handleUnarchiveParticipation = (participationId: string) => {
    setArchivedAssociateParticipationIds(current => current.filter(item => item !== participationId));
    void (recordSystemEvent as any)({ 
      action: 'associate_participation_unarchived',
      entity: 'associate_participation',
      unit_id: participationId,
      details: 'Participation restored to active set',
    });
    notify({ type: 'success', message: 'Participation restored.' });
  };

  const selectedCollaboration = associates.find(a => a.id === selectedCollaborationId);
  
  const selectedCollaborationParticipants = useMemo(
    () => participants
      .filter(participant => participant.attributed_associate_id === selectedCollaborationId)
      .sort((a, b) => (b.total || 0) - (a.total || 0)),
    [participants, selectedCollaborationId]
  );

  const selectedParticipations = associateParticipations.filter(t => t.attributed_associate_id === selectedCollaborationId);
  const archivedAssociateParticipationIdSet = useMemo(() => new Set(archivedAssociateParticipationIds), [archivedAssociateParticipationIds]);
  
  const activeSelectedParticipations = useMemo(
    () => selectedParticipations.filter(participation => !archivedAssociateParticipationIdSet.has(participation.id)),
    [selectedParticipations, archivedAssociateParticipationIdSet]
  );
  
  const archivedSelectedParticipations = useMemo(
    () => selectedParticipations.filter(participation => archivedAssociateParticipationIdSet.has(participation.id)),
    [selectedParticipations, archivedAssociateParticipationIdSet]
  );

  const filteredActiveSelectedParticipations = useMemo(() => {
    let filtered = activeSelectedParticipations;

    if (participationSearchQuery) {
      const q = participationSearchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.id.toLowerCase().includes(q) || 
        a.amount.toString().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.date.toLowerCase().includes(q)
      );
    }
    
    if (participationTypeFilter !== 'all') {
      filtered = filtered.filter(a => a.type === participationTypeFilter);
    }
    if (entryDateStart) filtered = filtered.filter(a => a.date >= entryDateStart);
    if (entryDateEnd) filtered = filtered.filter(a => a.date <= entryDateEnd);

    return filtered;
  }, [activeSelectedParticipations, participationTypeFilter, entryDateStart, entryDateEnd, participationSearchQuery]);

  const filteredArchivedSelectedParticipations = useMemo(() => {
    let filtered = archivedSelectedParticipations;

    if (participationSearchQuery) {
      const q = participationSearchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.id.toLowerCase().includes(q) || 
        a.amount.toString().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.date.toLowerCase().includes(q)
      );
    }
    
    if (participationTypeFilter !== 'all') {
      filtered = filtered.filter(a => a.type === participationTypeFilter);
    }
    if (entryDateStart) filtered = filtered.filter(a => a.date >= entryDateStart);
    if (entryDateEnd) filtered = filtered.filter(a => a.date <= entryDateEnd);

    return filtered;
  }, [archivedSelectedParticipations, participationTypeFilter, entryDateStart, entryDateEnd, participationSearchQuery]);

  const retentionDaysNumber = useMemo(() => {
    const parsed = Number(retentionDays);
    if (!Number.isFinite(parsed)) return 90;
    return Math.max(1, Math.floor(parsed));
  }, [retentionDays]);
  const oldAssociateParticipationIds = useMemo(() => {
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - retentionDaysNumber);
    const thresholdTime = threshold.getTime();
    return associateParticipations
      .filter(participation => !archivedAssociateParticipationIdSet.has(participation.id))
      .filter(participation => {
        const date = new Date(participation.date);
        return Number.isFinite(date.getTime()) && date.getTime() < thresholdTime;
      })
      .map(participation => participation.id);
  }, [associateParticipations, archivedAssociateParticipationIdSet, retentionDaysNumber]);
  const activeCollaborations = useMemo(() => associates.filter(associate => associate.status !== 'inactive'), [associates]);
  const archivedCollaborations = useMemo(() => associates.filter(associate => associate.status === 'inactive'), [associates]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('associates.archived_participation_ids', JSON.stringify(archivedAssociateParticipationIds));
  }, [archivedAssociateParticipationIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('associates.retentionDays', retentionDays);
  }, [retentionDays]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('associates.autoArchiveEnabled', autoArchiveEnabled ? 'true' : 'false');
  }, [autoArchiveEnabled]);

  useEffect(() => {
    if (!autoArchiveEnabled || oldAssociateParticipationIds.length === 0) return;
    setArchivedAssociateParticipationIds(current => {
      const next = new Set(current);
      oldAssociateParticipationIds.forEach(id => next.add(id));
      if (next.size === current.length) return current;
      void (recordSystemEvent as any)({ 
        action: 'associate_participations_auto_archived',
        entity: 'associate_participation',
        amount: oldAssociateParticipationIds.length,
        details: `Auto-hidden participations older than ${retentionDaysNumber} days`,
      });
      return Array.from(next);
    });
  }, [autoArchiveEnabled, oldAssociateParticipationIds, recordSystemEvent, retentionDaysNumber]);

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

    const attributedParticipantIds = new Set(
      participants
        .filter(participant => participant.attributed_associate_id === selectedCollaboration.id)
        .map(participant => participant.id)
    );

    const relatedWorkspaceDateSet = new Set<string>();
    entries.forEach(entry => {
      if (!attributedParticipantIds.has(entry.unit_id)) return;
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
  }, [selectedCollaborationId, selectedCollaboration, participants, entries, workspaces]);

  const selectedCollaborationMetrics = useMemo(() => {
    if (!selectedCollaboration) {
      return {
        attributedParticipants: 0,
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

    const attributedParticipantIds = new Set(
      participants
        .filter(participant => participant.attributed_associate_id === selectedCollaboration.id)
        .map(participant => participant.id)
    );

    const workspaceLookup = new Map(workspaces.map(w => [w.id, w]));
    const alignmentAccumulator = new Map<string, { workspaceId: string; date: string; channel: string; activityUnits: number; systemContribution: number }>();

    entries.forEach(entry => {
      if (!attributedParticipantIds.has(entry.unit_id)) return;
      const workspace = workspaceLookup.get(entry.workspace_id);
      if (!workspace || !isInDateRange(workspace.date)) return;

      const current = alignmentAccumulator.get(workspace.id) || {
        workspaceId: workspace.id,
        date: workspace.date,
        channel: workspace.channel || 'Operational Context',
        activityUnits: 0,
        systemContribution: workspace.operational_contribution || 0,
      };
      current.activityUnits += entry.activity_units || 0;
      alignmentAccumulator.set(workspace.id, current);
    });

    const perWorkspaceAlignments = Array.from(alignmentAccumulator.values())
      .map(item => {
        const associateAdjustment = (selectedCollaboration.role === 'associate' || selectedCollaboration.role === 'hybrid')
          ? item.activityUnits * (selectedCollaboration.allocation_factor || 0)
          : 0;
        const overheadAdjustment = (selectedCollaboration.role === 'channel' || selectedCollaboration.role === 'hybrid')
          ? item.systemContribution * ((selectedCollaboration.overhead_weight || 0) / 100)
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
      attributedParticipants: attributedParticipantIds.size,
      attributedActivity: perWorkspaceAlignments.reduce((sum, item) => sum + item.activityUnits, 0),
      attributedContribution: perWorkspaceAlignments.reduce((sum, item) => sum + item.systemContribution, 0),
      perWorkspaceAlignments,
      summary: {
        totalCollaborationAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.associateAdjustment, 0),
        totalOverheadAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.overheadAdjustment, 0),
        totalOverallAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.totalAdjustment, 0),
      },
      attributedActivityCount: perWorkspaceAlignments.reduce((sum, item) => sum + item.activityUnits, 0),
      attributedContributionTotal: perWorkspaceAlignments.reduce((sum, item) => sum + item.systemContribution, 0),
      totalAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.totalAdjustment, 0),
    };
  }, [selectedCollaboration, participants, entries, workspaces, alignmentStartDate, alignmentEndDate]);

  const allCollaborationMetrics = useMemo(() => {
    const metricsMap = new Map<string, { participants: number; activity: number; contribution: number }>();
    
    associates.forEach(associate => {
      const participantIds = new Set(
        participants
          .filter(p => p.attributed_associate_id === associate.id)
          .map(p => p.id)
      );
      
      let activityUnits = 0;
      let contributionSum = 0;
      
      entries.forEach(entry => {
        if (!participantIds.has(entry.unit_id)) return;
        activityUnits += entry.activity_units || 0;
        const workspace = workspaces.find(w => w.id === entry.workspace_id);
        if (workspace?.operational_contribution) {
          contributionSum += workspace.operational_contribution;
        }
      });
      
      metricsMap.set(associate.id, {
        participants: participantIds.size,
        activity: activityUnits,
        contribution: contributionSum
      });
    });
    
    return metricsMap;
  }, [associates, participants, entries, workspaces]);

  const handleSaveCollaborationRules = async () => {
    if (!selectedCollaboration || !canManageValue) return;
    try {
      await updateAssociate({
        ...selectedCollaboration,
        allocation_factor: parseNonNegativeNumber(editParticipationFactor),
        overhead_weight: parseNonNegativeNumber(editCollaborationOverheadWeight),
      });
      notify({ type: 'success', message: 'Collaboration configuration updated.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to update collaboration configuration.' });
    }
  };

  const handleRecordEstimatedAdjustment = async () => {
    if (!selectedCollaboration || !canManageValue) return;
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
      await addAssociateParticipation({
        attributed_associate_id: selectedCollaboration.id,
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
    if (!canManageValue || !selectedCollaborationId) return;
    if (!entryDateStart || !entryDateEnd) {
      notify({ type: 'error', message: 'Please select both start and end date boundaries.' });
      return;
    }
    if (entryDateStart > entryDateEnd) {
      notify({ type: 'error', message: 'Boundary start date cannot exceed end date.' });
      return;
    }

    const targetedIds = activeSelectedParticipations
      .filter(p => p.date >= entryDateStart && p.date <= entryDateEnd)
      .map(p => p.id);

    if (targetedIds.length === 0) {
      notify({ type: 'error', message: 'No active participations matching this criteria.' });
      return;
    }

    setArchivedAssociateParticipationIds(current => Array.from(new Set([...current, ...targetedIds])));
    void (recordSystemEvent as any)({ 
      action: 'associate_participations_archived_range',
      entity: 'associate_participation',
      unit_id: selectedCollaborationId,
      details: `Filtered hidden participations from ${entryDateStart} to ${entryDateEnd} (${targetedIds.length} records)`,
    });
    notify({ type: 'success', message: `Moved ${targetedIds.length} participations to hidden repository.` });
  };

  const handleArchiveOldParticipations = () => {
    if (!canManageValue) return;
    const legacyIds = oldAssociateParticipationIds;
    if (legacyIds.length === 0) {
      notify({ type: 'error', message: `No participations found older than ${retentionDaysNumber} days.` });
      return;
    }
    setArchivedAssociateParticipationIds(current => Array.from(new Set([...current, ...legacyIds])));
    void (recordSystemEvent as any)({ 
      action: 'associate_participations_archived_legacy',
      entity: 'associate_participation',
      amount: legacyIds.length,
      details: `Moved legacy participations (> ${retentionDaysNumber} days) to hidden repository`,
    });
    notify({ type: 'success', message: `Archived ${legacyIds.length} legacy participations.` });
  };

  const handleRestoreAllArchivedParticipations = () => {
    if (!canManageValue || !selectedCollaborationId) return;
    const targets = archivedSelectedParticipations.map(p => p.id);
    if (targets.length === 0) {
      notify({ type: 'error', message: 'No hidden participations available to restore for this collaboration.' });
      return;
    }

    setArchivedAssociateParticipationIds(current => current.filter(id => !targets.includes(id)));
    void (recordSystemEvent as any)({ 
      action: 'associate_participations_restored_bulk',
      entity: 'associate_participation',
      unit_id: selectedCollaborationId,
      details: `Restored ${targets.length} hidden participations`,
    });
    notify({ type: 'success', message: `Restored ${targets.length} hidden participations.` });
  };

  return (
    <div className="page-shell animate-in fade-in">
      {!canManageValue && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 px-4 py-2 text-sm">
          Read-only mode: only admin/operator can create collaborations or log participations.
        </div>
      )}
      {!embedded ? (
        <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">Collaborations</h2>
            <p className="text-stone-500 dark:text-stone-400 text-sm">Collaboration network, configuration, and activity logs.</p>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                Collaborations: <span className="font-mono text-stone-900 dark:text-stone-100">{associates.length}</span>
              </span>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                Participations: <span className="font-mono text-stone-900 dark:text-stone-100">{associateParticipations.length}</span>
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsAdding(true)}
                disabled={!canManageValue}
                className="action-btn-primary"
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
            disabled={!canManageValue}
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
                <option value="associate">Collaboration</option>
                <option value="hybrid">Hybrid</option>
              </select>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Defines how this profile participates in activities.</p>
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
                  disabled={!canManageValue}
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
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">Search collaborations from the list below.</p>
          </div>
          {activeCollaborations.map(associate => (
            <div 
              key={associate.id}
              onClick={() => setSelectedCollaborationId(associate.id)}
              className={cn(
                "section-card-hover p-4 cursor-pointer transitions-all",
                selectedCollaborationId === associate.id 
                  ? "border-emerald-500 ring-1 ring-emerald-500 shadow-sm" 
                  : ""
              )}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-stone-900 dark:text-stone-100">{getCollaborationDisplayName(associate.name)}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 capitalize">
                      {getCollaborationRoleLabel(associate.role)}
                    </span>
                  </div>
                  <div className="text-xs text-stone-400 mt-1">
                    {participants.filter(p => p.attributed_associate_id === associate.id).length} Linked Participants
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
                        if (canManageValue) void handleArchiveCollaboration(associate.id);
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
                        if (canManageValue) void handleDeleteCollaboration(associate.id);
                      }}
                      disabled={!canManageValue || deletingCollaborationId === associate.id}
                      className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={deletingCollaborationId === associate.id ? 'Removing…' : 'Remove Collaboration'}
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
                  {archivedCollaborations.map(associate => (
                    <div
                      key={associate.id}
                      className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <h3 className="font-medium text-stone-900 dark:text-stone-100">{getCollaborationDisplayName(associate.name)}</h3>
                          <p className="text-xs text-stone-500 dark:text-stone-400">{getCollaborationRoleLabel(associate.role)} • hidden</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-0.5">Summary</p>
                          <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                             {allCollaborationMetrics.get(associate.id)?.participants || 0} linked • {allCollaborationMetrics.get(associate.id)?.activity || 0} activity
                          </p>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => { if (canManageValue) void handleUnarchiveCollaboration(associate.id); }}
                              disabled={!canManageValue}
                              className="action-btn-tertiary px-2 py-1 text-[11px] disabled:opacity-50"
                            >
                              Unhide
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (canManageValue) void handleDeleteCollaboration(associate.id);
                              }}
                              disabled={!canManageValue || deletingCollaborationId === associate.id}
                              className="action-btn-tertiary px-2 py-1 text-[11px] text-red-600 dark:text-red-400 disabled:opacity-50"
                            >
                              {deletingCollaborationId === associate.id ? 'Removing…' : 'Remove'}
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
                  <p className="text-sm text-stone-500 dark:text-stone-400">{getCollaborationRoleLabel(selectedCollaboration.role)} • {selectedCollaboration.status}</p>
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
                  <CollapsibleWorkspaceSection
                    title="Segmented Participation Alignment"
                    summary={`${selectedCollaborationMetrics.perWorkspaceAlignments.length} segments`}
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
                        {selectedCollaborationMetrics.perWorkspaceAlignments.map(item => (
                          <tr key={item.workspaceId}>
                            <td className="px-3 py-2 text-stone-600 dark:text-stone-300">{formatDate(item.date)}</td>
                            <td className="px-3 py-2 text-stone-600 dark:text-stone-300">{item.channel}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{item.activityUnits}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(item.systemContribution)}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(item.totalAdjustment)}</td>
                          </tr>
                        ))}
                        {selectedCollaborationMetrics.perWorkspaceAlignments.length === 0 && (
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
                    onClick={() => { void handleSaveCollaborationRules(); }}
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
                <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-3">Commit New Participation</h3>
                <form onSubmit={handleAddParticipation} className="flex flex-col sm:flex-row gap-2">
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
                    <input type="date" className="control-input" value={entryDateStart} onChange={event => setEntryDateStart(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-stone-500">To Date</label>
                    <input type="date" className="control-input" value={entryDateEnd} onChange={event => setEntryDateEnd(event.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1 border-t border-stone-200/50 dark:border-stone-700/50">
                  <button
                    type="button"
                    onClick={handleArchiveParticipationsByDateRange}
                    disabled={!canManageValue || !selectedCollaborationId}
                    className="action-btn-tertiary text-xs disabled:opacity-50"
                  >
                    <Archive size={12} className="mr-1.5" />
                    Hide by Date Range
                  </button>
                  <button
                    type="button"
                    onClick={handleArchiveOldParticipations}
                    disabled={!canManageValue}
                    className="action-btn-tertiary text-xs disabled:opacity-50"
                  >
                    <Archive size={12} className="mr-1.5" />
                    Hide Legacy ({retentionDaysNumber}+d)
                  </button>
                  <button
                    type="button"
                    onClick={handleRestoreAllArchivedParticipations}
                    disabled={!canManageValue || archivedSelectedParticipations.length === 0}
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
                    disabled={!canManageValue}
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

              {/* Tabs for Participations vs Participants */}
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
                    onClick={() => setActiveTab('participants')}
                    className={cn(
                      "py-4 text-sm font-medium border-b-2 transition-all",
                      activeTab === 'participants' 
                        ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" 
                        : "border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700"
                    )}
                  >
                    Linked Participants
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-0 scrollbar-thin">
                {activeTab === 'participations' ? (
                  <div className="p-0">
                    <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
                    {filteredActiveSelectedParticipations.map(p => (
                      <MobileRecordCard
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
                            disabled={!canManageValue}
                            className="action-btn-tertiary px-2.5 py-1 text-xs disabled:opacity-50"
                          >
                            Hide
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingParticipationId(p.id)}
                            disabled={!canManageValue}
                            className="action-btn-tertiary px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </MobileRecordCard>
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
                                    disabled={!canManageValue}
                                    className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all disabled:opacity-50"
                                    title="Move to hidden repository"
                                  >
                                    <Archive size={14} />
                                  </button>
                                  <button
                                    onClick={() => setDeletingParticipationId(p.id)}
                                    disabled={!canManageValue}
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
                                          disabled={!canManageValue}
                                          className="text-emerald-600 dark:text-emerald-400 hover:underline text-[11px] font-medium mr-3"
                                        >
                                          Restore
                                        </button>
                                        <button
                                          onClick={() => setDeletingParticipationId(p.id)}
                                          disabled={!canManageValue}
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
                      {selectedCollaborationParticipants.map(participant => {
                        const participantActivityCount = entries.filter(entry => entry.unit_id === participant.id).length;
                        const lastWorkspaceDate = entries
                          .filter(entry => entry.unit_id === participant.id)
                          .map(entry => workspaces.find(workspace => workspace.id === entry.workspace_id)?.date)
                          .filter((date): date is string => Boolean(date))
                          .sort((a, b) => b.localeCompare(a))[0];

                        return (
                          <MobileRecordCard
                            key={participant.id}
                            title={participant.name}
                            right={<span className="font-mono text-sm text-stone-900 dark:text-stone-100">{formatValue(participant.total || 0)}</span>}
                            meta={<span>{participantActivityCount} activities • {lastWorkspaceDate ? formatDate(lastWorkspaceDate) : 'No activity yet'}</span>}
                          >
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500 dark:text-stone-400">
                              <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-1">Participant ID: {participant.id.slice(0, 8)}</span>
                            </div>
                          </MobileRecordCard>
                        );
                      })}
                      {selectedCollaborationParticipants.length === 0 && (
                        <div className="px-6 py-12 text-center text-stone-400 text-sm italic">No participants currently linked to this profile.</div>
                      )}
                    </div>

                    <div className="hidden md:block">
                      <table className="w-full text-left text-[13px]">
                        <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                          <tr>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px]">Participant Name</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px]">ID Reference</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Gross Total</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Activities</th>
                            <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Last Sync</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                          {selectedCollaborationParticipants.map(participant => {
                            const participantEntries = entries.filter(entry => entry.unit_id === participant.id);
                            const lastWorkspaceDate = participantEntries
                              .map(entry => workspaces.find(workspace => workspace.id === entry.workspace_id)?.date)
                              .filter((date): date is string => Boolean(date))
                              .sort((a, b) => b.localeCompare(a))[0];

                            return (
                              <tr key={participant.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                                <td className="px-6 py-3 font-medium text-stone-900 dark:text-stone-100">{participant.name}</td>
                                <td className="px-6 py-3 font-mono text-[11px] text-stone-400">{participant.id.slice(0, 8)}</td>
                                <td className="px-6 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatValue(participant.total || 0)}</td>
                                <td className="px-6 py-3 text-right font-mono text-stone-600 dark:text-stone-300">{participantEntries.length}</td>
                                <td className="px-6 py-3 text-right text-stone-400">{lastWorkspaceDate ? formatDate(lastWorkspaceDate) : 'Never'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {selectedCollaborationParticipants.length === 0 && (
                        <div className="px-6 py-12 text-center text-stone-400 text-sm italic">No linked participants found. Use the Participants module to establish links.</div>
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
              <p className="max-w-xs text-stone-500 dark:text-stone-400 text-sm mt-1">Select a profile from the directory to view operational flows, configuration, and linked participants.</p>
            </div>
          )}
        </div>
      </div>

      {deletingParticipationId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-stone-200 dark:border-stone-800 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">Remove Participation Record?</h3>
            <p className="text-stone-500 dark:text-stone-400 mt-2 text-sm">This action will reverse the participation's impact on balance totals. This process is irreversible.</p>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setDeletingParticipationId(null)}
                className="flex-1 px-4 py-2 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-600 dark:text-stone-300 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
              >
                Keep Record
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
