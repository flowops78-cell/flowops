import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Plus, Clock, User, LayoutGrid, List, Trash2 } from 'lucide-react';
import { formatValue, formatDate } from '../lib/utils';
import ContextPanel from '../components/ContextPanel';
import EntitySnapshot from '../components/EntitySnapshot';
import MobileRecordCard from '../components/MobileRecordCard';
import CollapsibleWorkspaceSection from '../components/CollapsibleWorkspaceSection';
import { cn } from '../lib/utils';
import EmptyState from '../components/EmptyState';
import LoadingLine from '../components/LoadingLine';
import { useLabels } from '../lib/labels';
import { useAppRole } from '../context/AppRoleContext';

const getMemberDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed Team Member';
};

const getMemberRoleLabel = (role?: string | null) => {
  const normalized = (role ?? '').toLowerCase();
  if (normalized === 'viewer') return 'Viewer';
  if (normalized === 'operator') return 'Operator';
  if (normalized === 'admin') return 'Admin';
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : 'Viewer';
};

export default function Team({ embedded = false }: { embedded?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    members, 
    activityLogs, 
    addMember, 
    updateMember, 
    deleteMember, 
    loading, 
    loadingProgress 
  } = useData();
  const { canAccessAdminUi } = useAppRole();
  const { tx } = useLabels();
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [rosterViewMode, setRosterViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberWorkspaceScrollTop, setMemberWorkspaceScrollTop] = useState(0);
  const [logWorkspaceScrollTop, setLogWorkspaceScrollTop] = useState(0);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [isSavingMember, setIsSavingMember] = useState(false);
  const [saveMemberProgress, setSaveMemberProgress] = useState(0);
  const memberActivitySectionRef = useRef<HTMLDivElement | null>(null);
  const saveMemberProgressTimerRef = useRef<number | null>(null);
  const saveMemberProgressResetTimerRef = useRef<number | null>(null);

  const clearSaveMemberProgressTimers = () => {
    if (saveMemberProgressTimerRef.current !== null) {
      window.clearInterval(saveMemberProgressTimerRef.current);
      saveMemberProgressTimerRef.current = null;
    }
    if (saveMemberProgressResetTimerRef.current !== null) {
      window.clearTimeout(saveMemberProgressResetTimerRef.current);
      saveMemberProgressResetTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearSaveMemberProgressTimers();
  }, []);

  const [name, setName] = useState('');
  const [memberLoginId, setMemberLoginId] = useState('');
  const [role, setRole] = useState('viewer');
  const [arrangementType, setArrangementType] = useState<'hourly' | 'monthly' | 'none'>('hourly');
  const [serviceRate, setServiceRate] = useState('');
  const [retainerRate, setRetainerRate] = useState('');

  const selectedMember = members.find(s => s.id === selectedMemberId);

  const activeMemberActivityByMemberId = useMemo(() => {
    const map = new Map<string, typeof activityLogs[number]>();
    activityLogs.forEach(log => {
      if (log.status === 'active' && !map.has(log.member_id)) {
        map.set(log.member_id, log);
      }
    });
    return map;
  }, [activityLogs]);

  const totalWorkHours = useMemo(() => (
    activityLogs.reduce((sum, activity) => sum + (activity.duration_hours ?? 0), 0)
  ), [activityLogs]);

  const lastActivityLabel = useMemo(() => {
    if (activityLogs.length === 0) return 'No activity yet';
    const latest = activityLogs
      .map(activity => activity.end_time ?? activity.start_time)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    return latest ? formatDate(latest) : 'No recent activity';
  }, [activityLogs]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach(member => {
      map.set(member.id, getMemberDisplayName(member.name));
    });
    return map;
  }, [members]);

  const ROSTER_ROW_HEIGHT = 56;
  const SHIFT_ROW_HEIGHT = 58;
  const WORKSPACE_OVERSCAN = 10;
  const ROSTER_VIEWPORT_HEIGHT = 560;
  const SHIFT_VIEWPORT_HEIGHT = 460;

  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  
  const filteredMemberActivities = useMemo(() => {
    if (!normalizedMemberSearch) return activityLogs;

    return activityLogs.filter(log => {
      const memberName = (memberNameById.get(log.member_id) ?? 'Unknown').toLowerCase();
      const dateLabel = log.start_time ? formatDate(log.start_time).toLowerCase() : '';
      const status = (log.status ?? '').toLowerCase();
      const workspaceId = (log.workspace_id ?? '').toLowerCase();
      return (
        memberName.includes(normalizedMemberSearch) ||
        workspaceId.includes(normalizedMemberSearch) ||
        dateLabel.includes(normalizedMemberSearch) ||
        status.includes(normalizedMemberSearch)
      );
    });
  }, [normalizedMemberSearch, activityLogs, memberNameById]);

  const shouldWindowMemberActivityWorkspace = filteredMemberActivities.length > 150;
  const logVisibleCount = Math.ceil(SHIFT_VIEWPORT_HEIGHT / SHIFT_ROW_HEIGHT) + WORKSPACE_OVERSCAN * 2;
  const logStartIndex = shouldWindowMemberActivityWorkspace
    ? Math.max(0, Math.floor(logWorkspaceScrollTop / SHIFT_ROW_HEIGHT) - WORKSPACE_OVERSCAN)
    : 0;
  const logEndIndex = shouldWindowMemberActivityWorkspace
    ? Math.min(filteredMemberActivities.length, logStartIndex + logVisibleCount)
    : filteredMemberActivities.length;

  const visibleMemberActivities = shouldWindowMemberActivityWorkspace 
    ? filteredMemberActivities.slice(logStartIndex, logEndIndex) 
    : filteredMemberActivities;

  const logTopSpacerHeight = shouldWindowMemberActivityWorkspace ? logStartIndex * SHIFT_ROW_HEIGHT : 0;
  const logBottomSpacerHeight = shouldWindowMemberActivityWorkspace 
    ? Math.max(0, (filteredMemberActivities.length - logEndIndex) * SHIFT_ROW_HEIGHT) 
    : 0;

  useEffect(() => {
    setLogWorkspaceScrollTop(0);
  }, [normalizedMemberSearch]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingMember) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setImportStatus({ type: 'error', message: 'Team member name is required.' });
      return;
    }
    const parsedHourlyRate = parseFloat(serviceRate);
    const parsedMonthlyRate = parseFloat(retainerRate);

    clearSaveMemberProgressTimers();
    setIsSavingMember(true);
    let progress = 8;
    setSaveMemberProgress(progress);
    saveMemberProgressTimerRef.current = window.setInterval(() => {
      progress = Math.min(progress + (progress < 70 ? 10 : progress < 90 ? 4 : 1), 92);
      setSaveMemberProgress(progress);
    }, 120);

    try {
      await addMember({
        name: normalizedName,
        member_id: memberLoginId.trim() || undefined,
        role: role as any,
        arrangement_type: arrangementType,
        service_rate: arrangementType === 'hourly' && Number.isFinite(parsedHourlyRate) ? parsedHourlyRate : undefined,
        retainer_rate: arrangementType === 'monthly' && Number.isFinite(parsedMonthlyRate) ? parsedMonthlyRate : undefined,
        status: 'active'
      });

      clearSaveMemberProgressTimers();
      setSaveMemberProgress(100);
      setImportStatus({ type: 'success', message: 'Team member saved.' });
      setIsAddingMember(false);
      setName('');
      setMemberLoginId('');
      setArrangementType('hourly');
      setServiceRate('');
      setRetainerRate('');
    } catch (error: any) {
      clearSaveMemberProgressTimers();
      setSaveMemberProgress(100);
      setImportStatus({ type: 'error', message: error?.message || 'Unable to save team member.' });
    } finally {
      saveMemberProgressResetTimerRef.current = window.setTimeout(() => {
        setIsSavingMember(false);
        setSaveMemberProgress(0);
        saveMemberProgressResetTimerRef.current = null;
      }, 360);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (!action) return;

    if (action === 'add-member' || action === 'add-member') {
      setIsAddingMember(true);
    } else if (action === 'view-log') {
      memberActivitySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    params.delete('action');
    const nextSearch = params.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate]);

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
      if (!canAccessAdminUi) return;

      if (normalizedKey === 'delete' || normalizedKey === 'backspace') {
        event.preventDefault();
        const targetMember = selectedMemberId
          ? members.find(member => member.id === selectedMemberId)
          : members.find(member => !activeMemberActivityByMemberId.has(member.id));
        if (targetMember) {
          void handleDeleteMember(targetMember.id);
        }
        return;
      }

      if (normalizedKey === 'l') {
        event.preventDefault();
        memberActivitySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [selectedMemberId, members, activeMemberActivityByMemberId, canAccessAdminUi]);

  const handleDeleteMember = async (targetMemberId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (deletingMemberId === targetMemberId) return;

    const member = members.find(item => item.id === targetMemberId);
    if (!member) return;

    const activeMemberActivity = activeMemberActivityByMemberId.get(targetMemberId);
    if (activeMemberActivity) {
      setImportStatus({ type: 'error', message: 'Close the active activity log before deleting this team member.' });
      return;
    }

    const confirmed = window.confirm(`Remove ${getMemberDisplayName(member.name)} from the team?`);
    if (!confirmed) return;

    try {
      setDeletingMemberId(targetMemberId);
      await deleteMember(targetMemberId);
      setImportStatus({ type: 'success', message: 'Team member removed.' });
      if (selectedMemberId === targetMemberId) {
        setSelectedMemberId(null);
      }
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to delete team member.' });
    } finally {
      setDeletingMemberId(null);
    }
  };

  const formatArrangement = (teamMember: typeof members[number]) => {
    const type = teamMember.arrangement_type ?? 'hourly';
    if (type === 'monthly') {
      return typeof teamMember.retainer_rate === 'number' ? `${formatValue(teamMember.retainer_rate)}/mo` : null;
    }
    if (type === 'none') return null;
    return typeof teamMember.service_rate === 'number' ? `${formatValue(teamMember.service_rate)}/hr` : null;
  };

  const handleUpdateTags = async (id: string, tags: string[]) => {
    const teamMember = members.find(s => s.id === id);
    if (teamMember && updateMember) {
      await updateMember({ ...teamMember, tags });
    }
  };

  const rosterViewToggle = (
    <div className="toggle-indirect-track inline-flex rounded-xl border border-stone-200 dark:border-stone-800 p-1 gap-1">
      <button
        type="button"
        onClick={() => setRosterViewMode('grid')}
        className={cn(
          "interactive-3d px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5",
          rosterViewMode === 'grid'
            ? "toggle-indirect-active"
            : "toggle-indirect-idle"
        )}
      >
        <LayoutGrid size={14} />
        Grid
      </button>
      <button
        type="button"
        onClick={() => setRosterViewMode('list')}
        className={cn(
          "interactive-3d px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5",
          rosterViewMode === 'list'
            ? "toggle-indirect-active"
            : "toggle-indirect-idle"
        )}
      >
        <List size={14} />
        List
      </button>
    </div>
  );

  const statusMessages = importStatus ? [importStatus] : [];

  const formatMemberCount = (count: number) => `${count} ${count === 1 ? 'user' : 'users'}`;

  if (loading && members.length === 0) {
    return (
      <div className="page-shell">
        <div className="section-card p-4">
          <LoadingLine
            progress={Math.max(8, Math.min(100, loadingProgress || 8))}
            label="Loading team..."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <ContextPanel isOpen={!!selectedMemberId} onClose={() => setSelectedMemberId(null)}>
        {selectedMember && (
          <EntitySnapshot 
            entity={selectedMember} 
            type="member" 
            onClose={() => setSelectedMemberId(null)}
            onUpdateTags={handleUpdateTags}
            variant="sidebar"
          />
        )}
      </ContextPanel>

      {!embedded && (
        <div className="section-card p-5 lg:p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center justify-between">
            <div>
              <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">Team</h2>
              <p className="text-stone-500 dark:text-stone-400 text-sm">Team roster and operational roles.</p>
            </div>
            <div className="flex flex-col items-start lg:items-end gap-3">
              <div className="hidden lg:flex items-center gap-2 text-xs">
                <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                  <span className="font-mono text-stone-900 dark:text-stone-100">{formatMemberCount(members.length)}</span>
                </span>
                <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                  <span className="font-mono text-stone-900 dark:text-stone-100">{Array.from(activeMemberActivityByMemberId.values()).length}</span> active
                </span>
                <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                  <span className="font-mono text-stone-900 dark:text-stone-100">{totalWorkHours.toFixed(1)}h</span> total work time
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {rosterViewToggle}
                {canAccessAdminUi && (
                  <button
                    onClick={() => setIsAddingMember(true)}
                    className="action-btn-primary"
                    title="Add Team Member"
                  >
                    <Plus size={16} />
                    Add Team Member
                  </button>
                )}
              </div>
            </div>
          </div>
          {statusMessages.length > 0 && (
            <div className="space-y-2">
              {statusMessages.map((status, index) => (
                <div
                  key={`${status.type}-${index}`}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm',
                    status.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400'
                      : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                  )}
                >
                  {status.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {embedded && (
        <div className="flex gap-2 flex-wrap justify-end mb-4">
          {rosterViewToggle}
          {canAccessAdminUi && (
            <button
              onClick={() => setIsAddingMember(true)}
              className="action-btn-primary"
            >
              <Plus size={16} />
              Add Team Member
            </button>
          )}
        </div>
      )}
      
      {canAccessAdminUi && isAddingMember && (
        <form onSubmit={handleAddMember} className="section-card p-4 animate-in fade-in slide-in-from-top-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <div className="space-y-1 md:col-span-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Name</label>
              <input
                className="control-input"
                placeholder="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1 md:col-span-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">User ID (Optional)</label>
              <input
                className="control-input"
                placeholder="e.g. USR-101"
                value={memberLoginId}
                onChange={e => setMemberLoginId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Role</label>
              <select 
                className="control-input"
                value={role}
                onChange={e => setRole(e.target.value)}
              >
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Arrangement</label>
              <select
                className="control-input"
                value={arrangementType}
                onChange={e => setArrangementType(e.target.value as any)}
              >
                <option value="hourly">Hourly</option>
                <option value="monthly">Monthly</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button 
              type="button" 
              onClick={() => setIsAddingMember(false)}
              disabled={isSavingMember}
              className="action-btn-tertiary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSavingMember}
              className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-md text-sm hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-70"
            >
              {isSavingMember ? 'Saving…' : 'Add Team Member'}
            </button>
          </div>
        </form>
      )}

      {members.length === 0 ? (
        <div className="section-card">
          <EmptyState
            title="No team members yet"
            description="Add a team member to include them in operational tracking."
            actionLabel="Add Team Member"
            onAction={() => setIsAddingMember(true)}
          />
        </div>
      ) : rosterViewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map(member => {
            const activeActivity = activeMemberActivityByMemberId.get(member.id);
            return (
              <div 
                key={member.id} 
                onClick={() => setSelectedMemberId(member.id)}
                className="bg-white dark:bg-stone-900 p-4 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 cursor-pointer hover:border-emerald-500 transition-colors group"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center text-stone-500 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-900/20 group-hover:text-emerald-600 transition-colors">
                      <User size={20} />
                    </div>
                    <div>
                      <h3 className="font-medium text-stone-900 dark:text-stone-100">{getMemberDisplayName(member.name)}</h3>
                      <p className="text-[10px] text-stone-500 font-mono">{member.member_id || getMemberRoleLabel(member.role)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                  <div className="text-xs text-stone-500">
                    {activeActivity ? (
                      <span className="text-emerald-600 flex items-center gap-1 font-medium">
                        <Clock size={12} />
                        Active in {activeActivity.workspace_id?.slice(0, 8).toUpperCase()}
                      </span>
                    ) : (
                      'Inactive'
                    )}
                  </div>
                  {canAccessAdminUi && (
                    <button
                      onClick={(e) => { void handleDeleteMember(member.id, e); }}
                      disabled={Boolean(activeActivity) || deletingMemberId === member.id}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md disabled:opacity-30"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="section-card overflow-hidden">
          <CollapsibleWorkspaceSection
            title="Team Members"
            summary={formatMemberCount(members.length)}
            defaultExpanded
            onContentScroll={event => setMemberWorkspaceScrollTop(event.currentTarget.scrollTop)}
          >
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 dark:bg-stone-800 text-stone-500 text-[11px] uppercase tracking-wider border-b border-stone-200 dark:border-stone-700">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {members.map(member => {
                  const activeActivity = activeMemberActivityByMemberId.get(member.id);
                  return (
                    <tr key={member.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedMemberId(member.id)} className="font-medium text-stone-900 dark:text-stone-100 hover:underline">
                          {getMemberDisplayName(member.name)}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-stone-500 font-mono text-xs">{member.member_id || '-'}</td>
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-400">{getMemberRoleLabel(member.role)}</td>
                      <td className="px-4 py-3">
                        {activeActivity ? (
                          <span className="text-emerald-600 font-medium text-xs">Active in {activeActivity.workspace_id?.slice(0, 8).toUpperCase()}</span>
                        ) : (
                          <span className="text-stone-400 text-xs">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canAccessAdminUi && (
                          <button
                            onClick={(e) => { void handleDeleteMember(member.id, e); }}
                            disabled={Boolean(activeActivity) || deletingMemberId === member.id}
                            className="text-red-600 hover:underline text-xs disabled:opacity-30"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CollapsibleWorkspaceSection>
        </div>
      )}

      <div className="mt-8 pt-8 border-t border-stone-200 dark:border-stone-800">
        <div ref={memberActivitySectionRef} className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-light text-stone-900 dark:text-stone-100">Activity Logs</h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search logs..."
                className="control-input py-1.5 min-w-[200px]"
              />
            </div>
          </div>
        </div>

        <div className="section-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 dark:bg-stone-800 text-stone-500 text-[11px] uppercase tracking-wider border-b border-stone-200 dark:border-stone-700">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {visibleMemberActivities.map(log => {
                const member = members.find(m => m.id === log.member_id);
                return (
                  <tr key={log.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">{member ? getMemberDisplayName(member.name) : 'Unknown'}</td>
                    <td className="px-4 py-3 text-stone-500 font-mono text-xs">{log.workspace_id?.slice(0, 8).toUpperCase() || '-'}</td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-400">{formatDate(log.start_time)}</td>
                    <td className="px-4 py-3 font-mono">{log.duration_hours?.toFixed(2) || '0.00'}h</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                        log.status === 'active' ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600"
                      )}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleMemberActivities.length === 0 && (
            <div className="p-8 text-center text-stone-500">No activity logs found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
