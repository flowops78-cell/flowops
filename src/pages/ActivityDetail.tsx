import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { ArrowLeft, AlertCircle, User, Users, Activity, Play, Square, SlidersHorizontal, X, UserCheck, Timer } from 'lucide-react';
import { formatValue, formatDate } from '../lib/utils';
import { workspaceMemberDisplayLabel } from '../lib/workspaceMemberDisplayLabel';
import { ActivityRecord, Entity } from '../types';
import { cn } from '../lib/utils';

import TelemetrySidebar from '../components/TelemetrySidebar';
import ContextPanel from '../components/ContextPanel';
import EntitySnapshot from '../components/EntitySnapshot';
import CollapsibleActivitySection from '../components/CollapsibleActivitySection';
import DataActionMenu from '../components/DataActionMenu';
import { useAppRole } from '../context/AppRoleContext';
import { useNotification } from '../context/NotificationContext';
import LoadingLine from '../components/LoadingLine';
import EmptyState from '../components/EmptyState';
import { useLabels, LABELS } from '../lib/labels';
import { useAuth } from '../context/AuthContext';
import { EntriesRow } from './ActivityDetailEntriesRow';

function ActivityEntityCombobox({
  availableEntities,
  selectedUnitId,
  quickUnitName,
  onInputChange,
  onPick,
  disabled,
  inputRef,
  placeholder = 'Entity',
}: {
  availableEntities: Entity[];
  selectedUnitId: string;
  quickUnitName: string;
  onInputChange: (value: string) => void;
  onPick: (entity: Entity) => void;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
}) {
  const baseId = useId();
  const listId = `${baseId}-entity-suggest`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  /** DOM timers are numeric IDs in the browser. */
  const blurTimer = useRef<number | null>(null);

  const displayValue = selectedUnitId
    ? (availableEntities.find(e => e.id === selectedUnitId)?.name ?? '')
    : quickUnitName;

  const q = displayValue.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!q) return availableEntities.slice(0, 45);
    return [...availableEntities]
      .filter(e => (e.name || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const an = (a.name || '').toLowerCase();
        const bn = (b.name || '').toLowerCase();
        const ap = an.startsWith(q) ? 0 : 1;
        const bp = bn.startsWith(q) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return an.localeCompare(bn);
      })
      .slice(0, 45);
  }, [availableEntities, q]);

  const cancelClose = () => {
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    blurTimer.current = window.setTimeout(() => setOpen(false), 200) as unknown as number;
  };

  useEffect(() => () => cancelClose(), []);

  const showList = open && !disabled && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        role="combobox"
        className="w-full rounded-2xl bg-transparent px-4 py-3 text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100"
        placeholder={placeholder}
        value={displayValue}
        disabled={disabled}
        onChange={e => {
          cancelClose();
          onInputChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => {
          cancelClose();
          setOpen(true);
          setHighlight(0);
        }}
        onBlur={scheduleClose}
        onKeyDown={e => {
          if (!showList) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight(i => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight(i => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && suggestions[highlight]) {
            e.preventDefault();
            onPick(suggestions[highlight]!);
            setOpen(false);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-52 overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900"
        >
          {suggestions.map((ent, i) => (
            <li key={ent.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={cn(
                  'flex w-full px-3 py-2 text-left text-sm text-stone-900 dark:text-stone-100',
                  i === highlight ? 'bg-stone-100 dark:bg-stone-800' : 'hover:bg-stone-50 dark:hover:bg-stone-800/80',
                )}
                onMouseDown={e => {
                  e.preventDefault();
                  onPick(ent);
                  cancelClose();
                  setOpen(false);
                }}
              >
                {ent.name || 'Unnamed Entity'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function ActivityDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { activities, records, entities, entityBalances, workspaceMembers, activityLogs, channels, loading, loadingProgress, addEntity, requestAdjustment, addRecord, addActivityLog, endActivityLog, updateRecord, deleteRecord, updateActivity, updateEntity, addChannelRecord, transferUnits } = useData();
  const { role, canOperateLog, canManageImpact, canAlign } = useAppRole();
  const { notify } = useNotification();
  const { getActionText, tx } = useLabels();
  const { user: authUser } = useAuth();
  
  const activity = activities.find(g => g.id === id);
  const activityEntries = records.filter(l => l.activity_id === id);
  const activeActivityEntries = activityEntries.filter(record => !record.left_at);
  
  // Derived state
  const totalInflow = activityEntries.reduce((sum, e) => sum + (e.direction === 'increase' ? e.unit_amount : 0), 0);
  const totalOutflow = activityEntries.reduce((sum, e) => sum + (e.direction === 'decrease' ? e.unit_amount : 0), 0);
  const discrepancy = totalOutflow - totalInflow;
  const isTotald = Math.abs(discrepancy) < 0.01;

  // View State
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
  const [recordValue, setRecordValue] = useState('');
  const [isAddingEntity, setIsAddingEntity] = useState(false);
  const [didAddEntity, setDidAddEntity] = useState(false);
  const [isAddOptionsOpen, setIsAddOptionsOpen] = useState(false);
  const [isAdvancedOverlayOpen, setIsAdvancedOverlayOpen] = useState(false);
  const [selectedOperatorUserId, setSelectedOperatorUserId] = useState('');
  const [isUpdatingWorkforce, setIsUpdatingWorkforce] = useState(false);

  const [totalRecord, setTotalRecord] = useState<ActivityRecord | null>(null);
  const [totalAmount, setTotalAmount] = useState('');
  const [totalMode, setTotalMode] = useState<'update' | 'sitout' | 'leave'>('update');
  const [totalAlignmentSource, setAlignmentSource] = useState('');
  const [selectedPositionNumber, setSelectedPositionNumber] = useState<number | null>(null);
  const [positionPanelEntityId, setPositionPanelUnitId] = useState('');
  const [positionPanelEntityQuery, setPositionPanelUnitQuery] = useState('');
  const [positionPanelRecord, setPositionPanelRecordValue] = useState('');
  const [positionPanelTotal, setPositionPanelTotal] = useState('');
  const [isPositionActionPending, setIsPositionActionPending] = useState(false);
  const [isTotalActionPending, setIsTotalActionPending] = useState(false);
  const [isActivityTransitioning, setIsActivityTransitioning] = useState(false);
  const [recentTransitionStatus, setRecentTransitionStatus] = useState<'active' | 'completed' | 'archived' | null>(null);
  const addRecordSectionRef = useRef<HTMLDivElement | null>(null);
  const addUnitSelectRef = useRef<HTMLInputElement | null>(null);
  const addOptionsEntityInputRef = useRef<HTMLInputElement | null>(null);
  const recordRecordInputRef = useRef<HTMLInputElement | null>(null);
  const addUnitSuccessTimerRef = useRef<number | null>(null);
  const activityTransitionSuccessTimerRef = useRef<number | null>(null);

  // Activity Operations State
  const [assignedOperator, setAssignedOperator] = useState(activity?.assigned_user_id || '');

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
    }
  }, [activity]);

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

  const syncEntityEntryValue = (value: string) => {
    const nextValue = value;
    const trimmedValue = nextValue.trim();

    if (!trimmedValue) {
      setSelectedUnitId('');
      setQuickUnitName('');
      return;
    }

    const matchedEntity = availableEntities.find(entity => (entity.name || '').trim().toLowerCase() === trimmedValue.toLowerCase());
    if (matchedEntity) {
      setSelectedUnitId(matchedEntity.id);
      setQuickUnitName('');
      return;
    }

    setSelectedUnitId('');
    setQuickUnitName(nextValue);
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

  useEffect(() => {
    const handleOverlayEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isTotalActionPending || isAddingEntity || isUpdatingWorkforce || isActivityTransitioning) return;

      if (isAddOptionsOpen) {
        setIsAddOptionsOpen(false);
        return;
      }

      if (isAdvancedOverlayOpen) {
        setIsAdvancedOverlayOpen(false);
      }
    };

    window.addEventListener('keydown', handleOverlayEscape);
    return () => window.removeEventListener('keydown', handleOverlayEscape);
  }, [isAddOptionsOpen, isAdvancedOverlayOpen, isTotalActionPending, isAddingEntity, isUpdatingWorkforce, isActivityTransitioning]);

  const availableEntities = entities.filter(entity => !activeActivityEntries.some(record => record.entity_id === entity.id));
  const entitiesAvailableForPosition = availableEntities;
  const unpositionedActiveEntries = activeActivityEntries.filter(record => !record.position_id || record.position_id <= 0);
  const selectedPositionActivityRecord = selectedPositionNumber !== null
    ? activeActivityEntries.find(record => record.position_id === selectedPositionNumber) ?? null
    : null;
  const selectedPositionUnit = selectedPositionActivityRecord
    ? entities.find(unit => unit.id === selectedPositionActivityRecord.entity_id) ?? null
    : null;
  const workspaceMemberLabel = (userId: string) => {
    const m = workspaceMembers.find((x) => x.user_id === userId);
    if (!m) return `Not in roster · ${userId.slice(0, 8)}…`;
    return workspaceMemberDisplayLabel(m, {
      currentUserId: authUser?.id ?? null,
      currentUserEmail: authUser?.email ?? null,
    });
  };

  /** All active workspace members — assignment and logs are not limited to operator/admin roles. */
  const rosterMembers = workspaceMembers;
  const activityWorkActivitys = activityLogs.filter(log => log.activity_id === activity?.id);
  const activeOperatorLogCount = activityWorkActivitys.filter(log => log.status === 'active').length;
  const activeOperatorLogByUserId = new Map<string, typeof activityLogs[number]>();
  activityWorkActivitys.forEach(log => {
    if (log.status === 'active' && !activeOperatorLogByUserId.has(log.actor_user_id ?? '')) {
      activeOperatorLogByUserId.set(log.actor_user_id ?? '', log);
    }
  });
  /** Open log: anyone in the roster except users who already have an active session on this activity. */
  const availableForOperatorLog = rosterMembers.filter((profile) => !activeOperatorLogByUserId.has(profile.user_id));
  const isCompleted = activity?.status === 'completed';
  const isArchived = activity?.status === 'archived';
  const canAddUnits = canOperateLog && activity?.status === 'active';
  const canManageWorkforce = canOperateLog && activity?.status === 'active';
  const canManageEntries = canManageImpact && !isCompleted && !isArchived;
  const entriesRestrictionMessage =
    isCompleted || isArchived
      ? 'Entries, positions, and totals cannot be changed while this activity is completed or archived.'
      : 'Only workspace admins or operators can change entries, positions, and totals on an active activity.';
  const positionFinderOptions = [
    ...unpositionedActiveEntries.map(record => {
      const unit = entities.find(candidate => candidate.id === record.entity_id);
      return {
        unitId: record.entity_id,
        label: `${unit?.name || 'Unknown'} • waiting`,
        kind: 'waiting' as const,
      };
    }),
    ...entitiesAvailableForPosition.map(unit => ({
      unitId: unit.id,
      label: `${unit.name || 'Unnamed Entity'} • pool`,
      kind: 'entity_pool' as const,
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
      return;
    }

    if (selectedPositionActivityRecord) {
      setPositionPanelUnitId(selectedPositionActivityRecord.entity_id || '');
      const selectedUnit = entities.find(unit => unit.id === selectedPositionActivityRecord.entity_id);
      setPositionPanelUnitQuery(selectedUnit?.name || '');
      setPositionPanelRecordValue('');
      setPositionPanelTotal(String(selectedPositionActivityRecord.unit_amount ?? 0));
      return;
    }

    setPositionPanelUnitId('');
    setPositionPanelUnitQuery('');
    setPositionPanelRecordValue('');
    setPositionPanelTotal('');
  }, [entities, selectedPositionActivityRecord, selectedPositionNumber, unpositionedActiveEntries]);

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

    if (recordValueingType === 'deferred' && !canOperateLog) {
      notify({ type: 'error', message: 'Your current permissions do not allow recording deferred entity records.' });
      return;
    }

    try {
      setIsAddingEntity(true);
      let entityId = selectedUnitId;
      if (!entityId && quickUnitName.trim()) {
       entityId = await addEntity({ name: quickUnitName.trim() });
      }

      if (!entityId) {
        notify({ type: 'error', message: 'Unable to create new entity.' });
        return;
      }

      const newAppliedRecordId = await addRecord({
        activity_id: activity.id,
        entity_id: entityId,
        unit_amount: parsedrecordValue,
        direction: 'increase',
        status: 'applied',
        channel_label: recordValueingType === 'value' ? recordTransferMethod : undefined,
        notes: recordValueingType === 'value' ? `Channel source: ${recordTransferMethod}` : 'Deferred inbound record',
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
          activity_id: activity.id,
          entity_id: entityId,
          amount: parsedrecordValue,
          type: 'input',
          channel_label: recordTransferMethod || activity.channel_label,
          requested_at: new Date().toISOString(),
          source_record_id: newAppliedRecordId,
        });
      }

      setSelectedUnitId('');
      setQuickUnitName('');
      setRecordValueingType('value');
      setRecordTransferMethod('');
      setIsAddOptionsOpen(false);
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
    if (!activity) return;
    if (!canManageImpact) {
      notify({ type: 'error', message: 'Only admin/operator can update operations.' });
      return;
    }
    if (isCompleted || isArchived) {
      notify({ type: 'error', message: 'Completed or archived activities are locked.' });
      return;
    }
    const persistedAssignee = activity.assigned_user_id || '';
    if (role !== 'admin' && persistedAssignee && assignedOperator === '') {
      setAssignedOperator(persistedAssignee);
      notify({ type: 'error', message: 'Only a workspace admin can unassign this activity.' });
      return;
    }
    try {
      await updateActivity({
        ...activity,
        assigned_user_id: assignedOperator,
      });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to update operations.' });
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
        notify({ type: 'error', message: 'Only a workspace admin can complete activities.' });
        return;
      }
      if (!isTotald) {
        notify({ type: 'error', message: 'Activity must be totaled (inflow matches outflow) before completion.' });
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
      notify({ type: 'error', message: entriesRestrictionMessage });
      return;
    }
    await updateRecord(record);
  };

  const openOperatorSessionForProfile = async () => {
    if (!activity || !selectedOperatorUserId) return;
    if (!canManageWorkforce) {
      notify({ type: 'error', message: 'Operator logs can only be updated while this activity is active.' });
      return;
    }

    const target = rosterMembers.find((o) => o.user_id === selectedOperatorUserId);
    if (!target) {
      notify({ type: 'error', message: 'Selected person is not in this workspace.' });
      return;
    }

    try {
      setIsUpdatingWorkforce(true);
      await addActivityLog({
        activity_id: activity.id,
        start_time: new Date().toISOString(),
        status: 'active',
        actor_user_id: selectedOperatorUserId,
        actor_label: workspaceMemberLabel(selectedOperatorUserId),
        actor_role: target.role,
      });
      setSelectedOperatorUserId('');
      notify({ type: 'success', message: 'Activity log opened.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to open activity log.' });
    } finally {
      setIsUpdatingWorkforce(false);
    }
  };
 
  const closeOperatorSession = async (logId: string, operatorUserId: string) => {
    if (!canManageWorkforce) {
      notify({ type: 'error', message: 'Operator logs can only be updated while this activity is active.' });
      return;
    }
    const activityLog = activityWorkActivitys.find(item => item.id === logId);
    if (!activityLog) return;

    const endTime = new Date().toISOString();
    const startTime = activityLog.start_time ? new Date(activityLog.start_time).getTime() : new Date().getTime();
    const durationHours = Math.max(0, (new Date(endTime).getTime() - startTime) / (1000 * 60 * 60));

    try {
      setIsUpdatingWorkforce(true);
      await endActivityLog(logId, endTime, durationHours, undefined);
      notify({ type: 'success', message: 'Activity log closed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to close activity log.' });
    } finally {
      setIsUpdatingWorkforce(false);
    }
  };

  const guardedDeleteActivityRecord = async (recordId: string) => {
    if (!canManageEntries) {
      notify({ type: 'error', message: entriesRestrictionMessage });
      return;
    }
    try {
      await deleteRecord(recordId);
      notify({ type: 'success', message: 'Activity record deleted.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to delete activity record.' });
    }
  };

  const handleUpdateEntityTags = async (id: string, tags: string[]) => {
    const entity = entities.find(p => p.id === id);
    if (entity) {
      try {
        await updateEntity({ ...entity, tags });
        notify({ type: 'success', message: 'Entity tags updated.' });
      } catch (error: any) {
        notify({ type: 'error', message: error?.message || 'Unable to update entity tags.' });
      }
    }
  };





  const openTotalModal = (record: ActivityRecord) => {
    if (!canManageEntries) {
      notify({ type: 'error', message: entriesRestrictionMessage });
      return;
    }
    setTotalRecord(record);
    setTotalAmount(record.unit_amount.toString());
    setTotalMode('update');
  };

  const openSitOutModal = (record: ActivityRecord) => {
    if (isPositionActionPending || isTotalActionPending) {
      notify({ type: 'info', message: 'Please wait for the current position/total action to finish.' });
      return;
    }
    if (!canManageEntries) {
      notify({ type: 'error', message: entriesRestrictionMessage });
      return;
    }
    if (record.left_at) {
      notify({ type: 'error', message: 'Entity already marked as left.' });
      return;
    }

    setTotalRecord(record);
    setTotalAmount(record.unit_amount.toString());
    setTotalMode('sitout');
  };

  const openLeaveModal = (record: ActivityRecord) => {
    if (isPositionActionPending || isTotalActionPending) {
      notify({ type: 'info', message: 'Please wait for the current position/total action to finish.' });
      return;
    }
    if (!canManageEntries) {
      notify({ type: 'error', message: entriesRestrictionMessage });
      return;
    }
    if (record.left_at) {
      notify({ type: 'error', message: 'Entity already marked as left.' });
      return;
    }

    setTotalRecord(record);
    setTotalAmount(record.unit_amount.toString());
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
      notify({ type: 'error', message: entriesRestrictionMessage });
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
      notify({ type: 'error', message: entriesRestrictionMessage });
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
        const poolEntityMatches = entitiesAvailableForPosition.filter(entity => (entity.name || '').toLowerCase().includes(normalizedQuery));
        if (poolEntityMatches.length === 1) {
          targetUnitId = poolEntityMatches[0].id;
        } else if (poolEntityMatches.length > 1) {
          notify({ type: 'error', message: 'Multiple pool entities match that text. Choose a specific suggestion from the finder list.' });
          return;
        }
      }
    }

    if (!targetUnitId) {
      notify({ type: 'error', message: 'Select a waiting/sat-out entity, or type a valid pool entity name.' });
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

    const poolEntity = entitiesAvailableForPosition.find(unit => unit.id === targetUnitId);
    if (!poolEntity) {
      const hasHistoricalActivityRecord = activityEntries.some(record => record.entity_id === targetUnitId);
      if (hasHistoricalActivityRecord) {
        notify({ type: 'error', message: 'This entity already has an record row in this activity. Re-position the existing row instead of adding from the pool.' });
      } else {
        notify({ type: 'error', message: 'Select a valid waiting or pool entity from finder suggestions.' });
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
      notify({ type: 'error', message: 'ActivityRecord value must be at least 10 to position a pool entity.' });
      return;
    }

    try {
      setIsPositionActionPending(true);
      await addRecord({
        activity_id: activity.id,
        entity_id: poolEntity.id,
        unit_amount: parsedActivityRecordVal,
        direction: 'increase',
        status: 'applied',
        position_id: selectedPositionNumber,
      });
      setPositionPanelRecordValue('');
      setPositionPanelUnitId('');
      setPositionPanelUnitQuery('');
      setSelectedPositionNumber(null);
      notify({ type: 'success', message: `${poolEntity.name || 'Entity'} added and positioned at #${selectedPositionNumber}.` });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to add and position selected entity.' });
    } finally {
      setIsPositionActionPending(false);
    }
  };

  const handleActivityPositionTotalSave = async () => {
    if (isTotalActionPending) return;

    if (!selectedPositionActivityRecord) {
      notify({ type: 'error', message: 'Select a position to update its total.' });
      return;
    }
    if (!canManageEntries) {
      notify({ type: 'error', message: entriesRestrictionMessage });
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
    };

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
      notify({ type: 'error', message: entriesRestrictionMessage });
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
              activityNet={(entityBalances.get(viewingEntity.id)?.net ?? 0) - (viewingEntity.starting_total ?? 0)}
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
            <button
              type="button"
              onClick={() => setIsAdvancedOverlayOpen(true)}
              className="action-pill action-pill-neutral"
              aria-haspopup="dialog"
              aria-expanded={isAdvancedOverlayOpen}
            >
              <SlidersHorizontal size={14} aria-hidden />
              <span>{LABELS.activityAdvanced.toolbarButton}</span>
            </button>
            {!isMobileViewport && (
              <button 
                onClick={() => setIsTelemetryOpen(!isTelemetryOpen)}
                aria-label={`Toggle ${LABELS.workspacePanels.sessionTimeline.title.toLowerCase()}`}
                className={cn(
                  "action-pill",
                  isTelemetryOpen 
                    ? "action-pill-strong" 
                    : "action-pill-neutral"
                )}
                title={`${LABELS.workspacePanels.sessionTimeline.titleHint}`}
              >
                <Activity size={14} />
                <span className="hidden sm:inline">{LABELS.workspacePanels.sessionTimeline.title}</span>
              </button>
            )}

          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-light text-stone-900 dark:text-stone-100">
              {activity.name || formatDate(activity.date)}
            </h2>
            {activity.name && (
              <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                {formatDate(activity.date)}
              </p>
            )}
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

      <div className="space-y-6">
        <div ref={addRecordSectionRef} className="rounded-[28px] border border-stone-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,245,244,0.92))] p-5 shadow-[0_24px_60px_-40px_rgba(41,37,36,0.45)] dark:border-stone-800 dark:bg-[linear-gradient(135deg,rgba(28,25,23,0.96),rgba(17,24,39,0.92))] lg:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Add</h3>
                <span className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
                  canAddUnits
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                )}>
                  {canAddUnits ? 'Ready' : 'Locked'}
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Entity, amount, add. Use More add modes for alternate flows.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddOptionsOpen(true)}
              className="action-btn-tertiary self-start px-3 py-2 text-sm"
              disabled={!canAddUnits || isAddingEntity}
            >
              <SlidersHorizontal size={14} />
              More add modes
            </button>
          </div>

          {!canAddUnits && (
            <p className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {activity.status !== 'active'
                ? 'Add stays locked until the activity is active.'
                : (isCompleted || isArchived)
                  ? 'Add is locked because this activity is completed or archived.'
                  : 'Your current permissions do not allow adding entities to this activity.'}
            </p>
          )}

          <form onSubmit={handleAddUnit} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)_auto] lg:items-center">
              <div className="rounded-2xl border border-stone-200 bg-white/90 dark:border-stone-700 dark:bg-stone-900/70">
                <ActivityEntityCombobox
                  availableEntities={availableEntities}
                  selectedUnitId={selectedUnitId}
                  quickUnitName={quickUnitName}
                  onInputChange={syncEntityEntryValue}
                  onPick={ent => {
                    setSelectedUnitId(ent.id);
                    setQuickUnitName('');
                  }}
                  disabled={!canAddUnits}
                  inputRef={addUnitSelectRef}
                />
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white/90 dark:border-stone-700 dark:bg-stone-900/70 focus-within:ring-2 focus-within:ring-stone-500">
                <input
                  ref={recordRecordInputRef}
                  type="number"
                  step="0.01"
                  min="10"
                  className="w-full rounded-2xl bg-transparent px-4 py-3 text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100"
                  placeholder="Amount"
                  value={recordValue}
                  onChange={e => setRecordValue(e.target.value)}
                  onBlur={() => normalizeValueInput(recordValue, setRecordValue)}
                  disabled={!canAddUnits}
                />
              </div>

              <button
                type="submit"
                className="action-btn-primary min-h-[50px] justify-center rounded-2xl px-6 text-sm shadow-glow transition-all hover:scale-[1.01] active:scale-[0.99]"
                disabled={isAddingEntity || (!selectedUnitId && !quickUnitName.trim()) || !canAddUnits || !recordValue.trim()}
                title="Add entry (E)"
              >
                {isAddingEntity ? 'Adding…' : didAddEntity ? 'Added ✓' : 'Add'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
              <span>Use the entity field suggestions or type a new name.</span>
              <span>
                Mode: {recordValueingType === 'deferred' ? 'Deferred' : 'Immediate'}
                {recordTransferMethod ? ` • ${recordTransferMethod.split('::')[1] || recordTransferMethod}` : ''}
              </span>
            </div>
          </form>
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
                actionLabel="Add"
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
                    onViewEntity={(id) => setViewingUnitId(id)}
                    onTotalUpdate={openTotalModal}
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

      {isAddOptionsOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => !isAddingEntity && setIsAddOptionsOpen(false)}>
          <div className="w-full max-w-lg rounded-[24px] border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-800 dark:bg-stone-900" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-800">
              <div>
                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Add options</h3>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                  Set entity, valuation mode, and channel source together—including when immediate valueing requires a channel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOptionsOpen(false)}
                className="rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                disabled={isAddingEntity}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Entity</label>
                <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900/80">
                  <ActivityEntityCombobox
                    availableEntities={availableEntities}
                    selectedUnitId={selectedUnitId}
                    quickUnitName={quickUnitName}
                    onInputChange={syncEntityEntryValue}
                    onPick={ent => {
                      setSelectedUnitId(ent.id);
                      setQuickUnitName('');
                    }}
                    disabled={!canAddUnits}
                    inputRef={addOptionsEntityInputRef}
                    placeholder="Search entities or type a new name"
                  />
                </div>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  Same suggestions as the main add row (all entities not already on this activity).
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Valueing mode</label>
                <select
                  className="control-input w-full"
                  value={recordValueingType}
                  onChange={e => setRecordValueingType(e.target.value as 'value' | 'deferred')}
                  disabled={!canAddUnits}
                >
                  <option value="value">Immediate</option>
                  <option value="deferred">Deferred</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                  Channel source <span className="text-stone-400">({recordValueingType === 'value' ? 'required for immediate' : 'optional for deferred'})</span>
                </label>
                <select
                  className="control-input w-full"
                  value={recordTransferMethod}
                  onChange={e => setRecordTransferMethod(e.target.value)}
                  disabled={!canAddUnits}
                  required={recordValueingType === 'value'}
                >
                  <option value="">{recordValueingType === 'value' ? 'Select transfer source...' : 'No channel source needed'}</option>
                  {channels.filter(c => c.is_active ?? c.status === 'active').map(channel => (
                    <option key={channel.id} value={`${channel.category ?? 'default'}::${channel.name}`}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAddOptionsOpen(false)}
                className="action-btn-primary justify-center"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdvancedOverlayOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => !isUpdatingWorkforce && !isActivityTransitioning && setIsAdvancedOverlayOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-options-title"
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-800 dark:bg-stone-900 lg:p-6"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-800">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
                    <SlidersHorizontal size={18} aria-hidden />
                  </span>
                  <h3 id="activity-options-title" className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                    {LABELS.activityAdvanced.modalTitle}
                  </h3>
                </div>
                {LABELS.activityAdvanced.modalSubtitle ? (
                  <p className="mt-2 text-sm leading-snug text-stone-500 dark:text-stone-400">
                    {LABELS.activityAdvanced.modalSubtitle}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsAdvancedOverlayOpen(false)}
                className="shrink-0 rounded-xl p-2 text-stone-500 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                disabled={isUpdatingWorkforce || isActivityTransitioning}
                aria-label="Close activity options"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
              <div className="space-y-4">
                <div className="rounded-xl border border-stone-200 border-l-[3px] border-l-stone-400 bg-stone-50/90 p-4 dark:border-stone-800 dark:border-l-stone-500 dark:bg-stone-800/50">
                  <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    <User size={14} className="text-stone-400" aria-hidden />
                    {LABELS.activityAdvanced.statusSectionTitle}
                  </h4>
                  {LABELS.activityAdvanced.statusSectionHint ? (
                    <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                      {LABELS.activityAdvanced.statusSectionHint}
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-2">
                    {activity.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => void handleActivityTransition('completed')}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/70 dark:bg-stone-900 dark:text-red-400 dark:hover:bg-red-900/20"
                        disabled={isActivityTransitioning || !canAlign || !isTotald}
                        title="Complete activity"
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
                        onClick={() => void handleActivityTransition('archived')}
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
                        onClick={() => void handleActivityTransition('active')}
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
                </div>

                <div className="rounded-xl border border-stone-200 border-l-[3px] border-l-emerald-500/70 bg-stone-50/90 p-4 dark:border-stone-800 dark:border-l-emerald-500/50 dark:bg-stone-800/50">
                  <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    <UserCheck size={14} className="text-emerald-600/80 dark:text-emerald-400/90" aria-hidden />
                    {LABELS.activityAdvanced.assignmentSectionTitle}
                  </h4>
                  {LABELS.activityAdvanced.assignmentFieldHint ? (
                    <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                      {LABELS.activityAdvanced.assignmentFieldHint}
                    </p>
                  ) : null}
                  <label className="mt-3 mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                    {LABELS.activityAdvanced.assignmentFieldLabel}
                  </label>
                  <select
                    className="control-input w-full"
                    value={assignedOperator}
                    onChange={e => setAssignedOperator(e.target.value)}
                    onBlur={handleUpdateOperations}
                    disabled={!canManageImpact || isCompleted || isArchived}
                    aria-label={LABELS.activityAdvanced.assignmentFieldLabel}
                  >
                    {(role === 'admin' || !activity.assigned_user_id) && (
                      <option value="">{LABELS.activityAdvanced.assignmentPlaceholder}</option>
                    )}
                    {rosterMembers.map(member => (
                      <option key={member.user_id} value={member.user_id}>
                        {workspaceMemberLabel(member.user_id)}
                      </option>
                    ))}
                  </select>
                  {LABELS.activityAdvanced.assignmentSaveHint ? (
                    <p className="mt-2 text-[10px] leading-relaxed text-stone-400 dark:text-stone-500">
                      {LABELS.activityAdvanced.assignmentSaveHint}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 border-l-[3px] border-l-violet-500/70 bg-white p-4 dark:border-stone-800 dark:border-l-violet-500/50 dark:bg-stone-900/40">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      <Timer size={14} className="text-violet-500 dark:text-violet-400" aria-hidden />
                      {LABELS.activityAdvanced.shiftsSectionTitle}
                    </h4>
                    {LABELS.activityAdvanced.shiftsSectionHint ? (
                      <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                        {LABELS.activityAdvanced.shiftsSectionHint}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="flex shrink-0 flex-wrap items-center gap-2"
                    title={`${activityWorkActivitys.length} ${activityWorkActivitys.length === 1 ? LABELS.activityAdvanced.shiftsCountSingular : LABELS.activityAdvanced.shiftsCountPlural} on this activity`}
                  >
                    <div className="inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 dark:border-stone-600 dark:bg-stone-800/90">
                      <span className="font-mono text-lg font-semibold tabular-nums leading-none text-stone-900 dark:text-stone-100">
                        {activityWorkActivitys.length}
                      </span>
                      <span className="h-4 w-px shrink-0 bg-stone-200 dark:bg-stone-600" aria-hidden />
                      <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">
                        {activityWorkActivitys.length === 1
                          ? LABELS.activityAdvanced.shiftsCountSingular
                          : LABELS.activityAdvanced.shiftsCountPlural}
                      </span>
                    </div>
                    {activeOperatorLogCount > 0 && (
                      <span className="inline-flex items-center rounded-lg bg-emerald-500/12 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                        {activeOperatorLogCount} {LABELS.activityAdvanced.shiftsActiveNow}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-stone-100 bg-stone-50/80 p-3 dark:border-stone-800 dark:bg-stone-800/40">
                  {LABELS.activityAdvanced.startNewShiftGroupLabel ? (
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      {LABELS.activityAdvanced.startNewShiftGroupLabel}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch">
                    <select
                      className="control-input"
                      value={selectedOperatorUserId}
                      onChange={event => setSelectedOperatorUserId(event.target.value)}
                      disabled={!canManageWorkforce || isUpdatingWorkforce}
                      aria-label={LABELS.activityAdvanced.shiftsSelectPlaceholder}
                    >
                      <option value="">{LABELS.activityAdvanced.shiftsSelectPlaceholder}</option>
                      {availableForOperatorLog.map(profile => (
                        <option key={profile.user_id} value={profile.user_id}>
                          {workspaceMemberLabel(profile.user_id)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => { void openOperatorSessionForProfile(); }}
                      disabled={!canManageWorkforce || isUpdatingWorkforce || !selectedOperatorUserId}
                      className="action-btn-primary h-[42px] justify-center sm:h-auto sm:min-h-[42px]"
                    >
                      <Play size={14} aria-hidden />
                      {isUpdatingWorkforce ? 'Updating…' : LABELS.activityAdvanced.startShift}
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {activityWorkActivitys.length === 0 && LABELS.activityAdvanced.noShiftsYet ? (
                    <p className="rounded-lg border border-dashed border-stone-200 px-3 py-3 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
                      {LABELS.activityAdvanced.noShiftsYet}
                    </p>
                  ) : null}
                  {activityWorkActivitys.map(activityLog => {
                    const uid = activityLog.actor_user_id ?? '';
                    const operatorName = uid
                      ? workspaceMemberLabel(uid)
                      : (activityLog.actor_label || 'Unknown operator');
                    const windowLabel = `${(activityLog.start_time ? new Date(activityLog.start_time) : new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${activityLog.end_time ? new Date(activityLog.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}`;

                    return (
                      <div key={activityLog.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2.5 dark:border-stone-800 dark:bg-stone-800/30">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{operatorName}</p>
                          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{windowLabel} · {activityLog.duration_hours ? `${activityLog.duration_hours.toFixed(2)}h` : tx('in progress')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
                            activityLog.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                          )}>
                            {activityLog.status}
                          </span>
                          {activityLog.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => { void closeOperatorSession(activityLog.id, activityLog.actor_user_id ?? ''); }}
                              disabled={!canManageWorkforce || isUpdatingWorkforce}
                              className="action-btn-secondary text-xs"
                            >
                              <Square size={12} aria-hidden />
                              {LABELS.activityAdvanced.endShift}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    {channels.filter(c => c.is_active ?? c.status === 'active').map(c => (
                      <option key={c.id} value={`${c.category ?? 'default'}::${c.name}`}>{c.name}</option>
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
