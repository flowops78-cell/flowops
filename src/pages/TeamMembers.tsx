import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Clock, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { cn, formatDate } from '../lib/utils';
import OverlaySavingState from '../components/OverlaySavingState';
import LoadingLine from '../components/LoadingLine';

const getTeamMemberDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed';
};

const getTeamMemberRoleLabel = (role?: string | null) => {
  const normalized = (role ?? '').toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'operator') return 'Operator';
  return 'Operator';
};

export default function Team({ embedded = false }: { embedded?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    teamMembers: rawTeamMembers,
    activityLogs: rawActivityLogs,
    loading,
    loadingProgress,
    addTeamMember,
    updateTeamMember,
    deleteTeamMember,
  } = useData();
  const { canAccessAdminUi } = useAppRole();

  const teamMembers = useMemo(
    () => (rawTeamMembers ?? []).filter(member => (member.role ?? '').toLowerCase() !== 'viewer').sort((left, right) => getTeamMemberDisplayName(left.name).localeCompare(getTeamMemberDisplayName(right.name))),
    [rawTeamMembers],
  );
  const activityLogs = useMemo(() => rawActivityLogs ?? [], [rawActivityLogs]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddAdvancedOpen, setIsAddAdvancedOpen] = useState(false);
  const [isDetailAdvancedOpen, setIsDetailAdvancedOpen] = useState(false);
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [teamMemberLoginId, setTeamMemberLoginId] = useState('');
  const [role, setRole] = useState('operator');
  const [editRole, setEditRole] = useState('operator');
  const [editLoginId, setEditLoginId] = useState('');
  const [deletingTeamMemberId, setDeletingTeamMemberId] = useState<string | null>(null);
  type AddMemberState = 'idle' | 'saving' | 'success' | 'error';
  const [addMemberState, setAddMemberState] = useState<AddMemberState>('idle');
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const addMemberInFlight = useRef(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const selectedTeamMember = teamMembers.find(member => member.id === selectedTeamMemberId) ?? null;

  const activeLogByMemberId = useMemo(() => {
    const byAuthId = new Map<string, typeof activityLogs[number]>();
    activityLogs.forEach(log => {
      const actorId = log.teamMember_id ?? '';
      if (log.status === 'active' && actorId && !byAuthId.has(actorId)) {
        byAuthId.set(actorId, log);
      }
    });

    const byMemberId = new Map<string, typeof activityLogs[number]>();
    teamMembers.forEach(member => {
      if (!member.user_id) return;
      const log = byAuthId.get(member.user_id);
      if (log) byMemberId.set(member.id, log);
    });

    return byMemberId;
  }, [activityLogs, teamMembers]);

  const selectedLogs = useMemo(() => {
    if (!selectedTeamMember) return [] as typeof activityLogs;
    return activityLogs
      .filter(log => selectedTeamMember.user_id && log.teamMember_id === selectedTeamMember.user_id)
      .sort((left, right) => new Date(right.start_time || right.started_at || 0).getTime() - new Date(left.start_time || left.started_at || 0).getTime())
      .slice(0, 8);
  }, [activityLogs, selectedTeamMember]);

  useEffect(() => {
    if (selectedTeamMemberId && teamMembers.some(member => member.id === selectedTeamMemberId)) {
      return;
    }
    setSelectedTeamMemberId(teamMembers[0]?.id ?? null);
  }, [selectedTeamMemberId, teamMembers]);

  useEffect(() => {
    if (!selectedTeamMember) {
      setEditRole('operator');
      setEditLoginId('');
      setIsDetailAdvancedOpen(false);
      return;
    }

    setEditRole(selectedTeamMember.role || 'operator');
    setEditLoginId(selectedTeamMember.user_id || '');
  }, [selectedTeamMember]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (!action) return;

    if (action === 'add-team-member' || action === 'add-member') {
      setIsAddOpen(true);
    }

    params.delete('action');
    const nextSearch = params.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const clearAddForm = () => {
    setName('');
    setTeamMemberLoginId('');
    setRole('operator');
    setIsAddAdvancedOpen(false);
  };

  const closeAddModal = () => {
    if (addMemberState === 'saving' || addMemberState === 'success') return;
    setIsAddOpen(false);
    setAddMemberState('idle');
    setAddMemberError(null);
    clearAddForm();
  };

  const handleAddTeamMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (addMemberInFlight.current) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setAddMemberError('Name required.');
      setAddMemberState('error');
      return;
    }

    addMemberInFlight.current = true;
    setAddMemberError(null);
    setAddMemberState('saving');

    try {
      await addTeamMember({
        name: normalizedName,
        user_id: teamMemberLoginId.trim() || undefined,
        role,
        status: 'active',
      });
      setAddMemberState('success');
      setTimeout(() => {
        setIsAddOpen(false);
        setAddMemberState('idle');
        clearAddForm();
      }, 700);
    } catch (error: any) {
      const msg = error?.message || 'Unable to save member.';
      setAddMemberError(msg);
      setAddMemberState('error');
      setImportStatus({ type: 'error', message: msg });
    } finally {
      addMemberInFlight.current = false;
    }
  };

  const handleDeleteTeamMember = async (targetTeamMemberId: string) => {
    if (deletingTeamMemberId === targetTeamMemberId) return;

    const teamMember = teamMembers.find(item => item.id === targetTeamMemberId);
    if (!teamMember) return;

    const activeLog = activeLogByMemberId.get(targetTeamMemberId);
    if (activeLog) {
      setImportStatus({ type: 'error', message: 'Close log first.' });
      return;
    }

    const confirmed = window.confirm(`Remove ${getTeamMemberDisplayName(teamMember.name)}?`);
    if (!confirmed) return;

    try {
      setDeletingTeamMemberId(targetTeamMemberId);
      await deleteTeamMember(targetTeamMemberId);
      setImportStatus({ type: 'success', message: 'Removed.' });
      if (selectedTeamMemberId === targetTeamMemberId) {
        setSelectedTeamMemberId(null);
      }
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to remove member.' });
    } finally {
      setDeletingTeamMemberId(null);
    }
  };

  const handleSaveAdvanced = async () => {
    if (!selectedTeamMember) return;

    try {
      await updateTeamMember({
        ...selectedTeamMember,
        role: editRole,
        user_id: editLoginId.trim() || undefined,
      });
      setImportStatus({ type: 'success', message: 'Updated.' });
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to update member.' });
    }
  };

  if (loading && teamMembers.length === 0) {
    return (
      <div className="page-shell">
        <div className="section-card p-4 space-y-3">
          <LoadingLine label="Loading team…" />
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'page-shell animate-in fade-in space-y-4'}>
      {!embedded && (
        <div className="section-card flex items-center justify-between gap-4 p-5 lg:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-stone-200 bg-stone-100 shadow-sm dark:border-stone-700 dark:bg-stone-800">
              <Users size={24} className="text-stone-900 dark:text-stone-100" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Team</h2>
          </div>
          {teamMembers.length > 0 && canAccessAdminUi && (
            <button type="button" onClick={() => setIsAddOpen(true)} className="action-btn-primary">
              <Plus size={16} />
              Add
            </button>
          )}
        </div>
      )}

      {importStatus && (
        <div className={cn(
          'rounded-xl border px-3 py-2 text-sm',
          importStatus.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400',
        )}>
          {importStatus.message}
        </div>
      )}

      {teamMembers.length === 0 ? (
        <div className="section-card flex min-h-[280px] flex-col items-center justify-center gap-5 p-8 text-center">
          {!embedded && <h3 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Team</h3>}
          <p className="text-lg text-stone-500 dark:text-stone-400">No members</p>
          {canAccessAdminUi && (
            <button type="button" onClick={() => setIsAddOpen(true)} className="action-btn-primary">
              <Plus size={16} />
              Add
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="section-card p-3">
            <div className="space-y-2">
              {teamMembers.map(teamMember => {
                const activeLog = activeLogByMemberId.get(teamMember.id);
                return (
                  <button
                    key={teamMember.id}
                    type="button"
                    onClick={() => setSelectedTeamMemberId(teamMember.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all',
                      selectedTeamMemberId === teamMember.id
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
                        : 'border-stone-200 bg-white text-stone-900 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800/80',
                    )}
                  >
                    <span className="truncate text-base font-medium">{getTeamMemberDisplayName(teamMember.name)}</span>
                    <span className={cn(
                      'ml-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                      activeLog
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-300',
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', activeLog ? 'bg-emerald-500' : 'bg-stone-400')} />
                      {activeLog ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                );
              })}
            </div>

            {canAccessAdminUi && (
              <button type="button" onClick={() => setIsAddOpen(true)} className="mt-3 w-full rounded-2xl border border-dashed border-stone-300 px-4 py-4 text-left text-base font-semibold text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800/70">
                <span className="inline-flex items-center gap-2">
                  <Plus size={18} />
                  Add
                </span>
              </button>
            )}
          </section>

          <section className="section-card overflow-hidden">
            {selectedTeamMember ? (
              <>
                <div className="border-b border-stone-200 px-5 py-5 dark:border-stone-800 lg:px-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">{getTeamMemberDisplayName(selectedTeamMember.name)}</h3>
                      <div className="mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-stone-700 dark:text-stone-200">
                        <span className={cn('h-2 w-2 rounded-full', activeLogByMemberId.get(selectedTeamMember.id) ? 'bg-emerald-500' : 'bg-stone-400')} />
                        {activeLogByMemberId.get(selectedTeamMember.id) ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                    {canAccessAdminUi && (
                      <button
                        type="button"
                        onClick={() => { void handleDeleteTeamMember(selectedTeamMember.id); }}
                        disabled={Boolean(activeLogByMemberId.get(selectedTeamMember.id)) || deletingTeamMemberId === selectedTeamMember.id}
                        className="action-btn-tertiary text-red-600 dark:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        {deletingTeamMemberId === selectedTeamMember.id ? 'Removing' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-5 p-5 lg:p-6">
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Status</div>
                    <div className="mt-1 text-sm font-medium text-stone-900 dark:text-stone-100">{activeLogByMemberId.get(selectedTeamMember.id) ? 'Active' : 'Inactive'}</div>
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/60">
                    <button
                      type="button"
                      onClick={() => setIsDetailAdvancedOpen(value => !value)}
                      className="flex w-full items-center justify-between text-sm font-semibold text-stone-700 dark:text-stone-200"
                    >
                      Advanced
                      <ChevronDown size={16} className={cn('transition-transform', isDetailAdvancedOpen ? 'rotate-180' : '')} />
                    </button>

                    {isDetailAdvancedOpen && (
                      <div className="mt-4 space-y-4 border-t border-stone-200 pt-4 dark:border-stone-800">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Role</label>
                            <select className="control-input" value={editRole} onChange={event => setEditRole(event.target.value)} disabled={!canAccessAdminUi}>
                              <option value="operator">Operator</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Login</label>
                            <input className="control-input" value={editLoginId} onChange={event => setEditLoginId(event.target.value)} disabled={!canAccessAdminUi} />
                          </div>
                        </div>

                        {canAccessAdminUi && (
                          <div className="flex justify-end">
                            <button type="button" onClick={() => { void handleSaveAdvanced(); }} className="action-btn-primary">
                              Save
                            </button>
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Logs</div>
                          {selectedLogs.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-6 text-sm text-stone-500 dark:border-stone-800 dark:text-stone-400">
                              None
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {selectedLogs.map(log => (
                                <div key={log.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm dark:border-stone-800 dark:bg-stone-950">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="font-medium text-stone-900 dark:text-stone-100">{log.activity_id?.slice(0, 8).toUpperCase() || 'Activity'}</div>
                                      <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{formatDate(log.start_time || log.started_at || new Date().toISOString())}</div>
                                    </div>
                                    <div className="text-right text-xs text-stone-500 dark:text-stone-400">
                                      <div>{(log.duration_hours ?? 0).toFixed(2)}h</div>
                                      <div className="mt-1">{log.status}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center px-6 text-sm text-stone-500 dark:text-stone-400">
                Select a member
              </div>
            )}
          </section>
        </div>
      )}

      {isAddOpen && canAccessAdminUi && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={closeAddModal}
        >
          <div
            onClick={e => e.stopPropagation()}
            className={cn(
              'w-full max-w-md rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-800 dark:bg-stone-950 animate-in zoom-in-95 transition-shadow duration-300',
              addMemberState === 'success' && 'ring-2 ring-emerald-400 dark:ring-emerald-500'
            )}
          >
            {/* ── SAVING ── */}
            {addMemberState === 'saving' && <OverlaySavingState state="saving" label="Adding member…" />}

            {/* ── SUCCESS ── */}
            {addMemberState === 'success' && <OverlaySavingState state="success" label="Member added" />}

            {/* ── IDLE / ERROR ── */}
            {(addMemberState === 'idle' || addMemberState === 'error') && (
              <form onSubmit={handleAddTeamMember} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Add member</h3>
                  <button
                    type="button"
                    onClick={closeAddModal}
                    className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                {addMemberState === 'error' && addMemberError && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                    {addMemberError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-200">Name</label>
                  <input className="control-input" value={name} onChange={event => setName(event.target.value)} autoFocus required />
                </div>

                <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-800 dark:bg-stone-900/60">
                  <button
                    type="button"
                    onClick={() => setIsAddAdvancedOpen(value => !value)}
                    className="flex w-full items-center justify-between text-sm font-semibold text-stone-700 dark:text-stone-200"
                  >
                    Advanced
                    <ChevronDown size={16} className={cn('transition-transform', isAddAdvancedOpen ? 'rotate-180' : '')} />
                  </button>

                  {isAddAdvancedOpen && (
                    <div className="mt-4 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-800">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Role</label>
                        <select className="control-input" value={role} onChange={event => setRole(event.target.value)}>
                          <option value="operator">Operator</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">Login</label>
                        <input className="control-input" value={teamMemberLoginId} onChange={event => setTeamMemberLoginId(event.target.value)} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeAddModal} className="action-btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="action-btn-primary">
                    <Plus size={16} />
                    {addMemberState === 'error' ? 'Try again' : 'Add'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}