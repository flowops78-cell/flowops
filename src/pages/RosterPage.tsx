import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  KeyRound,
  Plus,
  Shield,
  Trash2,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { cn, formatDate } from '../lib/utils';
import OverlaySavingState from '../components/OverlaySavingState';
import LoadingLine from '../components/LoadingLine';
import { useConfirm } from '../context/ConfirmContext';

const getRosterDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed';
};

export default function RosterPage({ embedded = false }: { embedded?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    rosterProfiles: rawRosterProfiles,
    activityLogs: rawActivityLogs,
    loading,
    loadingProgress,
    addRosterProfile,
    updateRosterProfile,
    deleteRosterProfile,
  } = useData();
  const { canAccessAdminUi, canManageImpact } = useAppRole();
  const { confirm } = useConfirm();

  const rosterProfiles = useMemo(
    () => (rawRosterProfiles ?? []).filter(member => (member.role ?? '').toLowerCase() !== 'viewer').sort((left, right) => getRosterDisplayName(left.name).localeCompare(getRosterDisplayName(right.name))),
    [rawRosterProfiles],
  );
  const activityLogs = useMemo(() => rawActivityLogs ?? [], [rawActivityLogs]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddAdvancedOpen, setIsAddAdvancedOpen] = useState(false);
  const [isDetailAdvancedOpen, setIsDetailAdvancedOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [signInUserIdInput, setSignInUserIdInput] = useState('');
  const [role, setRole] = useState('operator');
  const [editRole, setEditRole] = useState('operator');
  const [editLoginId, setEditLoginId] = useState('');
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  type AddMemberState = 'idle' | 'saving' | 'success' | 'error';
  const [addMemberState, setAddMemberState] = useState<AddMemberState>('idle');
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const addMemberInFlight = useRef(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const selectedProfile = rosterProfiles.find(member => member.id === selectedProfileId) ?? null;

  const activeLogByProfileId = useMemo(() => {
    const byAuthId = new Map<string, typeof activityLogs[number]>();
    activityLogs.forEach(log => {
      const actorId = log.actor_user_id ?? '';
      if (log.status === 'active' && actorId && !byAuthId.has(actorId)) {
        byAuthId.set(actorId, log);
      }
    });

    const byMemberId = new Map<string, typeof activityLogs[number]>();
    rosterProfiles.forEach(member => {
      if (!member.user_id) return;
      const log = byAuthId.get(member.user_id);
      if (log) byMemberId.set(member.id, log);
    });

    return byMemberId;
  }, [activityLogs, rosterProfiles]);

  const selectedLogs = useMemo(() => {
    if (!selectedProfile) return [] as typeof activityLogs;
    return activityLogs
      .filter(log => selectedProfile.user_id && log.actor_user_id === selectedProfile.user_id)
      .sort((left, right) => new Date(right.start_time || right.started_at || 0).getTime() - new Date(left.start_time || left.started_at || 0).getTime())
      .slice(0, 8);
  }, [activityLogs, selectedProfile]);

  useEffect(() => {
    if (selectedProfileId && rosterProfiles.some(member => member.id === selectedProfileId)) {
      return;
    }
    setSelectedProfileId(rosterProfiles[0]?.id ?? null);
  }, [selectedProfileId, rosterProfiles]);

  useEffect(() => {
    if (!selectedProfile) {
      setEditRole('operator');
      setEditLoginId('');
      setIsDetailAdvancedOpen(false);
      return;
    }

    setEditRole(selectedProfile.role || 'operator');
    setEditLoginId(selectedProfile.user_id || '');
  }, [selectedProfile]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (!action) return;

    if (action === 'add-roster-profile' || action === 'add-team-member' || action === 'add-member') {
      setIsAddOpen(true);
    }

    params.delete('action');
    const nextSearch = params.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const clearAddForm = () => {
    setName('');
    setSignInUserIdInput('');
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

  const handleAddRosterProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (addMemberInFlight.current) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setAddMemberError('Display name required.');
      setAddMemberState('error');
      return;
    }

    addMemberInFlight.current = true;
    setAddMemberError(null);
    setAddMemberState('saving');

    try {
      await addRosterProfile({
        name: normalizedName,
        user_id: signInUserIdInput.trim() || undefined,
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
      const msg = error?.message || 'Unable to save roster profile.';
      setAddMemberError(msg);
      setAddMemberState('error');
      setImportStatus({ type: 'error', message: msg });
    } finally {
      addMemberInFlight.current = false;
    }
  };

  const handleDeleteRosterProfile = async (targetProfileId: string) => {
    if (deletingProfileId === targetProfileId) return;

    const profile = rosterProfiles.find(item => item.id === targetProfileId);
    if (!profile) return;

    const activeLog = activeLogByProfileId.get(targetProfileId);
    if (activeLog) {
      setImportStatus({ type: 'error', message: 'Close log first.' });
      return;
    }

    const ok = await confirm({
      title: 'Remove roster profile?',
      message: `Remove ${getRosterDisplayName(profile.name)} from the workspace list?`,
      danger: true,
      confirmLabel: 'Remove',
    });
    if (!ok) return;

    try {
      setDeletingProfileId(targetProfileId);
      await deleteRosterProfile(targetProfileId);
      setImportStatus({ type: 'success', message: 'Removed.' });
      if (selectedProfileId === targetProfileId) {
        setSelectedProfileId(null);
      }
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to remove roster profile.' });
    } finally {
      setDeletingProfileId(null);
    }
  };

  const handleSaveAdvanced = async () => {
    if (!selectedProfile) return;

    try {
      await updateRosterProfile({
        ...selectedProfile,
        role: editRole,
        user_id: editLoginId.trim() || undefined,
      });
      setImportStatus({ type: 'success', message: 'Updated.' });
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to update roster profile.' });
    }
  };

  if (loading && rosterProfiles.length === 0) {
    return (
      <div className="page-shell">
        <div className="section-card p-4 space-y-3">
          <LoadingLine label="Loading roster…" />
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
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Roster</h2>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Workspace people list — roles, linked sign-ins, and operator sessions. A row here is not the same as an account until you set the sign-in id.</p>
            </div>
          </div>
          {rosterProfiles.length > 0 && canAccessAdminUi && (
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

      {rosterProfiles.length === 0 ? (
        <div className="section-card flex min-h-[240px] flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 text-stone-400 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-500">
            <Users size={28} strokeWidth={1.5} aria-hidden />
          </div>
          {!embedded && <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">No roster profiles yet</h3>}
          <p className="max-w-sm text-sm text-stone-500 dark:text-stone-400">Add people to this workspace list. You can link their sign-in account under Role &amp; sign-in when they have a user id.</p>
          {canManageImpact && (
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
              {rosterProfiles.map(profile => {
                const activeLog = activeLogByProfileId.get(profile.id);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedProfileId(profile.id)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all',
                      selectedProfileId === profile.id
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
                        : 'border-stone-200 bg-white text-stone-900 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800/80',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                        selectedProfileId === profile.id
                          ? 'border-emerald-200/80 bg-white/80 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400',
                      )}
                    >
                      <UserCircle size={18} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{getRosterDisplayName(profile.name)}</span>
                    <span className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      activeLog
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-300',
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', activeLog ? 'bg-emerald-500' : 'bg-stone-400')} />
                      {activeLog ? 'Active' : 'Inactive'}
                    </span>
                    <ChevronRight
                      size={16}
                      className={cn(
                        'shrink-0 transition-opacity',
                        selectedProfileId === profile.id
                          ? 'text-emerald-600 opacity-100 dark:text-emerald-400'
                          : 'text-stone-300 opacity-0 group-hover:opacity-100 dark:text-stone-600',
                      )}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>

            {canManageImpact && (
              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-left text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800/70"
              >
                <Plus size={16} className="shrink-0 text-stone-500 dark:text-stone-400" aria-hidden />
                Add to roster
              </button>
            )}
          </section>

          <section className="section-card overflow-hidden">
            {selectedProfile ? (
              <>
                <div className="border-b border-stone-200 px-5 py-4 dark:border-stone-800 lg:px-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                        <UserCircle size={20} strokeWidth={1.75} aria-hidden />
                      </span>
                      <div>
                        <h3 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">{getRosterDisplayName(selectedProfile.name)}</h3>
                        <div className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-xs font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                          <span className={cn('h-1.5 w-1.5 rounded-full', activeLogByProfileId.get(selectedProfile.id) ? 'bg-emerald-500' : 'bg-stone-400')} />
                          {activeLogByProfileId.get(selectedProfile.id) ? 'Session live' : 'No active session'}
                        </div>
                      </div>
                    </div>
                    {canAccessAdminUi && (
                      <button
                        type="button"
                        onClick={() => { void handleDeleteRosterProfile(selectedProfile.id); }}
                        disabled={Boolean(activeLogByProfileId.get(selectedProfile.id)) || deletingProfileId === selectedProfile.id}
                        className="action-btn-tertiary text-red-600 dark:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        {deletingProfileId === selectedProfile.id ? 'Removing' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-5 p-5 lg:p-6">
                  <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                      <Clock size={14} className="text-stone-400" aria-hidden />
                      Status
                    </div>
                    <div className="mt-1 text-sm font-medium text-stone-900 dark:text-stone-100">{activeLogByProfileId.get(selectedProfile.id) ? 'Active session' : 'Not in a session'}</div>
                  </div>

                  <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/60">
                    <button
                      type="button"
                      onClick={() => setIsDetailAdvancedOpen(value => !value)}
                      className="flex w-full items-center gap-2 text-sm font-semibold text-stone-700 dark:text-stone-200"
                    >
                      <Shield size={16} className="text-stone-400" aria-hidden />
                      <span className="flex-1 text-left">Role &amp; sign-in</span>
                      <ChevronDown size={16} className={cn('shrink-0 transition-transform', isDetailAdvancedOpen ? 'rotate-180' : '')} />
                    </button>

                    {isDetailAdvancedOpen && (
                      <div className="mt-4 space-y-4 border-t border-stone-200 pt-4 dark:border-stone-800">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                              <Shield size={12} className="text-stone-400" aria-hidden />
                              Role
                            </label>
                            <select className="control-input" value={editRole} onChange={event => setEditRole(event.target.value)} disabled={!canAccessAdminUi}>
                              <option value="operator">Operator</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                              <KeyRound size={12} className="text-stone-400" aria-hidden />
                              Sign-in user id
                            </label>
                            <input className="control-input font-mono text-xs" value={editLoginId} onChange={event => setEditLoginId(event.target.value)} disabled={!canAccessAdminUi} placeholder="UUID from auth (optional)" />
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
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                            <Clock size={14} className="text-stone-400" aria-hidden />
                            Session logs
                          </div>
                          {selectedLogs.length === 0 ? (
                            <div className="flex items-center gap-2 rounded-xl border border-dashed border-stone-200 px-4 py-5 text-sm text-stone-500 dark:border-stone-800 dark:text-stone-400">
                              <Clock size={16} className="shrink-0 opacity-50" aria-hidden />
                              No operator logs for this person yet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {selectedLogs.map(log => (
                                <div key={log.id} className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-stone-800 dark:bg-stone-950">
                                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
                                    <Clock size={14} aria-hidden />
                                  </span>
                                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="font-medium text-stone-900 dark:text-stone-100">{log.activity_id?.slice(0, 8).toUpperCase() || 'Activity'}</div>
                                      <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{formatDate(log.start_time || log.started_at || new Date().toISOString())}</div>
                                    </div>
                                    <div className="shrink-0 text-right text-xs text-stone-500 dark:text-stone-400">
                                      <div className="font-mono tabular-nums">{(log.duration_hours ?? 0).toFixed(2)}h</div>
                                      <div className="mt-0.5">{log.status}</div>
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
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 text-stone-400 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-500">
                  <UserCircle size={24} strokeWidth={1.5} aria-hidden />
                </span>
                <p className="text-sm font-medium text-stone-600 dark:text-stone-300">Choose someone from the roster</p>
                <p className="max-w-xs text-xs text-stone-500 dark:text-stone-400">Pick a person on the left to view status, role, sign-in link, and recent sessions.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {isAddOpen && canManageImpact && (
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
            {addMemberState === 'saving' && <OverlaySavingState state="saving" label="Adding to roster…" />}

            {/* ── SUCCESS ── */}
            {addMemberState === 'success' && <OverlaySavingState state="success" label="Roster profile added" />}

            {/* ── IDLE / ERROR ── */}
            {(addMemberState === 'idle' || addMemberState === 'error') && (
              <form onSubmit={handleAddRosterProfile} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                      <UserCircle size={18} aria-hidden />
                    </span>
                    <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Add roster profile</h3>
                  </div>
                  <button
                    type="button"
                    onClick={closeAddModal}
                    className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                {addMemberState === 'error' && addMemberError && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                    {addMemberError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                    <UserCircle size={12} className="text-stone-400" aria-hidden />
                    Display name
                  </label>
                  <input className="control-input" value={name} onChange={event => setName(event.target.value)} autoFocus required />
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-800 dark:bg-stone-900/60">
                  <button
                    type="button"
                    onClick={() => setIsAddAdvancedOpen(value => !value)}
                    className="flex w-full items-center gap-2 text-sm font-semibold text-stone-700 dark:text-stone-200"
                  >
                    <KeyRound size={16} className="text-stone-400" aria-hidden />
                    <span className="flex-1 text-left">Role &amp; sign-in</span>
                    <ChevronDown size={16} className={cn('shrink-0 transition-transform', isAddAdvancedOpen ? 'rotate-180' : '')} />
                  </button>

                  {isAddAdvancedOpen && (
                    <div className="mt-4 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-800">
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                          <Shield size={12} className="text-stone-400" aria-hidden />
                          Role
                        </label>
                        <select className="control-input" value={role} onChange={event => setRole(event.target.value)}>
                          <option value="operator">Operator</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                          <KeyRound size={12} className="text-stone-400" aria-hidden />
                          Sign-in user id
                        </label>
                        <input className="control-input font-mono text-xs" value={signInUserIdInput} onChange={event => setSignInUserIdInput(event.target.value)} placeholder="UUID from auth (optional)" />
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