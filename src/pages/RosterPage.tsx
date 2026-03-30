import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, UserCircle, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { cn, formatDate } from '../lib/utils';
import { workspaceMemberDisplayLabel } from '../lib/workspaceMemberDisplayLabel';
import LoadingLine from '../components/LoadingLine';
import type { WorkspaceMember } from '../types';
import { useAuth } from '../context/AuthContext';

export default function RosterPage({ embedded = false }: { embedded?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    workspaceMembers: rawMembers,
    activityLogs: rawActivityLogs,
    loading,
    loadingProgress,
  } = useData();
  const { canAccessAdminUi } = useAppRole();
  const { user: authUser } = useAuth();

  const memberLabel = useCallback(
    (m: WorkspaceMember) =>
      workspaceMemberDisplayLabel(m, {
        currentUserId: authUser?.id ?? null,
        currentUserEmail: authUser?.email ?? null,
      }),
    [authUser?.id, authUser?.email],
  );

  const workspaceMembers = useMemo(
    () => [...(rawMembers ?? [])].sort((a, b) => memberLabel(a).localeCompare(memberLabel(b))),
    [rawMembers, memberLabel],
  );
  const activityLogs = useMemo(() => rawActivityLogs ?? [], [rawActivityLogs]);

  const [isDetailAdvancedOpen, setIsDetailAdvancedOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const activeLogByUserId = useMemo(() => {
    const byAuthId = new Map<string, (typeof activityLogs)[number]>();
    activityLogs.forEach((log) => {
      const actorId = log.actor_user_id ?? '';
      if (log.status === 'active' && actorId && !byAuthId.has(actorId)) {
        byAuthId.set(actorId, log);
      }
    });
    return byAuthId;
  }, [activityLogs]);

  const selectedMember = workspaceMembers.find((m) => m.user_id === selectedUserId) ?? null;

  const selectedLogs = useMemo(() => {
    if (!selectedMember) return [] as typeof activityLogs;
    return activityLogs
      .filter((log) => log.actor_user_id === selectedMember.user_id)
      .sort(
        (left, right) =>
          new Date(right.start_time || right.started_at || 0).getTime() -
          new Date(left.start_time || left.started_at || 0).getTime(),
      )
      .slice(0, 8);
  }, [activityLogs, selectedMember]);

  useEffect(() => {
    if (selectedUserId && workspaceMembers.some((m) => m.user_id === selectedUserId)) {
      return;
    }
    setSelectedUserId(workspaceMembers[0]?.user_id ?? null);
  }, [selectedUserId, workspaceMembers]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (!action) return;

    if (action === 'add-roster-profile' || action === 'add-team-member' || action === 'add-member') {
      navigate('/settings#settings-grant-access', { replace: true });
      return;
    }

    params.delete('action');
    const nextSearch = params.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  if (loading && workspaceMembers.length === 0) {
    return (
      <div className="page-shell">
        <div className="section-card p-4 space-y-3">
          <LoadingLine label="Loading workspace members…" />
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
              <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Members</h2>
            </div>
          </div>
          {canAccessAdminUi && (
            <button
              type="button"
              onClick={() => navigate('/settings#settings-grant-access')}
              className="action-btn-primary text-sm"
            >
              Invite / access
            </button>
          )}
        </div>
      )}

      {workspaceMembers.length === 0 ? (
        <div className="section-card flex min-h-[240px] flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 text-stone-400 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-500">
            <Users size={28} strokeWidth={1.5} aria-hidden />
          </div>
          {!embedded && (
            <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">No members yet</h3>
          )}
          <p className="max-w-sm text-sm text-stone-500 dark:text-stone-400">Settings → Add people</p>
          {canAccessAdminUi && (
            <button
              type="button"
              onClick={() => navigate('/settings#settings-grant-access')}
              className="action-btn-primary"
            >
              Open Settings
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="section-card p-3">
            <div className="space-y-2">
              {workspaceMembers.map((member) => {
                const activeLog = activeLogByUserId.get(member.user_id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setSelectedUserId(member.user_id)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all',
                      selectedUserId === member.user_id
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
                        : 'border-stone-200 bg-white text-stone-900 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800/80',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                        selectedUserId === member.user_id
                          ? 'border-emerald-200/80 bg-white/80 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400',
                      )}
                    >
                      <UserCircle size={18} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {memberLabel(member)}
                      <span className="ml-1.5 text-[10px] font-normal uppercase text-stone-400">· {member.role}</span>
                    </span>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        activeLog
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-300',
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', activeLog ? 'bg-emerald-500' : 'bg-stone-400')} />
                      {activeLog ? 'Active' : 'Idle'}
                    </span>
                    <ChevronRight
                      size={16}
                      className={cn(
                        'shrink-0 transition-opacity',
                        selectedUserId === member.user_id
                          ? 'text-emerald-600 opacity-100 dark:text-emerald-400'
                          : 'text-stone-300 opacity-0 group-hover:opacity-100 dark:text-stone-600',
                      )}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="section-card overflow-hidden">
            {selectedMember ? (
              <>
                <div className="border-b border-stone-200 px-5 py-4 dark:border-stone-800 lg:px-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                        <UserCircle size={20} strokeWidth={1.75} aria-hidden />
                      </span>
                      <div>
                        <h3 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                          {memberLabel(selectedMember)}
                        </h3>
                        <div className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-xs font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              activeLogByUserId.get(selectedMember.user_id) ? 'bg-emerald-500' : 'bg-stone-400',
                            )}
                          />
                          {activeLogByUserId.get(selectedMember.user_id) ? 'Session live' : 'No active session'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-5 lg:p-6">
                  <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                      <Clock size={14} className="text-stone-400" aria-hidden />
                      User id
                    </div>
                    <div className="mt-1 font-mono text-xs text-stone-900 dark:text-stone-100 break-all">
                      {selectedMember.user_id}
                    </div>
                  </div>

                  <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/60">
                    <button
                      type="button"
                      onClick={() => setIsDetailAdvancedOpen((value) => !value)}
                      className="flex w-full items-center gap-2 text-sm font-semibold text-stone-700 dark:text-stone-200"
                    >
                      <Users size={16} className="text-stone-400" aria-hidden />
                      <span className="flex-1 text-left">Role &amp; sessions</span>
                      <ChevronDown
                        size={16}
                        className={cn('shrink-0 transition-transform', isDetailAdvancedOpen ? 'rotate-180' : '')}
                      />
                    </button>

                    {isDetailAdvancedOpen && (
                      <div className="mt-4 space-y-4 border-t border-stone-200 pt-4 dark:border-stone-800">
                        <div className="text-sm text-stone-700 dark:text-stone-200">
                          <span className="text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                            Role
                          </span>
                          <p className="mt-1 capitalize">{selectedMember.role}</p>
                          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                            Role changes use Settings (directory / group tools), not this page.
                          </p>
                        </div>

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
                              {selectedLogs.map((log) => (
                                <div
                                  key={log.id}
                                  className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-stone-800 dark:bg-stone-950"
                                >
                                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
                                    <Clock size={14} aria-hidden />
                                  </span>
                                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="font-medium text-stone-900 dark:text-stone-100">
                                        {log.activity_id?.slice(0, 8).toUpperCase() || 'Activity'}
                                      </div>
                                      <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                                        {formatDate(log.start_time || log.started_at || new Date().toISOString())}
                                      </div>
                                    </div>
                                    <div className="shrink-0 text-right text-xs text-stone-500 dark:text-stone-400">
                                      <div className="font-mono tabular-nums">
                                        {(log.duration_hours ?? 0).toFixed(2)}h
                                      </div>
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
                <p className="text-sm font-medium text-stone-600 dark:text-stone-300">Select a member</p>
                <p className="max-w-xs text-xs text-stone-500 dark:text-stone-400">
                  Pick someone on the left to view their user id, role, and recent operator sessions.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      {!embedded && loading && workspaceMembers.length > 0 && (
        <p className="text-center text-[10px] text-stone-400">Refreshing… {loadingProgress}%</p>
      )}
    </div>
  );
}
