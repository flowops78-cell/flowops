import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useData, EntityBalance } from '../context/DataContext';
import { Search, Plus, Tag, X, TrendingUp, TrendingDown, Calendar, Award, Edit2, Save, Eye, Clock, Download, LayoutGrid, List, ArrowRightLeft, Trash2 } from 'lucide-react';
import { Collaboration, Entity } from '../types';

import { formatValue, formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import MobileActivityRecordCard from '../components/MobileActivityRecordCard';
import EmptyState from '../components/EmptyState';
import CollapsibleActivitySection from '../components/CollapsibleActivitySection';
import { useAppRole } from '../context/AppRoleContext';
import DataActionMenu from '../components/DataActionMenu';
import EntitySnapshot from '../components/EntitySnapshot';
import EntitiesIcon from '../components/icons/EntitiesIcon';
import { useLabels } from '../lib/labels';

const getEntityDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed Entity';
};

export default function Entities({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    entities, 
    entityBalances,
    loading, 
    addEntity, 
    requestAdjustment, 
    updateEntity, 
    deleteEntity, 
    transferUnits, 
    records, 
    activities, 
    collaborations,
    channels,
    addRecord,
    updateRecord
  } = useData();
  const { canAccessAdminUi, canOperateLog, canManageImpact } = useAppRole();
  const { getActionText, tx } = useLabels();
  const canActivityRecordDeferred = canOperateLog;
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isActivityRecordingOutputRequest, setIsActivityRecordingOutputRequest] = useState(false);
  const [isActivityRecordingDeferred, setIsActivityRecordingDeferred] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'activity'>('grid');
  const [activeCardAction, setActiveCardAction] = useState<{ entityId: string; action: 'send' | 'adjust' | 'pending' } | null>(null);
  const [quickViewEntity, setQuickViewEntity] = useState<Entity | null>(null);
  const [entriesViewEntity, setEntriesViewEntity] = useState<Entity | null>(null);
  const [entitysActivityScrollTop, setEntitysActivityScrollTop] = useState(0);
  const entitysActivityContainerRef = useRef<HTMLDivElement | null>(null);
  const [deletingEntityId, setDeletingEntityId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Entity Form
  const [name, setName] = useState('');
  const [profileTotal, setProfileTotal] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [currentTag, setCurrentTag] = useState('');
  const [attributedCollaborationId, setAttributedCollaborationId] = useState('');
  const [transferFromEntityId, setTransferFromEntityId] = useState('');
  const [transferToEntityId, setTransferToEntityId] = useState('');
  const [transferAmount, settransferAmount] = useState('');
  const [outputRequestEntityId, setOutputRequestEntityId] = useState('');
  const [outputRequestAmount, setOutputRequestAmount] = useState('');
  const [deferredEntityId, setDeferredEntityId] = useState('');
  const [deferredAmount, setDeferredAmount] = useState('');
  const [deferredDirection, setDeferredDirection] = useState<'inbound' | 'outbound'>('outbound');

  const openTransferForm = (fromEntityId?: string) => {
    setIsTransferring(true);
    if (fromEntityId) {
      setTransferFromEntityId(fromEntityId);
      if (transferToEntityId === fromEntityId) {
        setTransferToEntityId('');
      }
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openDeferredForm = (entityId?: string) => {
    setIsActivityRecordingDeferred(true);
    setDeferredEntityId(entityId || '');
    setDeferredAmount('');
    setDeferredDirection('outbound');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openEntityProfile = (entityId: string) => {
    navigate(`/entities/${entityId}`);
  };

  const normalizeValueInput = (value: string, setValue: (next: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    setValue(parsed.toFixed(2));
  };

  // entityStats is sourced from the entity_balances DB view via DataContext.
  // The view computes net, total_inflow, record_count, surplus_count, last_active, avg_duration_hours.
  // We alias to entityStats for backward compatibility with all call sites.
  const entityStats = useMemo(() => {
    const stats = new Map<string, { net: number; activitys: number; lastActive: string | null; surpluses: number; totalInflow: number; avgActivity: number }>();
    entityBalances.forEach((balance: EntityBalance, id: string) => {
      stats.set(id, {
        net: Number(balance.net) || 0,
        activitys: Number(balance.record_count) || 0,
        lastActive: balance.last_active ?? null,
        surpluses: Number(balance.surplus_count) || 0,
        totalInflow: Number(balance.total_inflow) || 0,
        avgActivity: Number(balance.avg_duration_hours) || 0,
      });
    });
    return stats;
  }, [entityBalances]);

  const activityById = useMemo(() => {
    return new Map(activities.map(activity => [activity.id, activity]));
  }, [activities]);

  const activeProfileEntity = quickViewEntity ?? entriesViewEntity;

  const quickViewEntries = useMemo(() => {
    if (!activeProfileEntity) return [];

    return records
      .filter(record => record.entity_id === activeProfileEntity.id)
      .map(record => {
        const activity = activityById.get(record.activity_id);
        const sortTimestamp =
          record.left_at ||
          record.created_at ||
          (activity?.date ? `${activity.date}T00:00:00.000Z` : '');

        return {
          id: record.id,
          date: activity?.date || (record.created_at ? record.created_at.split('T')[0] : ''),
          location: activity?.channel_label || 'Activity',
          activityStatus: activity?.status || null,
          inflow: record.direction === 'increase' ? record.unit_amount : 0,
          outflow: record.direction === 'decrease' ? record.unit_amount : 0,
          net: (record.direction === 'increase' ? record.unit_amount : -record.unit_amount) || 0,
          isActive: !record.left_at,
          sortTimestamp,
        };
      })
      .sort((a, b) => new Date(b.sortTimestamp || 0).getTime() - new Date(a.sortTimestamp || 0).getTime());
  }, [activeProfileEntity, records, activityById]);

  const filteredEntitys = entities.filter(entity => 
    entity.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entity.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const PARTICIPANT_ROW_HEIGHT = 58;
  const PARTICIPANT_OVERSCAN = 10;
  const PARTICIPANT_VIEWPORT_HEIGHT = 560;
  const shouldWindowEntitysActivity = viewMode === 'activity' && filteredEntitys.length > 120;
  const entityVisibleCount = Math.ceil(PARTICIPANT_VIEWPORT_HEIGHT / PARTICIPANT_ROW_HEIGHT) + PARTICIPANT_OVERSCAN * 2;
  const entityStartIndex = shouldWindowEntitysActivity
    ? Math.max(0, Math.floor(entitysActivityScrollTop / PARTICIPANT_ROW_HEIGHT) - PARTICIPANT_OVERSCAN)
    : 0;
  const entityEndIndex = shouldWindowEntitysActivity
    ? Math.min(filteredEntitys.length, entityStartIndex + entityVisibleCount)
    : filteredEntitys.length;
  const visibleEntitys = shouldWindowEntitysActivity
    ? filteredEntitys.slice(entityStartIndex, entityEndIndex)
    : filteredEntitys;
  const entityTopSpacerHeight = shouldWindowEntitysActivity ? entityStartIndex * PARTICIPANT_ROW_HEIGHT : 0;
  const entityBottomSpacerHeight = shouldWindowEntitysActivity
    ? Math.max(0, (filteredEntitys.length - entityEndIndex) * PARTICIPANT_ROW_HEIGHT)
    : 0;

  useEffect(() => {
    setEntitysActivityScrollTop(0);
    if (entitysActivityContainerRef.current) {
      entitysActivityContainerRef.current.scrollTop = 0;
    }
  }, [searchTerm, viewMode]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (action !== 'add-entity' && action !== 'add-deferred') return;

    if (action === 'add-deferred') {
      openDeferredForm();
    } else {
      setIsAdding(true);
    }
    const next = new URLSearchParams(location.search);
    next.delete('action');
    navigate({ pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const handleAddEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    const displayName = name.trim();
    if (displayName.length === 0) {
      setImportStatus({ type: 'error', message: 'Name is required.' });
      return;
    }

    try {
      const parsedTotal = profileTotal.trim() === '' ? undefined : Number(profileTotal);

      await addEntity({ 
        name: displayName,
        tags,
        total: Number.isFinite(parsedTotal as number) ? parsedTotal : undefined,
        collaboration_id: attributedCollaborationId || undefined
      });
      // recordSystemEvent removed
      setIsAdding(false);
      resetForm();
    } catch (error: any) {
      const message = error?.message || 'Unable to save entity.';
      setImportStatus({ type: 'error', message });
    }
  };

  const resetForm = () => {
    setName('');
    setProfileTotal('');
    setTags([]);
    setCurrentTag('');
    setAttributedCollaborationId('');
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && currentTag.trim()) {
      e.preventDefault();
      if (!tags.includes(currentTag.trim())) {
        setTags([...tags, currentTag.trim()]);
      }
      setCurrentTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };







  const handleTransferBetweenEntitys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageImpact) {
      setImportStatus({ type: 'error', message: 'Only admin can transfer entity totals.' });
      return;
    }
    try {
      const parsedAmount = Number(transferAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setImportStatus({ type: 'error', message: 'TransferAmount amount must be greater than 0.' });
        return;
      }

      await transferUnits({ 
        from_entity_id: transferFromEntityId, 
        to_entity_id: transferToEntityId, 
        amount: parsedAmount 
      });
      setImportStatus({ type: 'success', message: 'Entity transfer completed.' });
      setIsTransferring(false);
      setTransferFromEntityId('');
      setTransferToEntityId('');
      settransferAmount('');
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to transfer total.' });
    }
  };

  const handleActivityRecordAlignmentRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageImpact) {
      setImportStatus({ type: 'error', message: 'Only admin can record alignment requests.' });
      return;
    }

    try {
      const parsedAmount = Number(outputRequestAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setImportStatus({ type: 'error', message: 'Alignment amount must be greater than 0.' });
        return;
      }

      await addRecord({
        entity_id: outputRequestEntityId,
        direction: 'decrease',
        unit_amount: parsedAmount,
        status: 'pending',
        notes: 'Alignment request (outflow)',
      });
      setImportStatus({ type: 'success', message: 'Outflow request submitted and marked pending for admin approval.' });
      setIsActivityRecordingOutputRequest(false);
      setOutputRequestEntityId('');
      setOutputRequestAmount('');
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to record alignment request.' });
    }
  };

  const handleActivityRecordDeferredActivityRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canActivityRecordDeferred) {
      setImportStatus({ type: 'error', message: 'Only admin or operator can record deferred records.' });
      return;
    }

    try {
      const parsedAmount = Number(deferredAmount);
      if (!deferredEntityId) {
        setImportStatus({ type: 'error', message: 'Select a entity first.' });
        return;
      }
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setImportStatus({ type: 'error', message: 'Deferred record amount must be greater than 0.' });
        return;
      }

      await requestAdjustment({
        entity_id: deferredEntityId,
        amount: parsedAmount,
        type: deferredDirection === 'outbound' ? 'input' : 'output',
        requested_at: new Date().toISOString(),
      });

      setImportStatus({ type: 'success', message: 'Deferred record submitted and marked pending for admin approval.' });
      setIsActivityRecordingDeferred(false);
      setDeferredEntityId('');
      setDeferredAmount('');
      setDeferredDirection('outbound');
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to add pending record.' });
    }
  };

  const handleDeleteEntityProfile = async (entity: Entity) => {
    if (deletingEntityId === entity.id) return;
    if (!canManageImpact) {
      setImportStatus({ type: 'error', message: 'Only admin can delete entity profiles.' });
      return;
    }

    const confirmed = window.confirm(`Delete ${getEntityDisplayName(entity.name)} profile? This cannot be undone.`);
    if (!confirmed) return;

    try {
      setDeletingEntityId(entity.id);
      await deleteEntity(entity.id);
      setImportStatus({ type: 'success', message: 'Entity profile deleted.' });
      setQuickViewEntity(current => (current?.id === entity.id ? null : current));
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to delete entity profile.' });
    } finally {
      setDeletingEntityId(current => (current === entity.id ? null : current));
    }
  };

  const handleUpdateEntityTags = async (entityId: string, nextTags: string[]) => {
    const entity = entities.find(entity => entity.id === entityId);
    if (!entity) return;

    try {
      await updateEntity({ ...entity, tags: nextTags });
      setImportStatus({ type: 'success', message: 'Entity tags updated.' });
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to update entity tags.' });
    }
  };

  const activeEntitysCount = entities.filter(p => (entityStats.get(p.id)?.net || 0) !== 0).length;
  const positiveDeltaEntitys = entities.filter(p => (entityStats.get(p.id)?.net || 0) > 0).length;
  const entityDataMenuItems = [
    { 
      key: 'add-entity-profile', 
      label: getActionText('addEntity'), 
      onClick: () => setIsAdding(true),
      icon: <Plus size={16} />
    },
    {
      key: 'transfer-totals',
      label: 'Send',
      onClick: () => {
        if (!canManageImpact) {
          setImportStatus({ type: 'error', message: 'Only admin can transfer entity totals.' });
          return;
        }
        openTransferForm();
      },
      disabled: !canManageImpact,
      icon: <ArrowRightLeft size={16} />
    },
    {
      key: 'import-entities',
      label: 'Import',
      onClick: () => fileInputRef.current?.click(),
      icon: <Download size={16} />
    }
  ];

  return (
    <div className="page-shell relative">
      {!canManageImpact && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 px-4 py-2 text-sm">
          Admin only: Send, Adjust, Pending. Operators: Pending.
        </div>
      )}
      <div
        className={cn(
          'section-card flex flex-col gap-3',
          embedded
            ? 'p-4 sm:flex-row sm:items-center sm:justify-between'
            : 'p-5 lg:p-6 lg:flex-row lg:items-center justify-between gap-5'
        )}
      >
        <div>
          {embedded ? (
            <div className="flex items-center gap-2">
              <h3 className="text-base font-medium text-stone-900 dark:text-stone-100 lowercase">entities</h3>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 shadow-sm border border-stone-200 dark:border-stone-700">
                <EntitiesIcon size={24} className="text-stone-900 dark:text-stone-100" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Entities</h2>
              </div>
            </div>
          )}
        </div>
        <div className={cn('flex flex-col items-start gap-3', !embedded && 'lg:items-end')}>
          {!embedded && (
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                <span className="font-mono text-stone-900 dark:text-stone-100">{entities.length}</span> entities
              </span>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                <span className="font-mono text-stone-900 dark:text-stone-100">{activeEntitysCount}</span> active
              </span>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <DataActionMenu items={entityDataMenuItems} />
          </div>
        </div>
      </div>

      {importStatus && (
        <div
          className={cn(
            "rounded-lg border px-4 py-2 text-sm",
            importStatus.type === 'success'
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
          )}
        >
          {importStatus.message}
        </div>
      )}

      <div className="section-card p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
          <input 
            type="text" 
            className="w-full pl-10 p-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:text-stone-100"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            <span className="font-medium text-stone-900 dark:text-stone-100">{filteredEntitys.length}</span> entities
          </p>
          <div className="toggle-indirect-track toggle-compact-track">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "toggle-compact-button",
                viewMode === 'grid'
                  ? "toggle-indirect-active"
                  : "toggle-indirect-idle"
              )}
            >
              <LayoutGrid size={14} />
              Grid
            </button>
            <button
              onClick={() => setViewMode('activity')}
              className={cn(
                "toggle-compact-button",
                viewMode === 'activity'
                  ? "toggle-indirect-active"
                  : "toggle-indirect-idle"
              )}
            >
              <List size={14} />
              List
            </button>
          </div>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleAddEntity} className="section-card p-6 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">New Entity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Name</label>
              <input
                className="control-input"
                placeholder="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <input
              type="number"
              step="0.01"
              className="control-input"
              placeholder="Starting total (optional)"
              value={profileTotal}
              onChange={e => setProfileTotal(e.target.value)}
            />
            <select
              className="control-input"
              value={attributedCollaborationId}
              onChange={e => setAttributedCollaborationId(e.target.value)}
            >
              <option value="">Collaboration (optional)</option>
              {collaborations.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
              ))}
            </select>
            
            {/* Tags Input */}
            <div className="md:col-span-2 space-y-2">
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map(tag => (
                  <span key={tag} className="bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-1 rounded-full text-xs flex items-center gap-1 shadow-sm">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500"><X size={12} /></button>
                  </span>
                ))}
              </div>
              <input 
                className="control-input" 
                placeholder="Tags (press Enter)" 
                value={currentTag} 
                onChange={e => setCurrentTag(e.target.value)} 
                onKeyDown={handleAddTag}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button 
              type="button" 
              onClick={() => { setIsAdding(false); resetForm(); }}
              className="action-btn-secondary"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="action-btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              {getActionText('addEntity')}
            </button>
          </div>
        </form>
      )}

      {isTransferring && (
        <div className="fixed inset-0 z-40 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleTransferBetweenEntitys} className="section-card w-full max-w-3xl p-6 animate-in fade-in zoom-in-95">
            <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Send</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <select
                className="control-input"
                value={transferFromEntityId}
                onChange={e => setTransferFromEntityId(e.target.value)}
                disabled={!canManageImpact}
                required
              >
                <option value="">From</option>
                {entities.map(entity => {
                  const s = entityStats.get(entity.id);
                  return <option key={entity.id} value={entity.id}>{getEntityDisplayName(entity.name)} ({formatValue(s?.net ?? 0)})</option>;
                })}
              </select>
              <select
                className="control-input"
                value={transferToEntityId}
                onChange={e => setTransferToEntityId(e.target.value)}
                disabled={!canManageImpact}
                required
              >
                <option value="">To</option>
                {entities.map(entity => {
                  const s = entityStats.get(entity.id);
                  return <option key={entity.id} value={entity.id}>{getEntityDisplayName(entity.name)} ({formatValue(s?.net ?? 0)})</option>;
                })}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="control-input"
                placeholder="Units"
                value={transferAmount}
                onChange={e => settransferAmount(e.target.value)}
                onBlur={() => normalizeValueInput(transferAmount, settransferAmount)}
                disabled={!canManageImpact}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsTransferring(false);
                  setTransferFromEntityId('');
                  setTransferToEntityId('');
                  settransferAmount('');
                }}
                className="action-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={!canManageImpact} className="action-btn-primary disabled:opacity-50">
                Send
              </button>
            </div>
          </form>
        </div>
      )}

      {isActivityRecordingDeferred && (
        <div className="fixed inset-0 z-40 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleActivityRecordDeferredActivityRecord} className="section-card w-full max-w-3xl p-6 animate-in fade-in zoom-in-95">
            <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Add pending</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <select
                className="control-input"
                value={deferredEntityId}
                onChange={e => setDeferredEntityId(e.target.value)}
                disabled={!canActivityRecordDeferred}
                required
              >
                <option value="">Entity</option>
                {entities.map(entity => {
                  const s = entityStats.get(entity.id);
                  return <option key={entity.id} value={entity.id}>{getEntityDisplayName(entity.name)} ({formatValue(s?.net ?? 0)})</option>;
                })}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="control-input"
                placeholder="Units"
                value={deferredAmount}
                onChange={e => setDeferredAmount(e.target.value)}
                onBlur={() => normalizeValueInput(deferredAmount, setDeferredAmount)}
                disabled={!canActivityRecordDeferred}
                required
              />
              <select
                className="control-input"
                value={deferredDirection}
                onChange={e => setDeferredDirection(e.target.value as 'inbound' | 'outbound')}
                disabled={!canActivityRecordDeferred}
              >
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsActivityRecordingDeferred(false);
                  setDeferredEntityId('');
                  setDeferredAmount('');
                  setDeferredDirection('outbound');
                }}
                className="action-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={!canActivityRecordDeferred} className="action-btn-primary disabled:opacity-50">
                {getActionText('recordDeferredActivityRecord')}
              </button>
            </div>
          </form>
        </div>
      )}

      {isActivityRecordingOutputRequest && (
        <div className="fixed inset-0 z-40 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleActivityRecordAlignmentRequest} className="section-card w-full max-w-3xl p-6 animate-in fade-in zoom-in-95">
            <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Adjust</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <select
                className="control-input"
                value={outputRequestEntityId}
                onChange={e => setOutputRequestEntityId(e.target.value)}
                disabled={!canManageImpact}
                required
              >
                <option value="">Select Entity</option>
                {entities.map(entity => {
                  const s = entityStats.get(entity.id);
                  return <option key={entity.id} value={entity.id}>{getEntityDisplayName(entity.name)} ({formatValue(s?.net ?? 0)})</option>;
                })}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="control-input"
                placeholder="Units"
                value={outputRequestAmount}
                onChange={e => setOutputRequestAmount(e.target.value)}
                onBlur={() => normalizeValueInput(outputRequestAmount, setOutputRequestAmount)}
                disabled={!canManageImpact}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsActivityRecordingOutputRequest(false);
                  setOutputRequestEntityId('');
                  setOutputRequestAmount('');
                }}
                className="action-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={!canManageImpact} className="action-btn-primary disabled:opacity-50">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredEntitys.map(entity => {
            const stats = entityStats.get(entity.id) || { net: 0, activitys: 0, lastActive: null, surpluses: 0, totalInflow: 0, avgActivity: 0 };
            const isCardActive = activeCardAction?.entityId === entity.id;
            return (
              <div key={entity.id} className="flex flex-col gap-0">
                <EntityGridCard
                  entity={entity}
                  stats={stats}
                  onOpenProfile={() => openEntityProfile(entity.id)}
                  onOpenSnapshot={() => setQuickViewEntity(entity)}
                  canManageImpact={canManageImpact}
                  canActivityRecordDeferred={canActivityRecordDeferred}
                  activeAction={isCardActive ? activeCardAction!.action : null}
                  onAction={(action) => setActiveCardAction(isCardActive && activeCardAction?.action === action ? null : { entityId: entity.id, action })}
                  onDelete={() => { void handleDeleteEntityProfile(entity); }}
                />
                {isCardActive && (
                  <div className="border border-t-0 border-stone-200 dark:border-stone-700 rounded-b-xl bg-stone-50 dark:bg-stone-800/60 px-4 py-3 animate-in slide-in-from-top-1 fade-in duration-150">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500 mb-2">
                      {activeCardAction.action === 'send' ? 'Send from' : activeCardAction.action === 'adjust' ? 'Adjust' : 'Add pending for'} · {getEntityDisplayName(entity.name)}
                    </p>
                    {activeCardAction.action === 'send' && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!canManageImpact) return;
                          try {
                            const parsed = Number(transferAmount);
                            if (!Number.isFinite(parsed) || parsed <= 0) { setImportStatus({ type: 'error', message: 'Amount must be greater than 0.' }); return; }
                            await transferUnits({ from_entity_id: entity.id, to_entity_id: transferToEntityId, amount: parsed });
                            setImportStatus({ type: 'success', message: 'Transfer complete.' });
                            setActiveCardAction(null);
                            setTransferToEntityId('');
                            settransferAmount('');
                          } catch (err: any) { setImportStatus({ type: 'error', message: err?.message || 'Transfer failed.' }); }
                        }}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <select
                          className="control-input flex-1 min-w-[140px] text-xs py-1.5"
                          value={transferToEntityId}
                          onChange={e => setTransferToEntityId(e.target.value)}
                          required
                        >
                          <option value="">To</option>
                          {entities.filter(en => en.id !== entity.id).map(en => {
                            const s = entityStats.get(en.id);
                            return <option key={en.id} value={en.id}>{getEntityDisplayName(en.name)} ({formatValue(s?.net ?? 0)})</option>;
                          })}
                        </select>
                        <input type="number" min="0.01" step="0.01" className="control-input w-28 text-xs py-1.5" placeholder="Units" value={transferAmount} onChange={e => settransferAmount(e.target.value)} required />
                        <button type="submit" className="action-btn-primary text-xs px-3 py-1.5">Send</button>
                        <button type="button" onClick={() => { setActiveCardAction(null); setTransferToEntityId(''); settransferAmount(''); }} className="action-btn-secondary text-xs px-3 py-1.5">Cancel</button>
                      </form>
                    )}
                    {activeCardAction.action === 'adjust' && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!canManageImpact) return;
                          try {
                            const parsed = Number(outputRequestAmount);
                            if (!Number.isFinite(parsed) || parsed <= 0) { setImportStatus({ type: 'error', message: 'Amount must be greater than 0.' }); return; }
                            await addRecord({ entity_id: entity.id, direction: 'decrease', unit_amount: parsed, status: 'pending', notes: 'Adjustment request' });
                            setImportStatus({ type: 'success', message: 'Adjustment submitted.' });
                            setActiveCardAction(null);
                            setOutputRequestAmount('');
                          } catch (err: any) { setImportStatus({ type: 'error', message: err?.message || 'Adjustment failed.' }); }
                        }}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="number" min="0.01" step="0.01" className="control-input w-28 text-xs py-1.5" placeholder="Units" value={outputRequestAmount} onChange={e => setOutputRequestAmount(e.target.value)} required />
                        <button type="submit" className="action-btn-primary text-xs px-3 py-1.5">Save</button>
                        <button type="button" onClick={() => { setActiveCardAction(null); setOutputRequestAmount(''); }} className="action-btn-secondary text-xs px-3 py-1.5">Cancel</button>
                      </form>
                    )}
                    {activeCardAction.action === 'pending' && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!canActivityRecordDeferred) return;
                          try {
                            const parsed = Number(deferredAmount);
                            if (!Number.isFinite(parsed) || parsed <= 0) { setImportStatus({ type: 'error', message: 'Amount must be greater than 0.' }); return; }
                            await requestAdjustment({ entity_id: entity.id, amount: parsed, type: deferredDirection === 'outbound' ? 'input' : 'output', requested_at: new Date().toISOString() });
                            setImportStatus({ type: 'success', message: 'Pending record added.' });
                            setActiveCardAction(null);
                            setDeferredAmount('');
                            setDeferredDirection('outbound');
                          } catch (err: any) { setImportStatus({ type: 'error', message: err?.message || 'Failed to add pending record.' }); }
                        }}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="number" min="0.01" step="0.01" className="control-input w-28 text-xs py-1.5" placeholder="Units" value={deferredAmount} onChange={e => setDeferredAmount(e.target.value)} required />
                        <select className="control-input text-xs py-1.5" value={deferredDirection} onChange={e => setDeferredDirection(e.target.value as 'inbound' | 'outbound')}>
                          <option value="outbound">Outbound</option>
                          <option value="inbound">Inbound</option>
                        </select>
                        <button type="submit" className="action-btn-primary text-xs px-3 py-1.5">Add</button>
                        <button type="button" onClick={() => { setActiveCardAction(null); setDeferredAmount(''); setDeferredDirection('outbound'); }} className="action-btn-secondary text-xs px-3 py-1.5">Cancel</button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredEntitys.length === 0 && (
            <div className="section-card p-8 text-center text-stone-400 sm:col-span-2 xl:col-span-3">
              <p>No entities found.</p>
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="action-btn-primary text-xs px-3 py-1.5 mt-3"
              >
                Add first entity
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="section-card overflow-hidden">
          <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
            {filteredEntitys.map(entity => {
              const stats = entityStats.get(entity.id) || { net: 0, activitys: 0, lastActive: null, surpluses: 0, totalInflow: 0, avgActivity: 0 };
              return (
                <MobileActivityRecordCard
                  key={entity.id}
                  title={getEntityDisplayName(entity.name)}
                  right={
                    <span className={cn(
                      "font-mono text-sm font-medium",
                      stats.net > 0 ? "text-emerald-600 dark:text-emerald-400" : stats.net < 0 ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400"
                    )}>
                      {formatValue(stats.net)}
                    </span>
                  }
                  meta={<span>{stats.activitys} · {stats.lastActive ? formatDate(stats.lastActive) : 'Never'}</span>}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className={cn(
                      "font-mono text-sm",
                      stats.net > 0 ? "text-emerald-600 dark:text-emerald-400" : stats.net < 0 ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400"
                    )}>
                      {formatValue(stats.net)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {canManageImpact && (
                        <button
                          onClick={() => openTransferForm(entity.id)}
                          className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
                          title="TransferAmount from this entity"
                        >
                          <ArrowRightLeft size={16} />
                        </button>
                      )}
                      {canActivityRecordDeferred && (
                        <button
                          onClick={() => openDeferredForm(entity.id)}
                          className="p-1.5 text-stone-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-md transition-colors"
                          title="Add Pending ActivityRecord"
                        >
                          <Clock size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => openEntityProfile(entity.id)}
                        className="action-btn-secondary text-xs px-2.5 py-1"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => setQuickViewEntity(entity)}
                        className="action-btn-secondary text-xs px-2.5 py-1"
                      >
                        Snapshot
                      </button>
                      {canManageImpact && (
                        <button
                          onClick={() => { void handleDeleteEntityProfile(entity); }}
                          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                          title="Delete entity"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </MobileActivityRecordCard>
              );
            })}
            {filteredEntitys.length === 0 && (
              <EmptyState
                title="No entities found."
                description="Refine your search or add a new entity."
                onAction={() => setIsAdding(true)}
                actionLabel="Add first entity"
                actionIcon={<Plus size={14} />}
                className="py-12"
              />
            )}
          </div>

          <CollapsibleActivitySection
            title="Entities"
            summary={`${filteredEntitys.length} entities`}
            className="hidden md:block"
            defaultExpanded={false}
            maxExpandedHeightClass="max-h-[560px]"
            maxCollapsedHeightClass="max-h-[96px]"
            contentRef={entitysActivityContainerRef}
            onContentScroll={event => setEntitysActivityScrollTop(event.currentTarget.scrollTop)}
          >
          <table className="desktop-grid desktop-sticky-first desktop-sticky-last w-full min-w-[980px] activity-fixed text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-stone-50/95 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
              <tr>
                <th className="sticky-col px-6 py-2.5 w-[270px] text-[11px] font-semibold uppercase tracking-wide">Name</th>
                <th className="px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Total</th>
                <th className="px-6 py-2.5 w-[180px] text-[11px] font-semibold uppercase tracking-wide">Performance</th>
                <th className="px-6 py-2.5 w-[150px] text-[11px] font-semibold uppercase tracking-wide">Last Active</th>
                <th className="px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Tags</th>
                <th className="sticky-col-right px-6 py-2.5 w-[140px] text-right text-[11px] font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {entityTopSpacerHeight > 0 && (
                <tr>
                  <td colSpan={6} style={{ height: `${entityTopSpacerHeight}px`, padding: 0, border: 0 }} />
                </tr>
              )}

              {visibleEntitys.map(entity => {
                const stats = entityStats.get(entity.id) || { net: 0, activitys: 0, lastActive: null, surpluses: 0, totalInflow: 0, avgActivity: 0 };
                
                return (
                  <EntityRow 
                    key={entity.id} 
                    entity={entity} 
                    stats={stats} 
                    updateEntity={updateEntity}
                    onOpenProfile={() => openEntityProfile(entity.id)}
                    onOpenSnapshot={() => setQuickViewEntity(entity)}
                    collaborations={collaborations}
                    canManageImpact={canManageImpact}
                    canActivityRecordDeferred={canActivityRecordDeferred}
                    onTransferFromEntity={() => openTransferForm(entity.id)}
                    onActivityRecordDeferred={() => openDeferredForm(entity.id)}
                    onDelete={() => { void handleDeleteEntityProfile(entity); }}
                  />
                );
              })}

              {entityBottomSpacerHeight > 0 && (
                <tr>
                  <td colSpan={6} style={{ height: `${entityBottomSpacerHeight}px`, padding: 0, border: 0 }} />
                </tr>
              )}

              {filteredEntitys.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-stone-400">
                    <div className="flex flex-col items-center gap-2">
                      <span>No entities found.</span>
                      <button
                        type="button"
                        onClick={() => setIsAdding(true)}
                        className="action-btn-primary text-xs px-3 py-1.5"
                      >
                        Add first entity
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </CollapsibleActivitySection>
        </div>
      )}

      {quickViewEntity && (
        <EntitySnapshot
          entity={quickViewEntity}
          type="entity"
          onClose={() => setQuickViewEntity(null)}
          onUpdateTags={(entityId, tags) => { void handleUpdateEntityTags(entityId, tags); }}
          activityNet={entityStats.get(quickViewEntity.id)?.net || 0}
          variant="modal"
        />
      )}

      {entriesViewEntity && (
        <div className="fixed inset-0 z-50 p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="section-card rounded-2xl shadow-xl w-full max-w-6xl mx-auto h-[92vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{getEntityDisplayName(entriesViewEntity.name)} • Entries</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{quickViewEntries.length} records</p>
              </div>
              <div className="flex items-center gap-2">

                <button
                  type="button"
                  onClick={() => {
                    setQuickViewEntity(entriesViewEntity);
                    setEntriesViewEntity(null);
                  }}
                  className="action-btn-secondary"
                >
                  Back to Snapshot
                </button>
              </div>
            </div>

            <div className="p-5 overflow-auto">
              <div className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
                {quickViewEntries.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
                    No entity records yet.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 sticky top-0">
                      <tr>
                        <th className="text-left font-medium px-4 py-2.5">Date</th>
                        <th className="text-left font-medium px-4 py-2.5">Activity</th>
                        <th className="text-right font-medium px-4 py-2.5">Entity Input</th>
                        <th className="text-right font-medium px-4 py-2.5">Total</th>
                        <th className="text-right font-medium px-4 py-2.5">Total Units</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {quickViewEntries.map(record => (
                        <tr key={record.id} className="bg-white dark:bg-stone-900">
                          <td className="px-4 py-2.5 text-stone-600 dark:text-stone-300 whitespace-nowrap">
                            {record.date ? formatDate(record.date) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-stone-600 dark:text-stone-300">
                            <div className="flex items-center gap-2">
                              <span className="truncate">{record.location}</span>
                              {record.isActive && (
                                <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px]">
                                  Active
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-stone-600 dark:text-stone-300 whitespace-nowrap">
                            {formatValue(record.inflow)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-stone-600 dark:text-stone-300 whitespace-nowrap">
                            {formatValue(record.outflow)}
                          </td>
                          <td
                            className={cn(
                              'px-4 py-2.5 text-right font-mono whitespace-nowrap',
                              record.net > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : record.net < 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-stone-500 dark:text-stone-400',
                            )}
                          >
                            {formatValue(record.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EntityGridCard({
  entity,
  stats,
  onOpenProfile,
  onOpenSnapshot,
  canManageImpact,
  canActivityRecordDeferred,
  activeAction,
  onAction,
  onDelete,
}: {
  entity: Entity;
  stats: { net: number; activitys: number; lastActive: string | null; surpluses: number; totalInflow: number; avgActivity: number };
  onOpenProfile: () => void;
  onOpenSnapshot: () => void;
  canManageImpact: boolean;
  canActivityRecordDeferred: boolean;
  activeAction: 'send' | 'adjust' | 'pending' | null;
  onAction: (action: 'send' | 'adjust' | 'pending') => void;
  onDelete: () => void;
}) {
  return (
    <div className={cn(
      "section-card-hover min-w-0",
      activeAction ? "rounded-b-none border-b-0" : ""
    )}>
      {/* Header: name + net */}
      <div className="p-5 cursor-pointer" onClick={onOpenProfile}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-stone-900 dark:text-stone-100 truncate" title={getEntityDisplayName(entity.name)}>{getEntityDisplayName(entity.name)}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {stats.activitys > 0 ? `${stats.activitys} · ` : ''}{stats.lastActive ? formatDate(stats.lastActive) : 'No activity'}
            </p>
          </div>
          <span className={cn(
            "font-mono text-lg font-semibold tabular-nums shrink-0",
            stats.net > 0 ? "text-emerald-600 dark:text-emerald-400" : stats.net < 0 ? "text-red-600 dark:text-red-400" : "text-stone-400 dark:text-stone-500"
          )}>
            {formatValue(stats.net)}
          </span>
        </div>

        {/* Icon stat row */}
        <div className="mt-3 flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500">
          {stats.totalInflow > 0 && (
            <span className="flex items-center gap-1">
              <TrendingUp size={11} className="text-emerald-500" />
              {formatValue(stats.totalInflow)}
            </span>
          )}
          {stats.activitys > 0 && (
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {stats.activitys}
            </span>
          )}
          {stats.surpluses > 0 && (
            <span className="flex items-center gap-1">
              <Award size={11} className="text-amber-500" />
              {stats.surpluses}
            </span>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="px-4 pb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {canManageImpact && (
            <button
              onClick={e => { e.stopPropagation(); onAction('send'); }}
              className={cn(
                "flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors font-medium",
                activeAction === 'send'
                  ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400"
                  : "border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-amber-300 hover:text-amber-600 dark:hover:text-amber-400"
              )}
            >
              <ArrowRightLeft size={12} />
              Send
            </button>
          )}
          {canManageImpact && (
            <button
              onClick={e => { e.stopPropagation(); onAction('adjust'); }}
              className={cn(
                "flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors font-medium",
                activeAction === 'adjust'
                  ? "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-900/20 dark:border-sky-700 dark:text-sky-400"
                  : "border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-sky-300 hover:text-sky-600 dark:hover:text-sky-400"
              )}
            >
              <Edit2 size={12} />
              Adjust
            </button>
          )}
          {canActivityRecordDeferred && (
            <button
              onClick={e => { e.stopPropagation(); onAction('pending'); }}
              className={cn(
                "flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors font-medium",
                activeAction === 'pending'
                  ? "bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-400"
                  : "border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-purple-300 hover:text-purple-600 dark:hover:text-purple-400"
              )}
            >
              <Clock size={12} />
              Pending
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); onOpenSnapshot(); }}
            className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-md transition-colors"
            title="Snapshot"
          >
            <Eye size={14} />
          </button>
          {canManageImpact && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EntityRow({ entity, stats, updateEntity, onOpenProfile, onOpenSnapshot, collaborations, canManageImpact, canActivityRecordDeferred, onTransferFromEntity, onActivityRecordDeferred, onDelete }: { entity: Entity, stats: any, updateEntity: (p: Entity) => Promise<void>, onOpenProfile: () => void, onOpenSnapshot: () => void, collaborations: Collaboration[], canManageImpact: boolean, canActivityRecordDeferred: boolean, onTransferFromEntity: () => void, onActivityRecordDeferred: () => void, onDelete: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [data, setData] = useState(entity);

  const normalizeValueInput = (value: string, setValue: (next: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    setValue(parsed.toFixed(2));
  };

  const handleSave = async () => {
    await updateEntity(data);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <tr className="bg-stone-50 dark:bg-stone-800">
        <td className="sticky-col px-6 py-3">
          <input 
            className="w-full p-1 border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 mb-1" 
            value={data.name} 
            onChange={e => setData({...data, name: e.target.value})} 
          />
        </td>
        <td className="px-6 py-3">
          <span className="font-mono text-stone-600 dark:text-stone-300 text-sm">
            {formatValue(stats.net)}
          </span>
        </td>
        <td className="px-6 py-3" colSpan={2}>
          <select
            className="w-full p-1 border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 text-xs mb-1"
            value={data.collaboration_id || ''}
            onChange={e => setData({...data, collaboration_id: e.target.value || undefined})}
          >
            <option value="">Collaboration attribution (optional)</option>
            {collaborations.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </td>
        <td className="px-6 py-3">
          {/* Simple tag edit - comma separated for now to save space */}
          <input 
            className="w-full p-1 border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 text-xs" 
            value={data.tags?.join(', ') || ''} 
            placeholder="Tags (comma separated)"
            onChange={e => setData({...data, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)})} 
          />
        </td>
        <td className="sticky-col-right px-6 py-3 text-right">
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsEditing(false)} className="p-1 text-stone-400 hover:text-stone-600">
              <X size={16} />
            </button>
            <button onClick={handleSave} className="p-1 text-emerald-600 hover:text-emerald-700">
              <Save size={16} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors group">
      <td className="sticky-col px-6 py-2.5 cursor-pointer" onClick={onOpenProfile}>
        <div className="font-medium text-stone-900 dark:text-stone-100 flex items-center gap-2">
          {getEntityDisplayName(entity.name)}
          <Eye size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
        </div>
      </td>
      <td className="px-6 py-2.5">
        <div className={cn(
          "font-mono font-medium",
          stats.net > 0 ? "text-emerald-600 dark:text-emerald-400" : stats.net < 0 ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400"
        )}>
          {formatValue(stats.net)}
        </div>
      </td>
      <td className="px-6 py-2.5">
        <div className={cn(
          "font-mono font-medium flex items-center gap-1",
          stats.net > 0 ? "text-emerald-600 dark:text-emerald-400" : stats.net < 0 ? "text-red-600 dark:text-red-400" : "text-stone-500"
        )}>
          {stats.net > 0 ? <TrendingUp size={14} /> : stats.net < 0 ? <TrendingDown size={14} /> : null}
          {formatValue(stats.net)}
        </div>
        <div className="text-xs text-stone-400 mt-0.5">
          {stats.activitys} activities ({stats.surpluses} positive)
        </div>
      </td>
      <td className="px-6 py-2.5 text-stone-500 dark:text-stone-400">
        <div className="flex items-center gap-1.5">
          <Calendar size={14} className="text-stone-400" />
          {stats.lastActive ? formatDate(stats.lastActive) : 'Never'}
        </div>
      </td>
      <td className="px-6 py-2.5">
        <div className="flex flex-wrap gap-1">
          {/* Auto-badges based on stats */}
          {stats.activitys > 5 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
              Regular
            </span>
          )}
          {stats.net > 1000 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800">
              <Award size={8} className="mr-1" />
              High Roller
            </span>
          )}

          {entity.tags?.map(tag => (
            <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
              {tag}
            </span>
          ))}
        </div>
      </td>
      <td className="sticky-col-right px-6 py-2.5 text-right">
        <div className="flex justify-end gap-2 transition-opacity">
          {canManageImpact && (
            <button
              onClick={onTransferFromEntity}
              className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
              title="TransferAmount from this entity"
            >
              <ArrowRightLeft size={16} />
            </button>
          )}
          {canActivityRecordDeferred && (
            <button
              onClick={onActivityRecordDeferred}
              className="p-1.5 text-stone-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-md transition-colors"
              title="Add Pending ActivityRecord"
            >
              <Clock size={16} />
            </button>
          )}
          <button 
            onClick={onOpenSnapshot}
            className="action-btn-secondary text-xs px-2.5 py-1"
            title="Open quick snapshot"
          >
            Quick Snapshot
          </button>
          <button 
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-md transition-colors"
            title="Edit"
          >
            <Edit2 size={16} />
          </button>
          {canManageImpact && (
            <button
              onClick={onDelete}
              className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="Delete entity"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
