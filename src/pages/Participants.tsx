import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Search, Plus, Tag, X, TrendingUp, TrendingDown, Calendar, Award, Edit2, Save, Eye, Clock, Download, LayoutGrid, List, ArrowRightLeft, Trash2 } from 'lucide-react';
import { Associate, Entity } from '../types';
type Participant = Entity;
import { formatValue, formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import MobileRecordCard from '../components/MobileRecordCard';
import CollapsibleWorkspaceSection from '../components/CollapsibleWorkspaceSection';
import { useAppRole } from '../context/AppRoleContext';
import DataActionMenu from '../components/DataActionMenu';
import ParticipantSnapshot from '../components/ParticipantSnapshot';
import { useLabels } from '../lib/labels';

const getParticipantDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed Participant';
};

export default function Participants({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { units: units, addUnit, requestAdjustment, importUnits, updateUnit, deleteUnit, transferUnitTotal, recordOutputRequest, entries, workspaces, associates } = useData();
  const { canAccessAdminUi, canOperateLog, canManageValue } = useAppRole();
  const { getActionText, tx } = useLabels();
  const canRecordDeferred = canOperateLog;
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isRecordingOutputRequest, setIsRecordingOutputRequest] = useState(false);
  const [isRecordingDeferred, setIsRecordingDeferred] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'workspace'>('grid');
  const [quickViewParticipant, setQuickViewParticipant] = useState<Participant | null>(null);
  const [entriesViewParticipant, setEntriesViewParticipant] = useState<Participant | null>(null);
  const [participantsWorkspaceScrollTop, setParticipantsWorkspaceScrollTop] = useState(0);
  const participantsWorkspaceContainerRef = useRef<HTMLDivElement | null>(null);
  const [deletingParticipantId, setDeletingParticipantId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Participant Form
  const [name, setName] = useState('');
  const [profileTotal, setProfileTotal] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [currentTag, setCurrentTag] = useState('');
  const [attributedAssociateId, setAttributedAssociateId] = useState('');
  const [transferFromParticipantId, setTransferFromParticipantId] = useState('');
  const [transferToParticipantId, setTransferToParticipantId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [outputRequestParticipantId, setOutputRequestParticipantId] = useState('');
  const [outputRequestAmount, setOutputRequestAmount] = useState('');
  const [deferredParticipantId, setDeferredParticipantId] = useState('');
  const [deferredAmount, setDeferredAmount] = useState('');
  const [deferredDirection, setDeferredDirection] = useState<'inbound' | 'outbound'>('outbound');

  const openTransferForm = (fromParticipantId?: string) => {
    setIsTransferring(true);
    if (fromParticipantId) {
      setTransferFromParticipantId(fromParticipantId);
      if (transferToParticipantId === fromParticipantId) {
        setTransferToParticipantId('');
      }
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openDeferredForm = (participantId?: string) => {
    setIsRecordingDeferred(true);
    setDeferredParticipantId(participantId || '');
    setDeferredAmount('');
    setDeferredDirection('outbound');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openParticipantProfile = (participantId: string) => {
    navigate(`/participants/${participantId}`);
  };

  const normalizeValueInput = (value: string, setValue: (next: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    setValue(parsed.toFixed(2));
  };

  // --- Smart Stats Calculation ---
  const participantStats = useMemo(() => {
    const stats = new Map<string, { net: number; activitys: number; lastActive: string | null; surpluses: number; totalInflow: number; avgActivity: number }>();

    units.forEach(p => {
      const participantEntries = entries.filter(l => l.unit_id === p.id);
      const net = participantEntries.reduce((sum, e) => sum + e.net, 0);
      const totalInflow = participantEntries.reduce((sum, e) => sum + e.input_amount, 0);
      const activitys = participantEntries.length;
      const surpluses = participantEntries.filter(e => e.net > 0).length;
      
      // Calculate average activity duration
      let totalDuration = 0;
      let durationCount = 0;
      participantEntries.forEach(e => {
        if (e.joined_at && e.left_at) {
          totalDuration += (new Date(e.left_at).getTime() - new Date(e.joined_at).getTime()) / (1000 * 60 * 60);
          durationCount++;
        }
      });
      const avgActivity = durationCount > 0 ? totalDuration / durationCount : 0;
      
      // Find last played date
      let lastActive = null;
      if (participantEntries.length > 0) {
        // Get workspace dates
        const dates = participantEntries.map(e => {
          const workspace = workspaces.find(g => g.id === e.workspace_id);
          return workspace ? workspace.date : '';
        }).filter(d => d).sort();
        lastActive = dates.length > 0 ? dates[dates.length - 1] : null;
      }

      stats.set(p.id, { net, activitys, lastActive, surpluses, totalInflow, avgActivity });
    });

    return stats;
  }, [units, entries, workspaces]);

  const workspaceById = useMemo(() => {
    return new Map(workspaces.map(workspace => [workspace.id, workspace]));
  }, [workspaces]);

  const activeProfileParticipant = quickViewParticipant ?? entriesViewParticipant;

  const quickViewEntries = useMemo(() => {
    if (!activeProfileParticipant) return [];

    return entries
      .filter(entry => entry.unit_id === activeProfileParticipant.id)
      .map(entry => {
        const workspace = workspaceById.get(entry.workspace_id);
        const sortTimestamp =
          entry.left_at ||
          entry.joined_at ||
          entry.created_at ||
          (workspace?.date ? `${workspace.date}T00:00:00.000Z` : '');

        return {
          id: entry.id,
          date: workspace?.date || (entry.created_at ? entry.created_at.split('T')[0] : ''),
          location: workspace?.location || 'Activity',
          workspaceStatus: workspace?.status || null,
          inflow: entry.input_amount || 0,
          outflow: entry.output_amount || 0,
          net: entry.net || 0,
          isActive: !entry.left_at,
          sortTimestamp,
        };
      })
      .sort((a, b) => new Date(b.sortTimestamp || 0).getTime() - new Date(a.sortTimestamp || 0).getTime());
  }, [activeProfileParticipant, entries, workspaceById]);

  const filteredParticipants = units.filter(participant => 
    participant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    participant.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const PARTICIPANT_ROW_HEIGHT = 58;
  const PARTICIPANT_OVERSCAN = 10;
  const PARTICIPANT_VIEWPORT_HEIGHT = 560;
  const shouldWindowParticipantsWorkspace = viewMode === 'workspace' && filteredParticipants.length > 120;
  const participantVisibleCount = Math.ceil(PARTICIPANT_VIEWPORT_HEIGHT / PARTICIPANT_ROW_HEIGHT) + PARTICIPANT_OVERSCAN * 2;
  const participantStartIndex = shouldWindowParticipantsWorkspace
    ? Math.max(0, Math.floor(participantsWorkspaceScrollTop / PARTICIPANT_ROW_HEIGHT) - PARTICIPANT_OVERSCAN)
    : 0;
  const participantEndIndex = shouldWindowParticipantsWorkspace
    ? Math.min(filteredParticipants.length, participantStartIndex + participantVisibleCount)
    : filteredParticipants.length;
  const visibleParticipants = shouldWindowParticipantsWorkspace
    ? filteredParticipants.slice(participantStartIndex, participantEndIndex)
    : filteredParticipants;
  const participantTopSpacerHeight = shouldWindowParticipantsWorkspace ? participantStartIndex * PARTICIPANT_ROW_HEIGHT : 0;
  const participantBottomSpacerHeight = shouldWindowParticipantsWorkspace
    ? Math.max(0, (filteredParticipants.length - participantEndIndex) * PARTICIPANT_ROW_HEIGHT)
    : 0;

  useEffect(() => {
    setParticipantsWorkspaceScrollTop(0);
    if (participantsWorkspaceContainerRef.current) {
      participantsWorkspaceContainerRef.current.scrollTop = 0;
    }
  }, [searchTerm, viewMode]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (action !== 'add-participant' && action !== 'add-deferred') return;

    if (action === 'add-deferred') {
      openDeferredForm();
    } else {
      setIsAdding(true);
    }
    const next = new URLSearchParams(location.search);
    next.delete('action');
    navigate({ pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    const displayName = name.trim();
    if (displayName.length === 0) {
      setImportStatus({ type: 'error', message: 'Name is required.' });
      return;
    }

    try {
      const parsedTotal = profileTotal.trim() === '' ? undefined : Number(profileTotal);

      await addUnit({ 
        name: displayName,
        tags,
        total: Number.isFinite(parsedTotal as number) ? parsedTotal : undefined,
        attributed_associate_id: attributedAssociateId || undefined
      });
      setIsAdding(false);
      resetForm();
    } catch (error: any) {
      const message = error?.message || 'Unable to save participant.';
      setImportStatus({ type: 'error', message });
    }
  };

  const resetForm = () => {
    setName('');
    setProfileTotal('');
    setTags([]);
    setCurrentTag('');
    setAttributedAssociateId('');
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







  const handleTransferBetweenParticipants = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageValue) {
      setImportStatus({ type: 'error', message: 'Only admin can transfer participant totals.' });
      return;
    }
    try {
      const parsedAmount = Number(transferAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setImportStatus({ type: 'error', message: 'Transfer amount must be greater than 0.' });
        return;
      }

      await transferUnitTotal(transferFromParticipantId, transferToParticipantId, parsedAmount);
      setImportStatus({ type: 'success', message: 'Participant transfer completed.' });
      setIsTransferring(false);
      setTransferFromParticipantId('');
      setTransferToParticipantId('');
      setTransferAmount('');
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to transfer total.' });
    }
  };

  const handleRecordAlignmentRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageValue) {
      setImportStatus({ type: 'error', message: 'Only admin can record alignment requests.' });
      return;
    }

    try {
      const parsedAmount = Number(outputRequestAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setImportStatus({ type: 'error', message: 'Alignment amount must be greater than 0.' });
        return;
      }

      await recordOutputRequest(outputRequestParticipantId, parsedAmount);
      setImportStatus({ type: 'success', message: 'Outflow request submitted and marked pending for admin approval.' });
      setIsRecordingOutputRequest(false);
      setOutputRequestParticipantId('');
      setOutputRequestAmount('');
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to record alignment request.' });
    }
  };

  const handleRecordDeferredEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRecordDeferred) {
      setImportStatus({ type: 'error', message: 'Only admin or operator can record deferred entries.' });
      return;
    }

    try {
      const parsedAmount = Number(deferredAmount);
      if (!deferredParticipantId) {
        setImportStatus({ type: 'error', message: 'Select a participant first.' });
        return;
      }
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setImportStatus({ type: 'error', message: 'Deferred entry amount must be greater than 0.' });
        return;
      }

      await requestAdjustment({
        unit_id: deferredParticipantId,
        amount: parsedAmount,
        type: deferredDirection === 'outbound' ? 'input' : 'output',
        requested_at: new Date().toISOString(),
      });

      setImportStatus({ type: 'success', message: 'Deferred entry submitted and marked pending for admin approval.' });
      setIsRecordingDeferred(false);
      setDeferredParticipantId('');
      setDeferredAmount('');
      setDeferredDirection('outbound');
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to add pending entry.' });
    }
  };

  const handleDeleteParticipantProfile = async (participant: Participant) => {
    if (deletingParticipantId === participant.id) return;
    if (!canManageValue) {
      setImportStatus({ type: 'error', message: 'Only admin can delete participant profiles.' });
      return;
    }

    const confirmed = window.confirm(`Delete ${getParticipantDisplayName(participant.name)} profile? This cannot be undone.`);
    if (!confirmed) return;

    try {
      setDeletingParticipantId(participant.id);
      await deleteUnit(participant.id);
      setImportStatus({ type: 'success', message: 'Participant profile deleted.' });
      setQuickViewParticipant(current => (current?.id === participant.id ? null : current));
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to delete participant profile.' });
    } finally {
      setDeletingParticipantId(current => (current === participant.id ? null : current));
    }
  };

  const handleUpdateParticipantTags = async (participantId: string, tags: string[]) => {
    const existing = units.find(entity => entity.id === participantId);
    if (!existing) return;

    try {
      await updateUnit({ ...existing, tags });
      setImportStatus({ type: 'success', message: 'Participant tags updated.' });
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to update participant tags.' });
    }
  };

  const activeParticipantsCount = units.filter(p => (p.total || 0) !== 0).length;
  const positiveDeltaParticipants = units.filter(p => (participantStats.get(p.id)?.net || 0) > 0).length;
  const participantDataMenuItems = [
    { key: 'add-entity-profile', label: getActionText('addParticipant'), onClick: () => setIsAdding(true) },

    {
      key: 'transfer-totals',
      label: 'Transfer Totals',
      onClick: () => {
        if (!canManageValue) {
          setImportStatus({ type: 'error', message: 'Only admin can transfer participant totals.' });
          return;
        }
        openTransferForm();
      },
      disabled: !canManageValue,
    },
    {
      key: 'alignment-request',
      label: 'Record Alignment Request',
      onClick: () => {
        if (!canManageValue) {
          setImportStatus({ type: 'error', message: 'Only admin can record alignment requests.' });
          return;
        }
        setIsRecordingOutputRequest(true);
      },
      disabled: !canManageValue,
    },
    {
      key: 'record-deferred-entry',
      label: getActionText('recordDeferredEntry'),
      onClick: () => {
        if (!canRecordDeferred) {
          setImportStatus({ type: 'error', message: 'Only admin or operator can record deferred entries.' });
          return;
        }
        openDeferredForm();
      },
      disabled: !canRecordDeferred,
    },
  ];

  return (
    <div className="page-shell relative">
      {!canManageValue && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 px-4 py-2 text-sm">
          Admin-only actions: transfer totals, alignment requests, and deferred alignment. Activity operators can still record deferred entries.
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
            <>
              <h3 className="text-base font-medium text-stone-900 dark:text-stone-100">Participants</h3>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">Participants</h2>
            </>
          )}
        </div>
        <div className={cn('flex flex-col items-start gap-3', !embedded && 'lg:items-end')}>
          {!embedded && (
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                <span className="font-mono text-stone-900 dark:text-stone-100">{units.length}</span> participants
              </span>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                <span className="font-mono text-stone-900 dark:text-stone-100">{activeParticipantsCount}</span> active
              </span>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <DataActionMenu items={participantDataMenuItems} />
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
            <span className="font-medium text-stone-900 dark:text-stone-100">{filteredParticipants.length}</span> participants
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
              onClick={() => setViewMode('workspace')}
              className={cn(
                "toggle-compact-button",
                viewMode === 'workspace'
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
        <form onSubmit={handleAddParticipant} className="section-card p-6 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">New Participant</h3>
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
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Used to identify this participant.</p>
            </div>
            <input
              type="number"
              step="0.01"
              className="control-input"
              placeholder="Total (optional)"
              value={profileTotal}
              onChange={e => setProfileTotal(e.target.value)}
            />
            <select
              className="control-input"
              value={attributedAssociateId}
              onChange={e => setAttributedAssociateId(e.target.value)}
            >
              <option value="">Collaboration attribution (optional)</option>
              {associates.map(a => (
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
              className="action-btn-primary"
            >
              {getActionText('addParticipant')}
            </button>
          </div>
        </form>
      )}

      {isTransferring && (
        <div className="fixed inset-0 z-40 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleTransferBetweenParticipants} className="section-card w-full max-w-3xl p-6 animate-in fade-in zoom-in-95">
            <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Transfer Between Participants</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <select
                className="control-input"
                value={transferFromParticipantId}
                onChange={e => setTransferFromParticipantId(e.target.value)}
                disabled={!canManageValue}
                required
              >
                <option value="">From Participant</option>
                {units.map(entity => (
                  <option key={entity.id} value={entity.id}>{getParticipantDisplayName(entity.name)} ({formatValue(entity.total || 0)})</option>
                ))}
              </select>
              <select
                className="control-input"
                value={transferToParticipantId}
                onChange={e => setTransferToParticipantId(e.target.value)}
                disabled={!canManageValue}
                required
              >
                <option value="">To Participant</option>
                {units.map(entity => (
                  <option key={entity.id} value={entity.id}>{getParticipantDisplayName(entity.name)} ({formatValue(entity.total || 0)})</option>
                ))}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="control-input"
                placeholder="Amount"
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
                onBlur={() => normalizeValueInput(transferAmount, setTransferAmount)}
                disabled={!canManageValue}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsTransferring(false);
                  setTransferFromParticipantId('');
                  setTransferToParticipantId('');
                  setTransferAmount('');
                }}
                className="action-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={!canManageValue} className="action-btn-primary disabled:opacity-50">
                Transfer Total
              </button>
            </div>
          </form>
        </div>
      )}

      {isRecordingDeferred && (
        <div className="fixed inset-0 z-40 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleRecordDeferredEntry} className="section-card w-full max-w-3xl p-6 animate-in fade-in zoom-in-95">
            <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">{getActionText('recordDeferredEntry')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <select
                className="control-input"
                value={deferredParticipantId}
                onChange={e => setDeferredParticipantId(e.target.value)}
                disabled={!canRecordDeferred}
                required
              >
                <option value="">Select Participant</option>
                {units.map(entity => (
                  <option key={entity.id} value={entity.id}>{getParticipantDisplayName(entity.name)} ({formatValue(entity.total || 0)})</option>
                ))}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="control-input"
                placeholder="Amount"
                value={deferredAmount}
                onChange={e => setDeferredAmount(e.target.value)}
                onBlur={() => normalizeValueInput(deferredAmount, setDeferredAmount)}
                disabled={!canRecordDeferred}
                required
              />
              <select
                className="control-input"
                value={deferredDirection}
                onChange={e => setDeferredDirection(e.target.value as 'inbound' | 'outbound')}
                disabled={!canRecordDeferred}
              >
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsRecordingDeferred(false);
                  setDeferredParticipantId('');
                  setDeferredAmount('');
                  setDeferredDirection('outbound');
                }}
                className="action-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={!canRecordDeferred} className="action-btn-primary disabled:opacity-50">
                {getActionText('recordDeferredEntry')}
              </button>
            </div>
          </form>
        </div>
      )}

      {isRecordingOutputRequest && (
        <div className="fixed inset-0 z-40 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleRecordAlignmentRequest} className="section-card w-full max-w-3xl p-6 animate-in fade-in zoom-in-95">
            <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Record Participant Alignment Request</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <select
                className="control-input"
                value={outputRequestParticipantId}
                onChange={e => setOutputRequestParticipantId(e.target.value)}
                disabled={!canManageValue}
                required
              >
                <option value="">Select Participant</option>
                {units.map(entity => (
                  <option key={entity.id} value={entity.id}>{getParticipantDisplayName(entity.name)} ({formatValue(entity.total || 0)})</option>
                ))}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="control-input"
                placeholder="Alignment Amount"
                value={outputRequestAmount}
                onChange={e => setOutputRequestAmount(e.target.value)}
                onBlur={() => normalizeValueInput(outputRequestAmount, setOutputRequestAmount)}
                disabled={!canManageValue}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsRecordingOutputRequest(false);
                  setOutputRequestParticipantId('');
                  setOutputRequestAmount('');
                }}
                className="action-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={!canManageValue} className="action-btn-primary disabled:opacity-50">
                Save Alignment Request
              </button>
            </div>
          </form>
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredParticipants.map(entity => {
            const stats = participantStats.get(entity.id) || { net: 0, activitys: 0, lastActive: null, surpluses: 0, totalInflow: 0, avgActivity: 0 };
            return (
              <ParticipantGridCard
                key={entity.id}
                entity={entity}
                stats={stats}
                onOpenProfile={() => openParticipantProfile(entity.id)}
                onOpenSnapshot={() => setQuickViewParticipant(entity)}
                canManageValue={canManageValue}
                canRecordDeferred={canRecordDeferred}
                onTransferFromEntity={() => openTransferForm(entity.id)}
                onRecordDeferred={() => openDeferredForm(entity.id)}
                onDelete={() => { void handleDeleteParticipantProfile(entity); }}
              />
            );
          })}
          {filteredParticipants.length === 0 && (
            <div className="section-card p-8 text-center text-stone-400 sm:col-span-2 xl:col-span-3">
              <p>No participants found.</p>
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="action-btn-primary text-xs px-3 py-1.5 mt-3"
              >
                Add first participant
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="section-card overflow-hidden">
          <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
            {filteredParticipants.map(entity => {
              const stats = participantStats.get(entity.id) || { net: 0, activitys: 0, lastActive: null, surpluses: 0, totalInflow: 0, avgActivity: 0 };
              return (
                <MobileRecordCard
                  key={entity.id}
                  title={getParticipantDisplayName(entity.name)}
                  right={
                    <span className={cn(
                      "font-mono text-sm font-medium",
                      (entity.total || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : (entity.total || 0) < 0 ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400"
                    )}>
                      {formatValue(entity.total || 0)}
                    </span>
                  }
                  meta={<span>{stats.activitys} activities • {stats.lastActive ? formatDate(stats.lastActive) : 'Never active'}</span>}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className={cn(
                      "font-mono text-sm",
                      stats.net > 0 ? "text-emerald-600 dark:text-emerald-400" : stats.net < 0 ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400"
                    )}>
                      Net: {formatValue(stats.net)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {canManageValue && (
                        <button
                          onClick={() => openTransferForm(entity.id)}
                          className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
                          title="Transfer from this participant"
                        >
                          <ArrowRightLeft size={16} />
                        </button>
                      )}
                      {canRecordDeferred && (
                        <button
                          onClick={() => openDeferredForm(entity.id)}
                          className="p-1.5 text-stone-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-md transition-colors"
                          title="Add pending entry"
                        >
                          <Clock size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => openParticipantProfile(entity.id)}
                        className="action-btn-secondary text-xs px-2.5 py-1"
                      >
                        Open Profile
                      </button>
                      <button
                        onClick={() => setQuickViewParticipant(entity)}
                        className="action-btn-secondary text-xs px-2.5 py-1"
                      >
                        Quick Snapshot
                      </button>
                      {canManageValue && (
                        <button
                          onClick={() => { void handleDeleteParticipantProfile(entity); }}
                          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                          title="Delete participant"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </MobileRecordCard>
              );
            })}
            {filteredParticipants.length === 0 && (
              <div className="px-6 py-10 text-center text-stone-400 text-sm">
                <p>No participants found.</p>
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="action-btn-primary text-xs px-3 py-1.5 mt-3"
                >
                  Add first participant
                </button>
              </div>
            )}
          </div>

          <CollapsibleWorkspaceSection
            title="Participants"
            summary={`${filteredParticipants.length} participants`}
            className="hidden md:block"
            defaultExpanded={false}
            maxExpandedHeightClass="max-h-[560px]"
            maxCollapsedHeightClass="max-h-[96px]"
            contentRef={participantsWorkspaceContainerRef}
            onContentScroll={event => setParticipantsWorkspaceScrollTop(event.currentTarget.scrollTop)}
          >
          <table className="desktop-grid desktop-sticky-first desktop-sticky-last w-full min-w-[980px] workspace-fixed text-left text-[13px]">
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
              {participantTopSpacerHeight > 0 && (
                <tr>
                  <td colSpan={6} style={{ height: `${participantTopSpacerHeight}px`, padding: 0, border: 0 }} />
                </tr>
              )}

              {visibleParticipants.map(entity => {
                const stats = participantStats.get(entity.id) || { net: 0, activitys: 0, lastActive: null, surpluses: 0, totalInflow: 0, avgActivity: 0 };
                
                return (
                  <ParticipantRow 
                    key={entity.id} 
                    entity={entity} 
                    stats={stats} 
                    updateUnit={updateUnit}
                    onOpenProfile={() => openParticipantProfile(entity.id)}
                    onOpenSnapshot={() => setQuickViewParticipant(entity)}
                    associates={associates}
                    canManageValue={canManageValue}
                    canRecordDeferred={canRecordDeferred}
                    onTransferFromEntity={() => openTransferForm(entity.id)}
                    onRecordDeferred={() => openDeferredForm(entity.id)}
                    onDelete={() => { void handleDeleteParticipantProfile(entity); }}
                  />
                );
              })}

              {participantBottomSpacerHeight > 0 && (
                <tr>
                  <td colSpan={6} style={{ height: `${participantBottomSpacerHeight}px`, padding: 0, border: 0 }} />
                </tr>
              )}

              {filteredParticipants.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-stone-400">
                    <div className="flex flex-col items-center gap-2">
                      <span>No participants found.</span>
                      <button
                        type="button"
                        onClick={() => setIsAdding(true)}
                        className="action-btn-primary text-xs px-3 py-1.5"
                      >
                        Add first participant
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </CollapsibleWorkspaceSection>
        </div>
      )}

      {quickViewParticipant && (
        <ParticipantSnapshot
          entity={quickViewParticipant}
          type="entity"
          onClose={() => setQuickViewParticipant(null)}
          onUpdateTags={(participantId, tags) => { void handleUpdateParticipantTags(participantId, tags); }}
          workspaceNet={participantStats.get(quickViewParticipant.id)?.net || 0}
          variant="modal"
        />
      )}

      {entriesViewParticipant && (
        <div className="fixed inset-0 z-50 p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="section-card rounded-2xl shadow-xl w-full max-w-6xl mx-auto h-[92vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{getParticipantDisplayName(entriesViewParticipant.name)} • Entries</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{quickViewEntries.length} entries</p>
              </div>
              <div className="flex items-center gap-2">

                <button
                  type="button"
                  onClick={() => {
                    setQuickViewParticipant(entriesViewParticipant);
                    setEntriesViewParticipant(null);
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
                    No participant entries yet.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 sticky top-0">
                      <tr>
                        <th className="text-left font-medium px-4 py-2.5">Date</th>
                        <th className="text-left font-medium px-4 py-2.5">Activity</th>
                        <th className="text-right font-medium px-4 py-2.5">Entry Value</th>
                        <th className="text-right font-medium px-4 py-2.5">Total</th>
                        <th className="text-right font-medium px-4 py-2.5">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {quickViewEntries.map(entry => (
                        <tr key={entry.id} className="bg-white dark:bg-stone-900">
                          <td className="px-4 py-2.5 text-stone-600 dark:text-stone-300 whitespace-nowrap">
                            {entry.date ? formatDate(entry.date) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-stone-600 dark:text-stone-300">
                            <div className="flex items-center gap-2">
                              <span className="truncate">{entry.location}</span>
                              {entry.isActive && (
                                <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px]">
                                  Active
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-stone-600 dark:text-stone-300 whitespace-nowrap">
                            {formatValue(entry.inflow)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-stone-600 dark:text-stone-300 whitespace-nowrap">
                            {formatValue(entry.outflow)}
                          </td>
                          <td
                            className={cn(
                              'px-4 py-2.5 text-right font-mono whitespace-nowrap',
                              entry.net > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : entry.net < 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-stone-500 dark:text-stone-400',
                            )}
                          >
                            {formatValue(entry.net)}
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

function ParticipantGridCard({
  entity,
  stats,
  onOpenProfile,
  onOpenSnapshot,
  canManageValue,
  canRecordDeferred,
  onTransferFromEntity,
  onRecordDeferred,
  onDelete,
}: {
  entity: Entity;
  stats: { net: number; activitys: number; lastActive: string | null; surpluses: number; totalInflow: number; avgActivity: number };
  onOpenProfile: () => void;
  onOpenSnapshot: () => void;
  canManageValue: boolean;
  canRecordDeferred: boolean;
  onTransferFromEntity: () => void;
  onRecordDeferred: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="section-card-hover p-5 min-w-0 cursor-pointer" onClick={onOpenProfile}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
            <p className="font-medium text-stone-900 dark:text-stone-100 truncate" title={getParticipantDisplayName(entity.name)}>{getParticipantDisplayName(entity.name)}</p>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{stats.activitys} activities • {stats.lastActive ? formatDate(stats.lastActive) : 'Never'}</p>
        </div>
        <span className={cn(
          "font-mono text-sm font-medium",
          (entity.total || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : (entity.total || 0) < 0 ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400"
        )}>
          {formatValue(entity.total || 0)}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className={cn(
          "font-mono text-sm",
          stats.net > 0 ? "text-emerald-600 dark:text-emerald-400" : stats.net < 0 ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400"
        )}>
          Net {formatValue(stats.net)}
        </p>
        <div className="flex items-center gap-1.5">
          {canManageValue && (
            <button
              onClick={event => {
                event.stopPropagation();
                onTransferFromEntity();
              }}
              className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
              title="Transfer from this entity"
            >
              <ArrowRightLeft size={16} />
            </button>
          )}
          {canRecordDeferred && (
            <button
              onClick={event => {
                event.stopPropagation();
                onRecordDeferred();
              }}
              className="p-1.5 text-stone-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-md transition-colors"
              title="Add pending entry"
            >
              <Clock size={16} />
            </button>
          )}
          <button
            onClick={event => {
              event.stopPropagation();
              onOpenSnapshot();
            }}
            className="action-btn-secondary text-xs px-2.5 py-1"
            title="Open quick snapshot"
          >
            Quick Snapshot
          </button>
          {canManageValue && (
            <button
              onClick={event => {
                event.stopPropagation();
                onDelete();
              }}
              className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="Delete participant"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ParticipantRow({ entity, stats, updateUnit, onOpenProfile, onOpenSnapshot, associates, canManageValue, canRecordDeferred, onTransferFromEntity, onRecordDeferred, onDelete }: { entity: Entity, stats: any, updateUnit: (p: Entity) => Promise<void>, onOpenProfile: () => void, onOpenSnapshot: () => void, associates: Associate[], canManageValue: boolean, canRecordDeferred: boolean, onTransferFromEntity: () => void, onRecordDeferred: () => void, onDelete: () => void }) {
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
    await updateUnit(data);
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
            {formatValue(entity.total || 0)}
          </span>
        </td>
        <td className="px-6 py-3" colSpan={2}>
          <select
            className="w-full p-1 border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 text-xs mb-1"
            value={data.attributed_associate_id || ''}
            onChange={e => setData({...data, attributed_associate_id: e.target.value || undefined})}
          >
            <option value="">Collaboration attribution (optional)</option>
            {associates.map(a => (
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
          {getParticipantDisplayName(entity.name)}
          <Eye size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
        </div>
      </td>
      <td className="px-6 py-2.5">
        <div className={cn(
          "font-mono font-medium",
          (entity.total || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : (entity.total || 0) < 0 ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400"
        )}>
          {formatValue(entity.total || 0)}
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
          {canManageValue && (
            <button
              onClick={onTransferFromEntity}
              className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
              title="Transfer from this entity"
            >
              <ArrowRightLeft size={16} />
            </button>
          )}
          {canRecordDeferred && (
            <button
              onClick={onRecordDeferred}
              className="p-1.5 text-stone-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-md transition-colors"
              title="Add pending entry"
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
          {canManageValue && (
            <button
              onClick={onDelete}
              className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="Delete participant"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
