import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Plus, Clock, User, LayoutGrid, List, Trash2 } from 'lucide-react';
import { formatValue, formatDate } from '../lib/utils';
import ContextPanel from '../components/ContextPanel';
import MobileActivityRecordCard from '../components/MobileActivityRecordCard';
import CollapsibleActivitySection from '../components/CollapsibleActivitySection';
import { cn } from '../lib/utils';
import EmptyState from '../components/EmptyState';
import LoadingLine from '../components/LoadingLine';
import { useLabels } from '../lib/labels';
import { useAppRole } from '../context/AppRoleContext';

const getTeamMemberDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed Team TeamMember';
};

const getTeamMemberRoleLabel = (role?: string | null) => {
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
    teamMembers, 
    activityLogs, 
    addTeamMember, 
    updateTeamMember, 
    deleteTeamMember, 
    loading, 
    loadingProgress 
  } = useData();
  const { canAccessAdminUi } = useAppRole();
  const { tx } = useLabels();
  const [isAddingTeamMember, setIsAddingTeamMember] = useState(false);
  const [rosterViewMode, setRosterViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState<string | null>(null);
  const [teamMemberActivityScrollTop, setTeamMemberActivityScrollTop] = useState(0);
  const [logActivityScrollTop, setLogActivityScrollTop] = useState(0);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [teamMemberSearch, setTeamMemberSearch] = useState('');
  const [deletingTeamMemberId, setDeletingTeamMemberId] = useState<string | null>(null);
  const [isSavingTeamMember, setIsSavingTeamMember] = useState(false);
  const [saveTeamMemberProgress, setSaveTeamMemberProgress] = useState(0);
  const teamMemberActivitySectionRef = useRef<HTMLDivElement | null>(null);
  const saveTeamMemberProgressTimerRef = useRef<number | null>(null);
  const saveTeamMemberProgressResetTimerRef = useRef<number | null>(null);

  const clearSaveTeamMemberProgressTimers = () => {
    if (saveTeamMemberProgressTimerRef.current !== null) {
      window.clearInterval(saveTeamMemberProgressTimerRef.current);
      saveTeamMemberProgressTimerRef.current = null;
    }
    if (saveTeamMemberProgressResetTimerRef.current !== null) {
      window.clearTimeout(saveTeamMemberProgressResetTimerRef.current);
      saveTeamMemberProgressResetTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearSaveTeamMemberProgressTimers();
  }, []);

  const [name, setName] = useState('');
  const [teamMemberLoginId, setTeamMemberLoginId] = useState('');
  const [role, setRole] = useState('viewer');

  const selectedTeamMember = teamMembers.find(s => s.id === selectedTeamMemberId);

  const activeTeamMemberActivityByTeamMemberId = useMemo(() => {
    const map = new Map<string, typeof activityLogs[number]>();
    activityLogs.forEach(log => {
      if (log.status === 'active' && !map.has(log.teamMember_id)) {
        map.set(log.teamMember_id, log);
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

  const teamMemberNameById = useMemo(() => {
    const map = new Map<string, string>();
    teamMembers.forEach(teamMember => {
      map.set(teamMember.id, getTeamMemberDisplayName(teamMember.name));
    });
    return map;
  }, [teamMembers]);

  const ROSTER_ROW_HEIGHT = 56;
  const SHIFT_ROW_HEIGHT = 58;
  const WORKSPACE_OVERSCAN = 10;
  const ROSTER_VIEWPORT_HEIGHT = 560;
  const SHIFT_VIEWPORT_HEIGHT = 460;

  const normalizedTeamMemberSearch = teamMemberSearch.trim().toLowerCase();
  
  const filteredTeamMemberActivities = useMemo(() => {
    if (!normalizedTeamMemberSearch) return activityLogs;

    return activityLogs.filter(log => {
      const teamMemberName = (teamMemberNameById.get(log.teamMember_id) ?? 'Unknown').toLowerCase();
      const dateLabel = log.start_time ? formatDate(log.start_time).toLowerCase() : '';
      const status = (log.status ?? '').toLowerCase();
      const activityId = (log.activity_id ?? '').toLowerCase();
      return (
        teamMemberName.includes(normalizedTeamMemberSearch) ||
        activityId.includes(normalizedTeamMemberSearch) ||
        dateLabel.includes(normalizedTeamMemberSearch) ||
        status.includes(normalizedTeamMemberSearch)
      );
    });
  }, [normalizedTeamMemberSearch, activityLogs, teamMemberNameById]);

  const shouldWindowTeamMemberActivity = filteredTeamMemberActivities.length > 150;
  const logVisibleCount = Math.ceil(SHIFT_VIEWPORT_HEIGHT / SHIFT_ROW_HEIGHT) + WORKSPACE_OVERSCAN * 2;
  const logStartIndex = shouldWindowTeamMemberActivity
    ? Math.max(0, Math.floor(logActivityScrollTop / SHIFT_ROW_HEIGHT) - WORKSPACE_OVERSCAN)
    : 0;
  const logEndIndex = shouldWindowTeamMemberActivity
    ? Math.min(filteredTeamMemberActivities.length, logStartIndex + logVisibleCount)
    : filteredTeamMemberActivities.length;

  const visibleTeamMemberActivities = shouldWindowTeamMemberActivity 
    ? filteredTeamMemberActivities.slice(logStartIndex, logEndIndex) 
    : filteredTeamMemberActivities;

  const logTopSpacerHeight = shouldWindowTeamMemberActivity ? logStartIndex * SHIFT_ROW_HEIGHT : 0;
  const logBottomSpacerHeight = shouldWindowTeamMemberActivity 
    ? Math.max(0, (filteredTeamMemberActivities.length - logEndIndex) * SHIFT_ROW_HEIGHT) 
    : 0;

  useEffect(() => {
    setLogActivityScrollTop(0);
  }, [normalizedTeamMemberSearch]);

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingTeamMember) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setImportStatus({ type: 'error', message: 'Team teamMember name is required.' });
      return;
    }
    clearSaveTeamMemberProgressTimers();
    setIsSavingTeamMember(true);
    let progress = 8;
    setSaveTeamMemberProgress(progress);
    saveTeamMemberProgressTimerRef.current = window.setInterval(() => {
      progress = Math.min(progress + (progress < 70 ? 10 : progress < 90 ? 4 : 1), 92);
      setSaveTeamMemberProgress(progress);
    }, 120);

    try {
      await addTeamMember({
        name: normalizedName,
        teamMember_id: teamMemberLoginId.trim() || undefined,
        role: role as any,
        status: 'active'
      });

      clearSaveTeamMemberProgressTimers();
      setSaveTeamMemberProgress(100);
      setImportStatus({ type: 'success', message: 'Team teamMember saved.' });
      setIsAddingTeamMember(false);
      setName('');
      setTeamMemberLoginId('');
    } catch (error: any) {
      clearSaveTeamMemberProgressTimers();
      setSaveTeamMemberProgress(100);
      setImportStatus({ type: 'error', message: error?.message || 'Unable to save team teamMember.' });
    } finally {
      saveTeamMemberProgressResetTimerRef.current = window.setTimeout(() => {
        setIsSavingTeamMember(false);
        setSaveTeamMemberProgress(0);
        saveTeamMemberProgressResetTimerRef.current = null;
      }, 360);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (!action) return;

    if (action === 'add-teamMember' || action === 'add-teamMember') {
      setIsAddingTeamMember(true);
    } else if (action === 'view-log') {
      teamMemberActivitySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        const targetTeamMember = selectedTeamMemberId
          ? teamMembers.find(teamMember => teamMember.id === selectedTeamMemberId)
          : teamMembers.find(teamMember => !activeTeamMemberActivityByTeamMemberId.has(teamMember.id));
        if (targetTeamMember) {
          void handleDeleteTeamMember(targetTeamMember.id);
        }
        return;
      }

      if (normalizedKey === 'l') {
        event.preventDefault();
        teamMemberActivitySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [selectedTeamMemberId, teamMembers, activeTeamMemberActivityByTeamMemberId, canAccessAdminUi]);

  const handleDeleteTeamMember = async (targetTeamMemberId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (deletingTeamMemberId === targetTeamMemberId) return;

    const teamMember = teamMembers.find(item => item.id === targetTeamMemberId);
    if (!teamMember) return;

    const activeTeamMemberActivity = activeTeamMemberActivityByTeamMemberId.get(targetTeamMemberId);
    if (activeTeamMemberActivity) {
      setImportStatus({ type: 'error', message: 'Close the active activity log before deleting this team teamMember.' });
      return;
    }

    const confirmed = window.confirm(`Remove ${getTeamMemberDisplayName(teamMember.name)} from the team?`);
    if (!confirmed) return;

    try {
      setDeletingTeamMemberId(targetTeamMemberId);
      await deleteTeamMember(targetTeamMemberId);
      setImportStatus({ type: 'success', message: 'Team teamMember removed.' });
      if (selectedTeamMemberId === targetTeamMemberId) {
        setSelectedTeamMemberId(null);
      }
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error?.message || 'Unable to delete team teamMember.' });
    } finally {
      setDeletingTeamMemberId(null);
    }
  };


  const handleUpdateTags = async (id: string, tags: string[]) => {
    const teamTeamMember = teamMembers.find(s => s.id === id);
    if (teamTeamMember && updateTeamMember) {
      await updateTeamMember({ ...teamTeamMember, tags });
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

  const formatTeamMemberCount = (count: number) => `${count} ${count === 1 ? 'user' : 'users'}`;

  if (loading && teamMembers.length === 0) {
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

      {!embedded && (
        <div className="section-card p-5 lg:p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center justify-between">
            <div>
              <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">Team Members</h2>
              <p className="text-stone-500 dark:text-stone-400 text-sm">Team roster and operational roles.</p>
            </div>
            <div className="flex flex-col items-start lg:items-end gap-3">
              <div className="hidden lg:flex items-center gap-2 text-xs">
                <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                  <span className="font-mono text-stone-900 dark:text-stone-100">{formatTeamMemberCount(teamMembers.length)}</span>
                </span>
                <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                  <span className="font-mono text-stone-900 dark:text-stone-100">{Array.from(activeTeamMemberActivityByTeamMemberId.values()).length}</span> active
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {rosterViewToggle}
                {canAccessAdminUi && (
                  <button
                    onClick={() => setIsAddingTeamMember(true)}
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
              onClick={() => setIsAddingTeamMember(true)}
              className="action-btn-primary"
            >
              <Plus size={16} />
              Add Team Member
            </button>
          )}
        </div>
      )}
      
      {canAccessAdminUi && isAddingTeamMember && (
        <form onSubmit={handleAddTeamMember} className="section-card p-4 animate-in fade-in slide-in-from-top-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
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
                value={teamMemberLoginId}
                onChange={e => setTeamMemberLoginId(e.target.value)}
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
          </div>
          <div className="flex justify-end gap-2">
            <button 
              type="button" 
              onClick={() => setIsAddingTeamMember(false)}
              disabled={isSavingTeamMember}
              className="action-btn-tertiary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSavingTeamMember}
              className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-md text-sm hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-70"
            >
              {isSavingTeamMember ? 'Saving…' : 'Add Team Member'}
            </button>
          </div>
        </form>
      )}

      {teamMembers.length === 0 ? (
        <div className="section-card">
          <EmptyState
            title="No team members yet"
            description="Add a team teamMember to include them in operational tracking."
            actionLabel="Add Team Member"
            onAction={() => setIsAddingTeamMember(true)}
          />
        </div>
      ) : rosterViewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teamMembers.map(teamMember => {
            const activeActivity = activeTeamMemberActivityByTeamMemberId.get(teamMember.id);
            return (
              <div 
                key={teamMember.id} 
                onClick={() => setSelectedTeamMemberId(teamMember.id)}
                className="bg-white dark:bg-stone-900 p-4 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 cursor-pointer hover:border-emerald-500 transition-colors group"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center text-stone-500 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-900/20 group-hover:text-emerald-600 transition-colors">
                      <User size={20} />
                    </div>
                    <div>
                      <h3 className="font-medium text-stone-900 dark:text-stone-100">{getTeamMemberDisplayName(teamMember.name)}</h3>
                      <p className="text-[10px] text-stone-500 font-mono">{teamMember.teamMember_id || getTeamMemberRoleLabel(teamMember.role)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                  <div className="text-xs text-stone-500">
                    {activeActivity ? (
                      <span className="text-emerald-600 flex items-center gap-1 font-medium">
                        <Clock size={12} />
                        Active in {activeActivity.activity_id?.slice(0, 8).toUpperCase()}
                      </span>
                    ) : (
                      'Inactive'
                    )}
                  </div>
                  {canAccessAdminUi && (
                    <button
                      onClick={(e) => { void handleDeleteTeamMember(teamMember.id, e); }}
                      disabled={Boolean(activeActivity) || deletingTeamMemberId === teamMember.id}
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
          <CollapsibleActivitySection
            title="Team Members"
            summary={formatTeamMemberCount(teamMembers.length)}
            defaultExpanded
            onContentScroll={event => setTeamMemberActivityScrollTop(event.currentTarget.scrollTop)}
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
                {teamMembers.map(teamMember => {
                  const activeActivity = activeTeamMemberActivityByTeamMemberId.get(teamMember.id);
                  return (
                    <tr key={teamMember.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedTeamMemberId(teamMember.id)} className="font-medium text-stone-900 dark:text-stone-100 hover:underline">
                          {getTeamMemberDisplayName(teamMember.name)}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-stone-500 font-mono text-xs">{teamMember.teamMember_id || '-'}</td>
                      <td className="px-4 py-3 text-stone-600 dark:text-stone-400">{getTeamMemberRoleLabel(teamMember.role)}</td>
                      <td className="px-4 py-3">
                        {activeActivity ? (
                          <span className="text-emerald-600 font-medium text-xs">Active in {activeActivity.activity_id?.slice(0, 8).toUpperCase()}</span>
                        ) : (
                          <span className="text-stone-400 text-xs">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canAccessAdminUi && (
                          <button
                            onClick={(e) => { void handleDeleteTeamMember(teamMember.id, e); }}
                            disabled={Boolean(activeActivity) || deletingTeamMemberId === teamMember.id}
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
          </CollapsibleActivitySection>
        </div>
      )}

      <div className="mt-8 pt-8 border-t border-stone-200 dark:border-stone-800">
        <div ref={teamMemberActivitySectionRef} className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-light text-stone-900 dark:text-stone-100">Activity Logs</h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                value={teamMemberSearch}
                onChange={e => setTeamMemberSearch(e.target.value)}
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
                <th className="px-4 py-3">TeamMember</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {visibleTeamMemberActivities.map(log => {
                const teamMember = teamMembers.find(m => m.id === log.teamMember_id);
                return (
                  <tr key={log.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">{teamMember ? getTeamMemberDisplayName(teamMember.name) : 'Unknown'}</td>
                    <td className="px-4 py-3 text-stone-500 font-mono text-xs">{log.activity_id?.slice(0, 8).toUpperCase() || '-'}</td>
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
          {visibleTeamMemberActivities.length === 0 && (
            <div className="p-8 text-center text-stone-500">No activity logs found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
