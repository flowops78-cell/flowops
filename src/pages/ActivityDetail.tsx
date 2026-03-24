import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { ArrowLeft, Save, Trash2, Edit2, AlertCircle, Share2, User, Circle, Clock, Users, LayoutGrid, List, Timer, Activity, Award, Play, Square } from 'lucide-react';
import { formatValue, formatDate } from '../lib/utils';
import { ActivityRecord, Entity } from '../types';
import { cn } from '../lib/utils';
import Papa from 'papaparse';
import TelemetrySidebar from '../components/TelemetrySidebar';
import ContextPanel from '../components/ContextPanel';
import EntitySnapshot from '../components/EntitySnapshot';
import CollapsibleActivitySection from '../components/CollapsibleActivitySection';
import DataActionMenu from '../components/DataActionMenu';
import { useAppRole } from '../context/AppRoleContext';
import { useNotification } from '../context/NotificationContext';
import LoadingLine from '../components/LoadingLine';
import EmptyState from '../components/EmptyState';
import { useLabels } from '../lib/labels';

export default function ActivityDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { activities, records, entities, teamMembers, activityLogs, channels, loading, loadingProgress, addUnit, requestAdjustment, addRecord, addActivityLog, endActivityLog, updateRecord, deleteRecord, updateActivity, updateUnit, addChannelRecord, transferUnits } = useData();
  const { role, canOperateLog, canManageImpact, canAlign } = useAppRole();
  const { notify } = useNotification();
  const { getActionText, tx } = useLabels();
  
  const activity = activities.find(g => g.id === id);
  const activityEntries = records.filter(l => l.activity_id === id);
  const activeActivityEntries = activityEntries.filter(record => !record.left_at);
  
  // Derived state
  const totalInflow = activityEntries.reduce((sum, e) => sum + (e.direction === 'increase' ? e.unit_amount : 0), 0);
  const totalOutflow = activityEntries.reduce((sum, e) => sum + (e.direction === 'decrease' ? e.unit_amount : 0), 0);
  const discrepancy = totalOutflow - totalInflow;
  const isTotald = Math.abs(discrepancy) < 0.01;

  // View State
  const [viewMode, setViewMode] = useState<'list' | 'activity'>('list');
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  ));
  const [viewingUnitId, setViewingUnitId] = useState<string | null>(null);

  // Form state
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [quickUnitName, setQuickUnitName] = useState('');
  const [recordValueingType, setRecordValueingType] = useState<'value' | 'deferred'>('value');
  const [recordTransferMethod, setRecordTransferMethod] = useState('');
  const [showValueingOptions, setShowValueingOptions] = useState(false);
  const [recordValue, setRecordValue] = useState('');
  const [isAddingEntity, setIsAddingEntity] = useState(false);
  const [didAddEntity, setDidAddEntity] = useState(false);
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState('');
  const [isUpdatingWorkforce, setIsUpdatingWorkforce] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [totalRecord, setTotalRecord] = useState<ActivityRecord | null>(null);
  const [totalAmount, setTotalAmount] = useState('');
  const [totalPlace, setTotalPlace] = useState('');
  const [totalMode, setTotalMode] = useState<'update' | 'sitout' | 'leave'>('update');
  const [totalAlignmentSource, setAlignmentSource] = useState('');
  const [selectedPositionNumber, setSelectedPositionNumber] = useState<number | null>(null);
  const [positionPanelEntityId, setPositionPanelUnitId] = useState('');
  const [positionPanelEntityQuery, setPositionPanelUnitQuery] = useState('');
  const [positionPanelRecord, setPositionPanelRecordValue] = useState('');
  const [positionPanelTotal, setPositionPanelTotal] = useState('');
  const [positionPanelPlace, setPositionPanelPlace] = useState('');
  const [isPositionActionPending, setIsPositionActionPending] = useState(false);
  const [isTotalActionPending, setIsTotalActionPending] = useState(false);
  const [isActivityTransitioning, setIsActivityTransitioning] = useState(false);
  const [recentTransitionStatus, setRecentTransitionStatus] = useState<'active' | 'completed' | 'archived' | null>(null);
  const addRecordSectionRef = useRef<HTMLDivElement | null>(null);
  const addUnitSelectRef = useRef<HTMLSelectElement | null>(null);
  const recordRecordInputRef = useRef<HTMLInputElement | null>(null);
  const addUnitSuccessTimerRef = useRef<number | null>(null);
  const activityTransitionSuccessTimerRef = useRef<number | null>(null);

  // Activity Operations State
  const [assignedOperator, setAssignedOperator] = useState(activity?.assigned_user_id || '');
  const [operationalWeight, setServiceFee] = useState(activity?.operational_weight?.toString() || '');
  const [channelChannel, setChannelChannel] = useState(activity?.channel_weight?.toString() || '');
  const [activityMode, setActivityMode] = useState<'value' | 'high_intensity'>(activity?.activity_mode || 'value');

  // Timer State
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [intensityLevel, setIntensityLevel] = useState(1);
  const [levelTimeRemaining, setLevelTimeRemaining] = useState('15:00');

  const viewingEntity = entities.find(p => p.id === viewingUnitId);
  const viewingEntityRecord = viewingUnitId
    ? [...activityEntries]
        .filter(record => record.entity_id === viewingUnitId)
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0]
    : undefined;

  // Update local state when activity loads
  useEffect(() => {
    if (activity) {
      setAssignedOperator(activity.assigned_user_id || '');
      setServiceFee(activity.operational_weight?.toString() || '');
      setChannelChannel(activity.channel_weight?.toString() || '');
      setActivityMode(activity.activity_mode || 'value');
    }
  }, [activity]);

  // Timer Logic
  useEffect(() => {
    if (!activity) return;

    const interval = setInterval(() => {
      // Elapsed Time
      const start = activity.start_time ? new Date(activity.start_time) : new Date(activity.date); // Fallback to date if no start time
      // If date is just YYYY-MM-DD, it defaults to midnight UTC. 
      // Ideally we should have a precise start time. For now, let's assume if start_time is missing, we use created_at, or just 0 if simulated.
      // Actually, let's use current time - start time.
      
      const startTime = activity.start_time ? new Date(activity.start_time).getTime() : new Date(activity.created_at || activity.date).getTime();
      const now = new Date().getTime();
      const diff = now - startTime;

      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setElapsedTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }

      // High Intensity Logic (Mocked for demo)
      if (activityMode === 'high_intensity') {
        // Mock levels: 15 mins each
        const levelDuration = 15 * 60 * 1000;
        const currentLevel = Math.floor(diff / levelDuration) + 1;
        setIntensityLevel(currentLevel);

        const timeInLevel = diff % levelDuration;
        const remaining = levelDuration - timeInLevel;
        const rMinutes = Math.floor(remaining / (1000 * 60));
        const rSeconds = Math.floor((remaining % (1000 * 60)) / 1000);
        setLevelTimeRemaining(`${rMinutes.toString().padStart(2, '0')}:${rSeconds.toString().padStart(2, '0')}`);
      }

    }, 1000);

    return () => clearInterval(interval);
  }, [activity, activityMode]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 640);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobileViewport && isTelemetryOpen) {
      setIsTelemetryOpen(false);
    }
  }, [isMobileViewport, isTelemetryOpen]);

  useEffect(() => () => {
    if (addUnitSuccessTimerRef.current !== null) {
      window.clearTimeout(addUnitSuccessTimerRef.current);
      addUnitSuccessTimerRef.current = null;
    }
    if (activityTransitionSuccessTimerRef.current !== null) {
      window.clearTimeout(activityTransitionSuccessTimerRef.current);
      activityTransitionSuccessTimerRef.current = null;
    }
  }, []);

  const focusAddEntity = () => {
    addRecordSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      addUnitSelectRef.current?.focus();
    }, 80);
  };

  const focusActivityRecordActivityRecord = () => {
    addRecordSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      recordRecordInputRef.current?.focus();
    }, 80);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (!action) return;

    if (action === 'add-entity') {
      focusAddEntity();
    } else if (action === 'record-record') {
      focusActivityRecordActivityRecord();
    } else if (action === 'toggle-monitor' && !isMobileViewport) {
      setIsTelemetryOpen(prev => !prev);
    } else if (action === 'complete-activity' && activity?.status === 'active') {
      void handleActivityTransition('completed');
    }

    params.delete('action');
    const nextSearch = params.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
  }, [activity?.status, isMobileViewport, location.pathname, location.search, navigate]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const normalizedKey = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        Boolean(target?.isContentEditable);

      if (isTypingTarget || event.metaKey || event.ctrlKey || event.altKey) return;
      if (totalRecord) return;

      if (normalizedKey === 'u') {
        event.preventDefault();
        focusAddEntity();
        return;
      }

      if (normalizedKey === 'e') {
        event.preventDefault();
        focusActivityRecordActivityRecord();
        return;
      }

      if (normalizedKey === 'o' && !isMobileViewport) {
        event.preventDefault();
        setIsTelemetryOpen(prev => !prev);
        return;
      }

      if (normalizedKey === 'enter' && event.shiftKey && activity?.status === 'active') {
        event.preventDefault();
        void handleActivityTransition('completed');
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [totalRecord, activity?.status, isMobileViewport]);

  const availableEntities = entities.filter(entity => !activeActivityEntries.some(record => record.entity_id === entity.id));
  const rosterPositionCandidates = availableEntities;
  const unpositionedActiveEntries = activeActivityEntries.filter(record => !record.position_id || record.position_id <= 0);
  const selectedPositionActivityRecord = selectedPositionNumber !== null
    ? activeActivityEntries.find(record => record.position_id === selectedPositionNumber) ?? null
    : null;
  const selectedPositionUnit = selectedPositionActivityRecord
    ? entities.find(unit => unit.id === selectedPositionActivityRecord.entity_id) ?? null
    : null;
  const operators = teamMembers.filter(s => s.role === 'operator' || s.role === 'admin');
  const activityWorkActivitys = activityLogs.filter(activity => activity.activity_id === activity?.id);
  const activeWorkActivityByTeamMemberId = new Map<string, typeof activityLogs[number]>();
  activityWorkActivitys.forEach(activity => {
    if (activity.status === 'active' && !activeWorkActivityByTeamMemberId.has(activity.teamMember_id ?? '')) {
      activeWorkActivityByTeamMemberId.set(activity.teamMember_id ?? '', activity);
    }
  });
  const availableOperators = teamMembers.filter(teamMember => !activeWorkActivityByTeamMemberId.has(teamMember.id));
  const isCompleted = activity?.status === 'completed';
  const isArchived = activity?.status === 'archived';
  const canAddUnits = canOperateLog && activity?.status === 'active';
  const canManageWorkforce = canOperateLog && activity?.status === 'active';
  const canManageEntries = canManageImpact && !isCompleted && !isArchived;
  const positionFinderOptions = [
    ...unpositionedActiveEntries.map(record => {
      const unit = entities.find(candidate => candidate.id === record.entity_id);
      return {
        unitId: record.entity_id,
        label: `${unit?.name || 'Unknown'} • waiting`,
        kind: 'waiting' as const,
      };
    }),
    ...rosterPositionCandidates.map(unit => ({
      unitId: unit.id,
      label: `${unit.name || 'Unnamed Entity'} • roster`,
      kind: 'roster' as const,
    })),
  ];
  const findPositionFinderOption = (query: string) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return null;

    const exactLabelMatch = positionFinderOptions.find(option => option.label.toLowerCase() === normalized);
    if (exactLabelMatch) return exactLabelMatch;

    const exactNameMatch = positionFinderOptions.find(option => {
      const unitName = entities.find(unit => unit.id === option.unitId)?.name ?? '';
      return unitName.trim().toLowerCase() === normalized;
    });
    if (exactNameMatch) return exactNameMatch;

    const prefixMatch = positionFinderOptions.find(option => option.label.toLowerCase().startsWith(normalized));
    if (prefixMatch) return prefixMatch;

    return positionFinderOptions.find(option => option.label.toLowerCase().includes(normalized)) ?? null;
  };
  const selectedPositionFinderOption = positionPanelEntityId
    ? positionFinderOptions.find(option => option.unitId === positionPanelEntityId) ?? null
    : findPositionFinderOption(positionPanelEntityQuery);
  const selectedPositionPanelUnitId = positionPanelEntityId || selectedPositionFinderOption?.unitId || '';
  const isSelectedPositionPanelUnitWaiting = !!selectedPositionPanelUnitId && unpositionedActiveEntries.some(record => record.entity_id === selectedPositionPanelUnitId);
  const hasPositionPanelQuery = positionPanelEntityQuery.trim().length > 0;
  const requiresPositionPanelrecordValue = !isSelectedPositionPanelUnitWaiting && (Boolean(selectedPositionPanelUnitId) || hasPositionPanelQuery);
  const statusClasses: Record<string, string> = {
    active: 'badge-active',
    completed: 'badge-completed',
    archived: 'badge-archived',
  };

  useEffect(() => {
    if (selectedPositionNumber === null) {
      setPositionPanelUnitId('');
      setPositionPanelUnitQuery('');
      setPositionPanelRecordValue('');
      setPositionPanelTotal('');
      setPositionPanelPlace('');
      return;
    }

    if (selectedPositionActivityRecord) {
      setPositionPanelUnitId(selectedPositionActivityRecord.entity_id);
      const selectedUnit = entities.find(unit => unit.id === selectedPositionActivityRecord.entity_id);
      setPositionPanelUnitQuery(selectedUnit?.name || '');
      setPositionPanelRecordValue('');
      setPositionPanelTotal(String(selectedPositionActivityRecord.unit_amount ?? 0));
      setPositionPanelPlace(selectedPositionActivityRecord.sort_order ? String(selectedPositionActivityRecord.sort_order) : '');
      return;
    }

    setPositionPanelUnitId('');
    setPositionPanelUnitQuery('');
    setPositionPanelRecordValue('');
    setPositionPanelTotal('');
    setPositionPanelPlace('');
  }, [entities, selectedPositionActivityRecord, selectedPositionNumber, unpositionedActiveEntries]);

  useEffect(() => {
    if (viewMode !== 'activity') {
      setSelectedPositionNumber(null);
    }
  }, [viewMode]);

  if (loading || loadingProgress > 0) {
    return (
      <div className="page-shell">
        <div className="section-card p-6">
          <LoadingLine label="Loading activity..." />
        </div>
      </div>
    );
  }

  if (!activity) {
    return <div className="p-8 text-center text-stone-500 dark:text-stone-400">Activity not found.</div>;
  }

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingEntity) return;
    if (!canAddUnits) {
      notify({ type: 'error', message: 'Your current permissions do not allow adding entities to active activities.' });
      return;
    }

    const parsedrecordValue = parseFloat(recordValue);
    if (!Number.isFinite(parsedrecordValue) || parsedrecordValue < 10) {
      notify({ type: 'error', message: 'ActivityRecord value must be at least 10.' });
      return;
    }

    if (recordValueingType === 'deferred' && !canManageImpact) {
      notify({ type: 'error', message: 'Your current permissions do not allow recording deferred entity records.' });
      return;
    }

    try {
      setIsAddingEntity(true);
      let unitId = selectedUnitId;
      if (!unitId && quickUnitName.trim()) {
        unitId = await addUnit({ name: quickUnitName.trim() });
      }

      if (!unitId) {
        notify({ type: 'error', message: 'Select an entity or enter a new entity name.' });
        return;
      }

      if (recordValueingType === 'value' && !recordTransferMethod) {
        notify({ type: 'error', message: 'Select a transfer source from Channels.' });
        return;
      }

      await addRecord({
        activity_id: activity.id,
        entity_id: unitId,
        unit_amount: parsedrecordValue,
        direction: 'increase',
        status: 'applied',
        position_id: undefined,
        notes: recordValueingType === 'value' ? `Channel: ${recordTransferMethod}` : 'Deferred record',
      });

      // Direct channel movement only applies to immediate value valueing.
      if (recordValueingType === 'value' && recordTransferMethod && parsedrecordValue > 0) {
        try {
          await addChannelRecord({
            type: 'decrement',
            amount: parsedrecordValue,
            method: recordTransferMethod,
            date: new Date().toISOString().split('T')[0],
          });
        } catch (error) {
          notify({ type: 'warning', message: 'ActivityRecord added but channel sync failed. ActivityRecord manually.' });
        }
      }

      if (recordValueingType === 'deferred' && parsedrecordValue > 0) {
        await requestAdjustment({
          entity_id: unitId,
          amount: parsedrecordValue,
          type: 'input',
          requested_at: new Date().toISOString(),
        });
      }

      setSelectedUnitId('');
      setQuickUnitName('');
      setRecordValueingType('value');
      setRecordTransferMethod('');
      setShowValueingOptions(false);
      setRecordValue('');
      setDidAddEntity(true);
      if (addUnitSuccessTimerRef.current !== null) {
        window.clearTimeout(addUnitSuccessTimerRef.current);
      }
      addUnitSuccessTimerRef.current = window.setTimeout(() => {
        setDidAddEntity(false);
        addUnitSuccessTimerRef.current = null;
      }, 2000);
      notify({
        type: 'success',
        message: recordValueingType === 'deferred' ? 'Entity record recorded and deferred record sent for admin approval.' : 'Entity record recorded.',
      });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to record entity record.' });
    } finally {
      setIsAddingEntity(false);
    }
  };

  const normalizeValueInput = (value: string, setValue: (next: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    setValue(parsed.toFixed(2));
  };

  const handleUpdateOperations = async () => {
    if (!canManageImpact) {
      notify({ type: 'error', message: 'Only admin/operator can update operations.' });
      return;
    }
    if (isCompleted || isArchived) {
      notify({ type: 'error', message: 'Completed or archived activities are locked.' });
      return;
    }
    try {
      await updateActivity({
        ...activity,
        assigned_user_id: assignedOperator,
        operational_weight: parseFloat(operationalWeight) || 0,
        channel_weight: parseFloat(channelChannel) || 0,
        activity_mode: activityMode
      });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to update operations.' });
    }
  };

  const handleSetStartTimeNow = async () => {
    if (!canOperateLog) {
      notify({ type: 'error', message: 'Current role cannot update activity timing.' });
      return;
    }
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const localStart = new Date(`${activity.date}T${hours}:${minutes}:00`);

    if (Number.isNaN(localStart.getTime())) {
      notify({ type: 'error', message: 'Unable to set start time for this activity date.' });
      return;
    }

    try {
      await updateActivity({
        ...activity,
        start_time: localStart.toISOString(),
      });
      notify({ type: 'success', message: 'Start time set successfully.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to set start time.' });
    }
  };

  const handleActivityTransition = async (nextStatus: 'active' | 'completed' | 'archived') => {
    if (isActivityTransitioning) return;
    if ((nextStatus === 'active' || nextStatus === 'archived') && !canOperateLog) {
      notify({ type: 'error', message: 'Current role cannot change activity state.' });
      return;
    }
    if (nextStatus === 'completed') {
      if (!canAlign) {
        notify({ type: 'error', message: 'Only admin/operator can complete activities.' });
        return;
      }
      if (!isTotald) {
        notify({ type: 'error', message: 'Activity must be totald before completion.' });
        return;
      }
    }

    try {
      setIsActivityTransitioning(true);
      await updateActivity({ ...activity, status: nextStatus });
      notify({ type: 'success', message: `Activity marked as ${nextStatus}.` });
      setRecentTransitionStatus(nextStatus);
      if (activityTransitionSuccessTimerRef.current !== null) {
        window.clearTimeout(activityTransitionSuccessTimerRef.current);
      }
      activityTransitionSuccessTimerRef.current = window.setTimeout(() => {
        setRecentTransitionStatus(null);
        activityTransitionSuccessTimerRef.current = null;
      }, 2000);
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || `Unable to mark activity as ${nextStatus}.` });
    } finally {
      setIsActivityTransitioning(false);
    }
  };

  const guardedUpdateActivityRecord = async (record: ActivityRecord) => {
    if (!canManageEntries) {
      notify({ type: 'error', message: 'Entries changes are restricted to admin/operator before alignment.' });
      return;
    }
    await updateRecord(record);
  };

  const openTeamMemberActivity = async () => {
    if (!activity || !selectedTeamMemberId) return;
    if (!canManageWorkforce) {
      notify({ type: 'error', message: 'Activity logs can only be updated while this activity is active.' });
      return;
    }
 
    try {
      setIsUpdatingWorkforce(true);
      await addActivityLog({
        teamMember_id: selectedTeamMemberId,
        activity_id: activity.id,
        start_time: new Date().toISOString(),
        status: 'active',
      });
      setSelectedTeamMemberId('');
      notify({ type: 'success', message: 'Activity log opened.' });
    } catch (error: any) {
      notify({ type: 'error', message: 'Unable to open activity log.' });
    } finally {
      setIsUpdatingWorkforce(false);
    }
  };
 
  const closeTeamMemberActivity = async (activityId: string, teamMemberId: string) => {
    if (!canManageWorkforce) {
      notify({ type: 'error', message: 'Activity logs can only be updated while this activity is active.' });
      return;
    }
    const teamMember = teamMembers.find(item => item.id === teamMemberId);
    const activityLog = activityWorkActivitys.find(item => item.id === activityId);
    if (!activityLog || !teamMember) return;

    const endTime = new Date().toISOString();
    const startTime = activityLog.start_time ? new Date(activityLog.start_time).getTime() : new Date().getTime();
    const durationHours = Math.max(0, (new Date(endTime).getTime() - startTime) / (1000 * 60 * 60));
    const pay = teamMember.arrangement_type === 'hourly' && typeof (teamMember.overhead_weight ?? teamMember.service_rate) === 'number'
      ? durationHours * (teamMember.overhead_weight ?? teamMember.service_rate ?? 0)
      : undefined;

    try {
      setIsUpdatingWorkforce(true);
      await endActivityLog(activity.id, endTime, durationHours, pay);
      notify({ type: 'success', message: 'Activity log closed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to close activity log.' });
    } finally {
      setIsUpdatingWorkforce(false);
    }
  };

  const guardedDeleteActivityRecord = async (recordId: string) => {
    if (!canManageEntries) {
      notify({ type: 'error', message: 'Entries changes are restricted to admin/operator before alignment.' });
      return;
    }
    await deleteRecord(recordId);
  };

  const handleUpdateEntityTags = async (id: string, tags: string[]) => {
    const entity = entities.find(p => p.id === id);
    if (entity && updateUnit) {
      await updateUnit({ ...entity, tags });
    }
  };

  const generateReport = () => {
    const lines = [
      `*Activity Report - ${formatDate(activity.date)}*`,
      `Channel: ${activity.channel_label || 'N/A'} • Activity: ${activity.label || 'N/A'}`,
      `------------------`,
      `*Entities:*`
    ];

    activityEntries.forEach(record => {
      const unit = entities.find(p => p.id === record.entity_id);
      const net = (record.direction === 'increase' ? record.unit_amount : -record.unit_amount);
      const symbol = net > 0 ? '🟢' : net < 0 ? '🔴' : '⚪️';
      lines.push(`${symbol} ${unit?.name}: ${net > 0 ? '+' : ''}${formatValue(net)}`);
    });

    lines.push(`------------------`);
    lines.push(`*Total Inflow:* ${formatValue(totalInflow)}`);
    if (operationalWeight) lines.push(`*Service Total:* ${formatValue(parseFloat(operationalWeight))}`);
    if (!isTotald) lines.push(`⚠️ *Discrepancy:* ${formatValue(discrepancy)}`);

    return lines.join('\n');
  };

  const copyReport = () => {
    navigator.clipboard.writeText(generateReport());
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const shareToWhatsapp = () => {
    const text = encodeURIComponent(generateReport());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareToTelegram = () => {
    const text = encodeURIComponent(generateReport());
    window.open(`https://t.me/share/url?url=&text=${text}`, '_blank');
  };



  const openTotalModal = (record: ActivityRecord) => {
    if (!canManageEntries) {
      notify({ type: 'error', message: 'Total updates are restricted to admin/operator before alignment.' });
      return;
    }
    setTotalRecord(record);
    setTotalAmount(record.unit_amount.toString());
    setTotalPlace(record.sort_order?.toString() || '');
    setTotalMode('update');
  };

  const openSitOutModal = (record: ActivityRecord) => {
    if (isPositionActionPending || isTotalActionPending) {
      notify({ type: 'info', message: 'Please wait for the current position/total action to finish.' });
      return;
    }
    if (!canManageEntries) {
      notify({ type: 'error', message: 'Leave position is restricted to admin/operator before alignment.' });
      return;
    }
    if (record.left_at) {
      notify({ type: 'error', message: 'Entity already marked as left.' });
      return;
    }

    setTotalRecord(record);
    setTotalAmount(record.unit_amount.toString());
    setTotalPlace(record.sort_order?.toString() || '');
    setTotalMode('sitout');
  };

  const openLeaveModal = (record: ActivityRecord) => {
    if (isPositionActionPending || isTotalActionPending) {
      notify({ type: 'info', message: 'Please wait for the current position/total action to finish.' });
      return;
    }
    if (!canManageEntries) {
      notify({ type: 'error', message: 'Leave position is restricted to admin/operator before alignment.' });
      return;
    }
    if (record.left_at) {
      notify({ type: 'error', message: 'Entity already marked as left.' });
      return;
    }

    setTotalRecord(record);
    setTotalAmount(record.unit_amount.toString());
    setTotalPlace(record.sort_order?.toString() || '');
    setTotalMode('leave');
  };

  const getNextAvailablePosition = (excludeActivityRecordId?: string) => {
    const takenPositions = activeActivityEntries
      .filter(record => record.id !== excludeActivityRecordId)
      .map(record => record.position_id)
      .filter((position): position is number => typeof position === 'number' && position > 0);

    let positionNumber = 1;
    while (takenPositions.includes(positionNumber)) {
      positionNumber += 1;
    }
    return positionNumber;
  };

  const handlePositionUnit = async (record: ActivityRecord) => {
    if (!canManageEntries) {
      notify({ type: 'error', message: 'Position assignment is restricted to admin/operator before alignment.' });
      return;
    }

    if (record.left_at) {
      notify({ type: 'error', message: 'Cannot position an entity already marked as left.' });
      return;
    }

    if (record.position_id && record.position_id > 0) {
      notify({ type: 'info', message: `Entity is already positioned at #${record.position_id}.` });
      return;
    }

    const nextPosition = getNextAvailablePosition(record.id);
    try {
      await updateRecord({ ...record, position_id: nextPosition });
      notify({ type: 'success', message: `Entity positioned at #${nextPosition}.` });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to assign position.' });
    }
  };

  const handleAssignPosition = async (record: ActivityRecord, nextPosition: number | null) => {
    if (isPositionActionPending) return;

    if (!canManageEntries) {
      notify({ type: 'error', message: 'Position assignment is restricted to admin/operator before alignment.' });
      return;
    }

    if (record.left_at) {
      notify({ type: 'error', message: 'Cannot change position for an entity already marked as left.' });
      return;
    }

    if (nextPosition === null) {
      if (!record.position_id || record.position_id <= 0) {
        notify({ type: 'info', message: 'Entity is already unpositioned.' });
        return;
      }
      try {
        setIsPositionActionPending(true);
        await updateRecord({ ...record, position_id: undefined });
        notify({ type: 'success', message: 'Entity moved to waiting / sat-out area.' });
      } catch (error: any) {
        notify({ type: 'error', message: error?.message || 'Unable to set entity to waiting/sat-out.' });
      } finally {
        setIsPositionActionPending(false);
      }
      return;
    }

    if (!Number.isFinite(nextPosition) || nextPosition <= 0) {
      notify({ type: 'error', message: 'Position must be a positive number.' });
      return;
    }

    const conflictingActivityRecord = activeActivityEntries.find(
      activeActivityRecord => activeActivityRecord.id !== record.id && activeActivityRecord.position_id === nextPosition,
    );

    if (conflictingActivityRecord) {
      const conflictingUnitName = entities.find(unit => unit.id === conflictingActivityRecord.entity_id)?.name || 'Another entity';
      notify({ type: 'error', message: `Position #${nextPosition} is already occupied by ${conflictingUnitName}.` });
      return;
    }

    if (record.position_id === nextPosition) {
      notify({ type: 'info', message: `Entity is already at position #${nextPosition}.` });
      return;
    }

    try {
      setIsPositionActionPending(true);
      await updateRecord({ ...record, position_id: nextPosition });
      notify({ type: 'success', message: `Entity moved to position #${nextPosition}.` });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to update position assignment.' });
    } finally {
      setIsPositionActionPending(false);
    }
  };

  const handleAssignWaitingUnitToSelectedPosition = async () => {
    if (selectedPositionNumber === null) return;
    const normalizedQuery = positionPanelEntityQuery.trim().toLowerCase();

    let targetUnitId = selectedPositionPanelUnitId;
    if (!targetUnitId && normalizedQuery) {
      const exactNameMatches = entities.filter(entity => (entity.name || '').trim().toLowerCase() === normalizedQuery);
      if (exactNameMatches.length === 1) {
        targetUnitId = exactNameMatches[0].id;
      } else if (exactNameMatches.length > 1) {
        notify({ type: 'error', message: 'Multiple entities match that name. Choose a specific suggestion from the finder list.' });
        return;
      }

      if (!targetUnitId) {
        const rosterContainsMatches = rosterPositionCandidates.filter(entity => (entity.name || '').toLowerCase().includes(normalizedQuery));
        if (rosterContainsMatches.length === 1) {
          targetUnitId = rosterContainsMatches[0].id;
        } else if (rosterContainsMatches.length > 1) {
          notify({ type: 'error', message: 'Multiple roster entities match that text. Choose a specific suggestion from the finder list.' });
          return;
        }
      }
    }

    if (!targetUnitId) {
      notify({ type: 'error', message: 'Select a waiting/sat-out entity, or type a valid roster entity name.' });
      return;
    }

    const occupiedActivityRecord = activeActivityEntries.find(record => record.position_id === selectedPositionNumber);
    if (occupiedActivityRecord) {
      const occupiedBy = entities.find(unit => unit.id === occupiedActivityRecord.entity_id)?.name || 'another entity';
      notify({ type: 'error', message: `Position #${selectedPositionNumber} is already occupied by ${occupiedBy}.` });
      return;
    }

    const existingActiveActivityRecord = activeActivityEntries.find(record => record.entity_id === targetUnitId);
    if (existingActiveActivityRecord) {
      await handleAssignPosition(existingActiveActivityRecord, selectedPositionNumber);
      setSelectedPositionNumber(null);
      return;
    }

    const waitingActivityRecord = unpositionedActiveEntries.find(record => record.entity_id === targetUnitId);
    if (waitingActivityRecord) {
      await handleAssignPosition(waitingActivityRecord, selectedPositionNumber);
      setSelectedPositionNumber(null);
      return;
    }

    const historicalActivityRecord = activityEntries.find(record => record.entity_id === targetUnitId && !!record.left_at);
    if (historicalActivityRecord) {
      if (!canAddUnits) {
        notify({ type: 'error', message: 'Activity must be active and permissions must allow adding/re-positioning entities.' });
        return;
      }

      const parsedActivityRecordVal = parseFloat(positionPanelRecord);
      if (!Number.isFinite(parsedActivityRecordVal) || parsedActivityRecordVal < 10) {
        notify({ type: 'error', message: 'ActivityRecord value must be at least 10 to re-position this entity.' });
        return;
      }

      try {
        setIsPositionActionPending(true);
        await updateRecord({
          ...historicalActivityRecord,
          unit_amount: historicalActivityRecord.unit_amount + parsedActivityRecordVal,
          left_at: undefined,
          position_id: selectedPositionNumber,
        });
      setPositionPanelRecordValue('');
        setPositionPanelUnitId('');
        setPositionPanelUnitQuery('');
        setSelectedPositionNumber(null);
        notify({ type: 'success', message: 'Entity re-positioned with additional record value.' });
      } catch (error: any) {
        notify({ type: 'error', message: error?.message || 'Unable to re-position entity from previous activity row.' });
      } finally {
        setIsPositionActionPending(false);
      }
      return;
    }

    const rosterUnit = rosterPositionCandidates.find(unit => unit.id === targetUnitId);
    if (!rosterUnit) {
      const hasHistoricalActivityRecord = activityEntries.some(record => record.entity_id === targetUnitId);
      if (hasHistoricalActivityRecord) {
        notify({ type: 'error', message: 'This entity already has an record row in this activity. Re-position the existing row instead of adding from roster.' });
      } else {
        notify({ type: 'error', message: 'Select a valid waiting or roster entity from finder suggestions.' });
      }
      return;
    }

    if (activeActivityEntries.some(record => record.entity_id === targetUnitId)) {
      notify({ type: 'error', message: 'Entity is already active in this activity.' });
      return;
    }

    if (!canAddUnits) {
      notify({ type: 'error', message: 'Activity must be active and permissions must allow adding entities.' });
      return;
    }

    const parsedActivityRecordVal = parseFloat(positionPanelRecord);
    if (!Number.isFinite(parsedActivityRecordVal) || parsedActivityRecordVal < 10) {
      notify({ type: 'error', message: 'ActivityRecord value must be at least 10 to position a roster entity.' });
      return;
    }

    try {
      setIsPositionActionPending(true);
      await addRecord({
        activity_id: activity.id,
        entity_id: rosterUnit.id,
        unit_amount: parsedActivityRecordVal,
        direction: 'increase',
        status: 'applied',
        position_id: selectedPositionNumber,
      });
      setPositionPanelRecordValue('');
      setPositionPanelUnitId('');
      setPositionPanelUnitQuery('');
      setSelectedPositionNumber(null);
      notify({ type: 'success', message: `${rosterUnit.name || 'Entity'} added and positioned at #${selectedPositionNumber}.` });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to add and position selected entity.' });
    } finally {
      setIsPositionActionPending(false);
    }
  };

  const handleActivityPositionTotalSave = async () => {
    if (isTotalActionPending) return;

    if (!selectedPositionActivityRecord || !canManageEntries) {
      notify({ type: 'error', message: 'Only admin/operator can update totals before alignment.' });
      return;
    }

    const parsedTotal = parseFloat(positionPanelTotal);
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      notify({ type: 'error', message: 'Total amount must be a valid non-negative number.' });
      return;
    }

    const updates: ActivityRecord = {
      ...selectedPositionActivityRecord,
      unit_amount: parsedTotal,
      sort_order:
        activityMode === 'high_intensity'
          ? (positionPanelPlace.trim() ? parseInt(positionPanelPlace, 10) : undefined)
          : selectedPositionActivityRecord.sort_order,
    };

    if (activityMode === 'high_intensity' && positionPanelPlace.trim()) {
      const parsedPlace = parseInt(positionPanelPlace, 10);
      if (!Number.isFinite(parsedPlace) || parsedPlace <= 0) {
        notify({ type: 'error', message: 'Event position must be a positive integer.' });
        return;
      }
      updates.sort_order = parsedPlace;
    }

    try {
      setIsTotalActionPending(true);
      await updateRecord(updates);
      notify({ type: 'success', message: 'Position total updated from position view.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to update position total.' });
    } finally {
      setIsTotalActionPending(false);
    }
  };

  const handleConfirmTotalUpdate = async () => {
    if (isTotalActionPending) return;
    if (!totalRecord) return;
    if (!canManageEntries) {
      notify({ type: 'error', message: 'Total updates are restricted to admin/operator before alignment.' });
      return;
    }

    const latestActivityRecord = records.find(record => record.id === totalRecord.id) ?? totalRecord;
    if (latestActivityRecord.left_at) {
      setTotalRecord(null);
      notify({ type: 'info', message: 'Entity is already marked as left.' });
      return;
    }

    const parsedAmount = parseFloat(totalAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      notify({ type: 'error', message: 'Total amount must be a valid non-negative number.' });
      return;
    }

    const updates: Partial<ActivityRecord> = {
      unit_amount: parsedAmount,
    };

    if (totalMode === 'sitout') {
      updates.position_id = undefined;
    }

    if (totalMode === 'leave') {
      updates.left_at = new Date().toISOString();
      updates.position_id = undefined;
    }

    if (activityMode === 'high_intensity') {
      if (totalPlace.trim()) {
        const parsedPlace = parseInt(totalPlace, 10);
        if (!Number.isFinite(parsedPlace) || parsedPlace <= 0) {
          notify({ type: 'error', message: 'Event position must be a positive integer.' });
          return;
        }
        updates.sort_order = parsedPlace;
      } else {
        updates.sort_order = undefined;
      }
    }

    try {
      setIsTotalActionPending(true);
      await updateRecord({ ...latestActivityRecord, ...updates });

      let alignmentAlertCreated = false;
      if (totalMode === 'leave' && parsedAmount > 0) {
        try {
          await requestAdjustment({
            entity_id: latestActivityRecord.entity_id,
            amount: parsedAmount,
            activity_id: activity.id,
            alignment_source: totalAlignmentSource || undefined
          });
          alignmentAlertCreated = true;
        } catch {
          notify({
            type: 'error',
            message: 'Entity marked as inactive, but alignment request could not be submitted.',
          });
        }
      }

      setTotalRecord(null);
      setTotalAmount('');
      setTotalPlace('');
      setAlignmentSource('');
      notify({
        type: 'success',
        message: totalMode === 'sitout'
            ? 'Entity moved to standby.'
          : totalMode === 'leave'
          ? (alignmentAlertCreated
              ? 'Entity marked as inactive. Alignment request submitted.'
              : 'Entity marked as inactive with final total.')
          : 'Total updated successfully.',
      });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to save total update.' });
    } finally {
      setIsTotalActionPending(false);
    }
  };

    return (
      <div className="space-y-6 animate-in fade-in pb-20 lg:pb-0 relative">
        {!isMobileViewport && (
          <TelemetrySidebar 
            activity={activity} 
            records={activityEntries} 
            entities={entities} 
            isOpen={isTelemetryOpen} 
            onClose={() => setIsTelemetryOpen(false)} 
          />
        )}

        <ContextPanel isOpen={!!viewingUnitId} onClose={() => setViewingUnitId(null)}>
          {viewingEntity && (
            <EntitySnapshot 
              entity={viewingEntity} 
              type="entity"
              onClose={() => setViewingUnitId(null)}
              onUpdateTags={handleUpdateEntityTags}
              activityNet={activityEntries.filter(e => e.entity_id === viewingUnitId).reduce((sum, e) => sum + (e.direction === 'increase' ? e.unit_amount : -e.unit_amount), 0)}
              variant="sidebar"
            />
          )}
        </ContextPanel>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <button 
            onClick={() => navigate('/activity')}
            className="flex items-center gap-2 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 transition-colors"
          >
            <ArrowLeft size={18} />
            Back to Activity
          </button>

          <div className="toolbar-surface w-full sm:w-auto justify-end">
            {!isMobileViewport && (
              <button 
                onClick={() => setIsTelemetryOpen(!isTelemetryOpen)}
                aria-label="Toggle activity monitor"
                className={cn(
                  "action-pill",
                  isTelemetryOpen 
                    ? "action-pill-strong" 
                    : "action-pill-neutral"
                )}
                title="Activity Monitor (M)"
              >
                <Activity size={14} />
                <span className="hidden sm:inline">Activity Monitor</span>
              </button>
            )}
            <DataActionMenu
              label={isCopied ? 'Exported' : 'Export'}
              className="text-xs"
              items={[

                { key: 'copy-report', label: 'Copy Report', onClick: copyReport },
                { key: 'share-whatsapp', label: 'Share via WhatsApp', onClick: shareToWhatsapp },
                { key: 'share-telegram', label: 'Share via Telegram', onClick: shareToTelegram },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-light text-stone-900 dark:text-stone-100">{formatDate(activity.date)}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500 dark:text-stone-400">
              <span className="flex items-center gap-1">
                <span className="font-medium text-stone-700 dark:text-stone-300">Platform:</span> {activity.channel_label || 'Unknown'}
              </span>
              <span className="flex items-center gap-1">
                <span className="font-medium text-stone-700 dark:text-stone-300">Format:</span> {activity.label || 'Standard'}
              </span>
            </div>
          </div>

          <div className={cn(
            'px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 self-start',
            isTotald
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
          )}>
            {isTotald ? (
              'Totaled'
            ) : (
              <>
                <AlertCircle size={16} />
                Discrepancy: {formatValue(discrepancy)}
              </>
            )}
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          <div ref={addRecordSectionRef} className="section-card p-5 lg:p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="font-medium text-stone-900 dark:text-stone-100">Add Entity</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">Entities can be added while the activity is active. Select an existing entity or enter a new name.</p>
              </div>
            </div>

            {!canAddUnits && (
              <p className="text-xs mb-4 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2.5 py-2">
                {activity.status !== 'active'
                  ? 'This form is locked until the activity is active. Use Activate activity in Operations.'
                  : (isCompleted || isArchived)
                    ? 'This form is locked because the activity is completed or archived.'
                    : 'Your current permissions do not allow adding entities to this activity.'}
              </p>
            )}

            <form onSubmit={handleAddUnit} className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.9fr_auto] gap-3 items-start">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    ref={addUnitSelectRef}
                    className="control-input"
                    value={selectedUnitId}
                    onChange={e => {
                      setSelectedUnitId(e.target.value);
                      if (e.target.value) setQuickUnitName('');
                    }}
                    disabled={!canAddUnits}
                  >
                    <option value="">Select Entity or enter a new name</option>
                    {availableEntities.map(p => (
                      <option key={p.id} value={p.id}>{p.name || 'Unnamed Entity'}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="control-input"
                    placeholder="username"
                    value={quickUnitName}
                    onChange={e => {
                      setQuickUnitName(e.target.value);
                      if (e.target.value.trim()) setSelectedUnitId('');
                    }}
                    disabled={!canAddUnits}
                  />
                </div>

                <div className="flex items-center rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 overflow-hidden focus-within:ring-2 focus-within:ring-stone-500">
                  <input
                    ref={recordRecordInputRef}
                    type="number"
                    step="0.01"
                    min="10"
                    className="w-full bg-transparent border-0 px-3 py-2.5 text-stone-900 dark:text-stone-100 focus:outline-none"
                    placeholder="Entity Input"
                    value={recordValue} onChange={e => setRecordValue(e.target.value)} onBlur={() => normalizeValueInput(recordValue, setRecordValue)}
                    disabled={!canAddUnits}
                  />
                </div>

                <button
                  type="submit"
                  className="action-btn-primary justify-center min-h-[42px] w-full lg:w-auto"
                  disabled={isAddingEntity || (!selectedUnitId && !quickUnitName.trim()) || !canAddUnits || !recordValue.trim()}
                  title="ActivityRecord ActivityRecord (E)"
                >
                  {isAddingEntity ? 'ActivityRecording…' : didAddEntity ? 'ActivityRecorded ✓' : 'ActivityRecord ActivityRecord'}
                </button>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowValueingOptions(prev => !prev)}
                  className="action-btn-tertiary px-2.5 py-1.5 text-xs"
                  disabled={!canAddUnits || isAddingEntity}
                >
                  {showValueingOptions ? 'Hide Valueing Options' : 'Valueing Options'}
                </button>
              </div>

              {showValueingOptions && (
                <div className="space-y-3">
                  <select
                    className="control-input max-w-sm"
                    value={recordValueingType}
                    onChange={e => setRecordValueingType(e.target.value as 'value' | 'deferred')}
                    disabled={!canAddUnits}
                  >
                    <option value="value">Valueing: Immediate</option>
                    <option value="deferred">Valueing: Deferred (admin aligns later)</option>
                  </select>
                  <div className="max-w-sm">
                    <label className="block text-xs text-stone-500 dark:text-stone-400 mb-1">
                      Channel Source <span className="text-stone-400">({recordValueingType === 'value' ? 'required for direct valueing' : 'optional for deferred valueing'})</span>
                    </label>
                    <select
                      className="control-input w-full"
                      value={recordTransferMethod}
                      onChange={e => setRecordTransferMethod(e.target.value)}
                      disabled={!canAddUnits}
                      required={recordValueingType === 'value'}
                    >
                      <option value="">{recordValueingType === 'value' ? 'Select transfer source...' : 'No channel source needed'}</option>
                      {channels.filter(c => c.is_active).map(c => (
                        <option key={c.id} value={`${c.category}::${c.name}`}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </form>
          </div>

          <div className="section-card p-5 lg:p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="font-medium text-stone-900 dark:text-stone-100">Workforce</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">Activity activityLogs are always tied to this activity.</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                {activityWorkActivitys.length} activity activityLogs
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mb-4">
              <select
                className="control-input"
                value={selectedTeamMemberId}
                onChange={event => setSelectedTeamMemberId(event.target.value)}
                disabled={!canManageWorkforce || isUpdatingWorkforce}
              >
                <option value="">Select Operator...</option>
                {availableOperators.map(teamMember => (
                  <option key={teamMember.id} value={teamMember.id}>{teamMember.name || 'Unnamed Operator'}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { void openTeamMemberActivity(); }}
                disabled={!canManageWorkforce || isUpdatingWorkforce || !selectedTeamMemberId}
                className="action-btn-primary justify-center"
              >
                <Play size={14} />
                {isUpdatingWorkforce ? 'Updating…' : 'Open Activity Log'}
              </button>
            </div>

            <div className="space-y-2">
              {activityWorkActivitys.length === 0 && (
                <p className="text-sm text-stone-500 dark:text-stone-400">No activity activityLogs yet.</p>
              )}
              {activityWorkActivitys.map(activity => {
                const teamMember = teamMembers.find(item => item.id === activity.teamMember_id);
                const windowLabel = `${(activity.start_time ? new Date(activity.start_time) : new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${activity.end_time ? new Date(activity.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}`;
                return (
                  <div key={activity.id} className="rounded-lg border border-stone-200 dark:border-stone-800 px-3 py-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Assigned Operator</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">{windowLabel} · {activity.duration_hours ? `${activity.duration_hours.toFixed(2)}h` : tx('in progress')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                        activity.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                      )}>
                        {activity.status}
                      </span>
                      {activity.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => { void closeTeamMemberActivity(activity.id, activity.teamMember_id ?? ''); }}
                          disabled={!canManageWorkforce || isUpdatingWorkforce}
                          className="action-btn-secondary text-xs"
                        >
                          <Square size={12} />
                          End
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="p-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 flex justify-between items-center">
              <h3 className="font-medium text-stone-900 dark:text-stone-100">Entries</h3>
              <div className="text-sm text-stone-500 dark:text-stone-400">
                Total Entity Input: <span className="font-mono font-medium text-stone-900 dark:text-stone-100">{formatValue(totalInflow)}</span>
              </div>
            </div>

            <CollapsibleActivitySection
              title="Activity Entries"
              summary={activityEntries.length === 0 ? 'No activity recorded' : `${activityEntries.length} records`}
              defaultExpanded={false}
              maxExpandedHeightClass="max-h-[560px]"
              maxCollapsedHeightClass="max-h-[96px]"
              contentClassName="border-t border-stone-200 dark:border-stone-800"
            >
            {activityEntries.length === 0 ? (
              <EmptyState
                title="No records yet"
                description="No entity records have been recorded yet."
                actionLabel="Add ActivityRecord"
                onAction={() => addRecordSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              />
            ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 font-medium border-b border-stone-100 dark:border-stone-800">
                <tr>
                  <th className="px-6 py-3">Entity</th>
                  <th className="px-6 py-3 text-right">Entity Input</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-right">Delta</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {activityEntries.map(record => (
                  <EntriesRow 
                    key={record.id} 
                    record={record} 
                    entity={entities.find(p => p.id === record.entity_id)!}
                    updateRecord={guardedUpdateActivityRecord}
                    deleteRecord={guardedDeleteActivityRecord}
                    isHighIntensity={activityMode === 'high_intensity'}
                    onViewEntity={(id) => setViewingUnitId(id)}
                    onTotalUpdate={openTotalModal}
                    onSitOut={openSitOutModal}
                    onLeave={openLeaveModal}
                    canManageImpact={canManageEntries}
                    isTotalActionPending={isTotalActionPending}
                    onNotify={notify}
                  />
                ))}
              </tbody>
                <tfoot className="bg-stone-50 dark:bg-stone-800/50 font-medium text-stone-900 dark:text-stone-100">
                  <tr>
                    <td className="px-6 py-3">Totals</td>
                    <td className="px-6 py-3 text-right font-mono">{formatValue(totalInflow)}</td>
                    <td className="px-6 py-3 text-right font-mono">{formatValue(totalOutflow)}</td>
                    <td className={cn(
                      "px-6 py-3 text-right font-mono",
                      discrepancy === 0 ? "text-stone-900 dark:text-stone-100" : "text-red-600 dark:text-red-400"
                    )}>
                      {formatValue(totalOutflow - totalInflow)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
            </table>
            )}
            </CollapsibleActivitySection>
          </div>
        </div>

        {/* Sidebar Panels */}
        <div className="space-y-6">
          {/* Operations Panel */}
          <div className="bg-white dark:bg-stone-900 p-4 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 space-y-6">
            <h3 className="font-medium mb-3 text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <User size={18} />
              Operations
            </h3>
            <div className="mb-3 rounded-2xl border border-stone-200/80 bg-stone-50/80 p-3 dark:border-stone-800 dark:bg-stone-800/40">
              <div className="grid grid-cols-1 gap-2">
                {activity.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => handleActivityTransition('completed')}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-red-200 dark:border-red-900/70 bg-white dark:bg-stone-900 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                    disabled={isActivityTransitioning || !canAlign || !isTotald}
                    title="Complete Activity (TeamMemberActivity+Enter)"
                  >
                    {isActivityTransitioning
                      ? 'Completing…'
                      : recentTransitionStatus === 'completed'
                        ? 'Completed ✓'
                        : 'Complete activity'}
                  </button>
                )}
                {activity.status === 'completed' && (
                  <button
                    type="button"
                    onClick={() => handleActivityTransition('archived')}
                    className="action-btn-secondary justify-center min-h-[44px]"
                    disabled={isActivityTransitioning || !canOperateLog}
                  >
                    {isActivityTransitioning
                      ? 'Archiving…'
                      : recentTransitionStatus === 'archived'
                        ? 'Archived ✓'
                        : 'Archive activity'}
                  </button>
                )}
                {activity.status === 'archived' && (
                  <button
                    type="button"
                    onClick={() => handleActivityTransition('active')}
                    className="action-btn-secondary justify-center min-h-[44px]"
                    disabled={isActivityTransitioning || !canOperateLog}
                  >
                    {isActivityTransitioning
                      ? 'Restoring…'
                      : recentTransitionStatus === 'active'
                        ? 'Restored ✓'
                        : 'Restore activity'}
                  </button>
                )}
              </div>
              {activity.status === 'active' && (
                <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                  Complete this activity once all records are recorded.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-1 gap-3">

              <div>
                <label className="text-xs font-medium text-stone-500 dark:text-stone-400 block mb-1">{tx('Assigned Operator')}</label>
                <select 
                  className="w-full px-2 py-1.5 border border-stone-200 dark:border-stone-700 rounded-md bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm"
                  value={assignedOperator}
                  onChange={e => setAssignedOperator(e.target.value)}
                  onBlur={handleUpdateOperations}
                  disabled={!canManageImpact || isCompleted || isArchived}
                >
                  <option value="">{tx('Select Operator...')}</option>
                  {operators.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>


        </div>
      </div>

      {totalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-stone-200 dark:border-stone-800">
              <h3 className="font-medium text-stone-900 dark:text-stone-100">{totalMode === 'sitout' ? 'Move To Standby' : totalMode === 'leave' ? tx('Mark Activity Exit') : 'Update Position Total'}</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                {entities.find(p => p.id === totalRecord.entity_id)?.name || 'Entity'}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-500 dark:text-stone-400 block mb-1">{totalMode === 'sitout' ? 'Total At Standby' : totalMode === 'leave' ? 'Final Total At Exit' : 'Current Total'}</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full p-2 border border-stone-200 dark:border-stone-700 rounded-md bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                />
              </div>
              {activityMode === 'high_intensity' && (
                <div>
                  <label className="text-xs font-medium text-stone-500 dark:text-stone-400 block mb-1">Event Position (Optional)</label>
                  <input
                    type="number"
                    className="w-full p-2 border border-stone-200 dark:border-stone-700 rounded-md bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                    value={totalPlace}
                    onChange={e => setTotalPlace(e.target.value)}
                    placeholder="e.g. 1"
                  />
                </div>
              )}
              {totalMode === 'leave' && (
                <div>
                  <label className="text-xs font-medium text-stone-500 dark:text-stone-400 block mb-1">
                    Alignment Source <span className="text-stone-400">(optional — where the values come from)</span>
                  </label>
                  <select
                    className="w-full p-2 border border-stone-200 dark:border-stone-700 rounded-md bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm"
                    value={totalAlignmentSource}
                    onChange={e => setAlignmentSource(e.target.value)}
                  >
                    <option value="">— Value (default) —</option>
                    {channels.filter(c => c.is_active).map(c => (
                      <option key={c.id} value={`${c.category}::${c.name}`}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTotalRecord(null)}
                  disabled={isTotalActionPending}
                  className="px-3 py-2 rounded-md text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTotalUpdate}
                  disabled={isTotalActionPending}
                  className="px-3 py-2 rounded-md text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                  {isTotalActionPending
                    ? 'Saving…'
                    : totalMode === 'sitout'
                    ? 'Save & Move To Standby'
                    : totalMode === 'leave'
                    ? 'Save & Mark Exit'
                    : 'Save Total'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EntriesRow({ record, entity, updateRecord, deleteRecord, isHighIntensity, onViewEntity, onTotalUpdate, onSitOut, onLeave, canManageImpact, isTotalActionPending, onNotify }: { 
  record: ActivityRecord, 
  entity: Entity, 
  updateRecord: (e: ActivityRecord) => Promise<void>,
  deleteRecord: (id: string) => Promise<void>,
  isHighIntensity: boolean,
  onViewEntity: (id: string) => void,
  onTotalUpdate: (record: ActivityRecord) => void,
  onSitOut: (record: ActivityRecord) => void,
  onLeave: (record: ActivityRecord) => void,
  canManageImpact: boolean,
  isTotalActionPending: boolean,
  onNotify: (input: { type: 'success' | 'error' | 'info'; message: string }) => void
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [initialValue, setInitialValue] = useState(record.unit_amount.toString());
  const [total, setTotal] = useState(record.unit_amount.toString());

  const handleSave = async () => {
    const parsedActivityRecordVal = parseFloat(initialValue);
    const parsedTotal = parseFloat(total);
    if (!Number.isFinite(parsedActivityRecordVal) || parsedActivityRecordVal < 10) {
      onNotify({ type: 'error', message: 'ActivityRecord value must be at least 10.' });
      return;
    }
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      onNotify({ type: 'error', message: 'Total must be a valid non-negative number.' });
      return;
    }
    await updateRecord({
      ...record,
      unit_amount: parsedTotal
    });
    setIsEditing(false);
  };

  const normalizeValueInput = (value: string, setValue: (next: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    setValue(parsed.toFixed(2));
  };

  const generateReceipt = () => {
    const net = (parseFloat(total) || 0) - (parseFloat(initialValue) || 0);
    return `🧾 *Activity Total Snapshot*\nEntity: ${entity.name}\nUnit Input: ${formatValue(parseFloat(initialValue))}\nCurrent Total: ${formatValue(parseFloat(total))}\nDelta: ${net > 0 ? '+' : ''}${formatValue(net)}`;
  };

  const shareReceipt = () => {
    const text = encodeURIComponent(generateReceipt());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleRemoveActivityRecord = async () => {
    if (isDeleting) return;
    const confirmed = window.confirm('Confirm remove this record?');
    if (!confirmed) return;
    try {
      setIsDeleting(true);
      await deleteRecord(record.id);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    const editDelta = (parseFloat(total) || 0) - (parseFloat(initialValue) || 0);

    return (
      <tr className="bg-stone-50 dark:bg-stone-800">
        <td className="px-6 py-3 font-medium text-stone-900 dark:text-stone-100">{entity.name}</td>
        <td className="px-6 py-3 text-right">
          <input 
            type="number" 
            step="0.01"
            min="10"
            className="w-24 p-1 border border-stone-300 dark:border-stone-600 rounded text-right bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100"
            value={initialValue}
            onChange={e => setInitialValue(e.target.value)}
            onBlur={() => normalizeValueInput(initialValue, setInitialValue)}
          />
        </td>
        <td className="px-6 py-3 text-right">
          <input 
            type="number" 
            className="w-24 p-1 border border-stone-300 dark:border-stone-600 rounded text-right bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100"
            value={total}
            onChange={e => setTotal(e.target.value)}
          />
        </td>
        <td className="px-6 py-3 text-right font-mono text-stone-400">
          <span className={cn(
            "font-medium",
            editDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : editDelta < 0 ? "text-red-600 dark:text-red-400" : "text-stone-400"
          )}>
            {editDelta > 0 ? '+' : ''}{formatValue(editDelta)}
          </span>
        </td>
        <td className="px-6 py-3 text-right flex justify-end gap-2">
          <button onClick={() => { void handleSave(); }} className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300">
            <Save size={18} />
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors group">
      <td 
        className="px-6 py-3 font-medium text-stone-900 dark:text-stone-100 cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        onClick={() => onViewEntity(entity.id)}
      >
        {entity?.name || 'Unknown'}
        {record.left_at && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            Left {new Date(record.left_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        {entity?.tags && entity.tags.length > 0 && (
          <div className="flex gap-1 mt-1">
            {entity.tags.slice(0, 2).map((tag: string) => (
              <span key={tag} className="text-[10px] bg-stone-100 dark:bg-stone-700 px-1 rounded text-stone-500 dark:text-stone-400">{tag}</span>
            ))}
          </div>
        )}
      </td>
      <td className="px-6 py-3 text-right font-mono text-stone-600 dark:text-stone-300">{formatValue(record.unit_amount)}</td>
      <td className="px-6 py-3 text-right font-mono text-stone-600 dark:text-stone-300">{formatValue(record.unit_amount)}</td>
      <td className={cn(
        "px-6 py-3 text-right font-mono font-medium",
        (record.direction === 'increase' ? record.unit_amount : -record.unit_amount) > 0 ? "text-emerald-600 dark:text-emerald-400" : (record.direction === 'increase' ? record.unit_amount : -record.unit_amount) < 0 ? "text-red-600 dark:text-red-400" : "text-stone-400"
      )}>
        {(record.direction === 'increase' ? record.unit_amount : -record.unit_amount) > 0 ? '+' : ''}{formatValue((record.direction === 'increase' ? record.unit_amount : -record.unit_amount))}
      </td>
      <td className="px-6 py-3 text-right">
        <div className="toolbar-surface justify-end">
        <button onClick={shareReceipt} aria-label="Share receipt" className="action-pill action-pill-success action-pill-sm" title="Share Receipt">
          <Share2 size={14} />
          <span className="hidden sm:inline">Share</span>
        </button>
        {canManageImpact && (
          <>
            <button
              onClick={() => onTotalUpdate(record)}
              disabled={isTotalActionPending}
              aria-label="Update total"
              className="action-pill action-pill-neutral action-pill-sm"
              title="Update Total"
            >
              <Circle size={14} />
              <span className="hidden sm:inline">Total</span>
            </button>
            {!record.left_at && (
              <button
                onClick={() => onLeave(record)}
                disabled={isTotalActionPending}
                aria-label="Mark inactive"
                className="action-pill action-pill-danger action-pill-sm"
                title="Mark inactive"
              >
                <Clock size={14} />
                <span className="hidden sm:inline">Inactive</span>
              </button>
            )}
            <button onClick={() => setIsEditing(true)} aria-label="Edit record" className="action-pill action-pill-neutral action-pill-sm" title="Edit ActivityRecord">
              <Edit2 size={14} />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={() => { void handleRemoveActivityRecord(); }}
              disabled={isDeleting}
              aria-label="Remove record"
              className="action-pill action-pill-danger action-pill-sm disabled:opacity-60"
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">{isDeleting ? 'Removing…' : 'Remove'}</span>
            </button>
          </>
        )}
        </div>
      </td>
    </tr>
  );
}
