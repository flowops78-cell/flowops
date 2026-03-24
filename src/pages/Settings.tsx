import React from 'react';
import { ShieldCheck, LogOut, CheckCircle2, AlertTriangle, Key } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { DbRole, dbRoleToAppRole } from '../lib/roles';
import { getSupabaseAccessToken, isSupabaseConfigured, SUPABASE_ANON_KEY, supabase } from '../lib/supabase';
import { useNotification } from '../context/NotificationContext';
import LoadingLine from '../components/LoadingLine';
import CollapsibleActivitySection from '../components/CollapsibleActivitySection';
import LiveOperatorsTracker from '../components/LiveOperatorsTracker';

type AccessRequestRow = {
  id: string;
  created_at: string;
  login_id: string;
  requested_role: DbRole;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_at?: string | null;
};

type AccessInviteRow = {
  id: string;
  label?: string | null;
  created_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
  use_count: number;
  max_uses: number;
};

type ProvisionResult = {
  ok?: boolean;
  login_id?: string;
  app_role?: DbRole;
  user_already_exists?: boolean;
};

type ManagedClusterAccount = {
  user_id: string;
  email: string | null;
  role: 'cluster_admin' | 'cluster_operator' | 'viewer';
  active_org_id: string | null;
  created_at: string | null;
};

type ManageClusterAdminsResult = {
  ok?: boolean;
  cluster_id?: string | null;
  managed_org_ids?: string[];
  admins?: ManagedClusterAccount[];
};

const buildInviteShareMessage = (token: string) => {
  return [
    'Flow Ops access invite',
    '',
    '1. Open the Flow Ops sign-in page.',
    '2. Switch to Request Access.',
    '3. Paste this invite token exactly as shown below.',
    '',
    `Invite token: ${token}`,
  ].join('\n');
};

const sha256Hex = async (input: string) => {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const generateInviteToken = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
};

export default function Settings({ embedded = false }: { embedded?: boolean }) {
  // Pull only canonical DataContext properties
  const {
    isDemoMode,
    activeOrgId,
    entities: rawEntities,
    activities: rawActivities,
    records: rawRecords,
    teamMembers: rawTeamMembers,
    activityLogs: rawActivityLogs,
    systemEvents: rawSystemEvents,
    refreshData,
  } = useData();

  // Defensive guards — no collection can be undefined
  const entities = rawEntities ?? [];
  const activities = rawActivities ?? [];
  const records = rawRecords ?? [];
  const teamMembers = rawTeamMembers ?? [];
  const activityLogs = rawActivityLogs ?? [];
  const systemEvents = rawSystemEvents ?? [];

  // Removed APIs — stubbed as safe no-ops until Settings is fully migrated
  const expenses: any[] = [];
  const adjustments: any[] = [];
  const channelEntries: any[] = [];
  const operatorLogs: any[] = [];
  const recordSystemEvent = async (_data: any) => {};
  const updateProfileOrgId = async (_id: string) => {};
  const bootstrapClusterAdmin = async (_data: any) => {};
  const managedOrgIds: string[] = [];
  const clusterId: string | null = null;
  const { role, clusterRole, isClusterAdmin, canAccessAdminUi } = useAppRole();

  const { notify } = useNotification();
  const { user } = useAuth();
  const canViewOperatorLogs = canAccessAdminUi;
  const canManageMetaOrgAdmins = role === 'admin';
  const [isClearingGlobalData, setIsClearingGlobalData] = React.useState(false);
  const [accessInvites, setAccessInvites] = React.useState<AccessInviteRow[]>([]);
  const [inviteLabel, setInviteLabel] = React.useState('');
  const [inviteExpiryDays, setInviteExpiryDays] = React.useState('7');
  const [inviteMaxUses, setInviteMaxUses] = React.useState('1');
  const [inviteLoading, setInviteLoading] = React.useState(false);
  const [inviteSearch, setInviteSearch] = React.useState('');
  const [inviteNotice, setInviteNotice] = React.useState<string | null>(null);
  const [inviteTokenValue, setInviteTokenValue] = React.useState<string | null>(null);
  const [inviteTokenCopied, setInviteTokenCopied] = React.useState(false);
  const [inviteMessageCopied, setInviteMessageCopied] = React.useState(false);
  const [busyInviteId, setBusyInviteId] = React.useState<string | null>(null);
  const [accessRequests, setAccessRequests] = React.useState<AccessRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = React.useState(false);
  const [requestsNotice, setRequestsNotice] = React.useState<string | null>(null);
  const [requestsNoticeLoginValue, setRequestsNoticeLoginValue] = React.useState<string | null>(null);
  const [requestsNoticeCopied, setRequestsNoticeCopied] = React.useState<'login' | null>(null);
  const [busyRequestId, setBusyRequestId] = React.useState<string | null>(null);
  const [pendingTeamMemberIds, setPendingTeamMemberIds] = React.useState<Record<string, string>>({});
  const [pendingPasswords, setPendingPasswords] = React.useState<Record<string, string>>({});
  const [pendingApprovedRoles, setPendingApprovedRoles] = React.useState<Record<string, DbRole>>({});
  const [clusterAdmins, setClusterAdmins] = React.useState<ManagedClusterAccount[]>([]);
  const [managedClusterId, setManagedClusterId] = React.useState<string | null>(null);
  const [clusterManagedOrgIds, setClusterManagedOrgIds] = React.useState<string[]>([]);
  const [clusterAdminsLoading, setClusterAdminsLoading] = React.useState(false);
  const [clusterAdminsNotice, setClusterAdminsNotice] = React.useState<string | null>(null);
  const [pendingClusterRoles, setPendingClusterRoles] = React.useState<Record<string, 'cluster_admin' | 'cluster_operator'>>({});
  const [busyClusterUserId, setBusyClusterUserId] = React.useState<string | null>(null);
  const [clusterSearch, setClusterSearch] = React.useState('');

  const canManageGlobalData = canAccessAdminUi;
  const profileId = user?.id ?? '';
  const profileLookupSql = profileId
    ? `select id, org_id, meta_org_id\nfrom public.profiles\nwhere id = '${profileId}';`
    : `select id, org_id, meta_org_id\nfrom public.profiles\nwhere id = 'YOUR_AUTH_USER_ID';`;
  const orgCandidatesSql = `select distinct org_id\nfrom public.activities\nwhere org_id is not null\norder by org_id;`;
  const profileUpdateSql = profileId
    ? `update public.profiles\nset org_id = 'YOUR_ORG_UUID'\nwhere id = '${profileId}';`
    : `update public.profiles\nset org_id = 'YOUR_ORG_UUID'\nwhere id = 'YOUR_AUTH_USER_ID';`;

  const clearGlobalData = async () => {
    if (!canManageGlobalData) {
      notify({ type: 'error', message: 'Only admin can clear global data.' });
      return;
    }
    if (isClearingGlobalData) return;

    const confirmed = window.confirm('Clear all operational data? This removes activities, entities, records, teamMember records, teamMember activities, expenses, adjustment requests, collaboration network, and channel movements. This cannot be undone.');
    if (!confirmed) return;

    setIsClearingGlobalData(true);
    try {
      if (isDemoMode) {
        const demoKeys = [
          'flow_ops_units',
          'flow_ops_activitys',
          'flow_ops_entries',
          'flow_ops_teamMembers',
          'flow_ops_activity_logs',
          'flow_ops_outflows',
          'flow_ops_adjustments',
          'flow_ops_channel_base',
          'flow_ops_collaborations',
          'flow_ops_collaboration_allocations',
          'flow_ops_partners',
          'flow_ops_partner_trans',
          'flow_ops_audit_events_v2',
          'flow_ops_operator_log_id',
          'flow_ops_operator_log_started_at',
          'flow_ops_operator_log_user_id',
          'flow_ops_missing_supabase_activitys',
        ];
        demoKeys.forEach(key => localStorage.removeItem(key));
        await refreshData();
        notify({ type: 'success', message: 'Demo data cleared.' });
      } else {
        const client = supabase;
        if (!client) throw new Error('Supabase project connectivity is not configured in environment variables.');

        const isMissingActivityError = (message: string) => {
          const normalized = message.toLowerCase();
          return normalized.includes('could not find the activity') || normalized.includes('relation') || normalized.includes('schema cache');
        };

        const clearActivity = async (activityName: string) => {
          const { error } = await client.from(activityName).delete().not('id', 'is', null);
          if (error && !isMissingActivityError(error.message ?? '')) {
            throw new Error(`${activityName}: ${error.message}`);
          }
        };

        await clearActivity('records');
        await clearActivity('activity_logs');
        await clearActivity('outflows');
        await clearActivity('adjustments');
        await clearActivity('channel_entries');
        await clearActivity('collaboration_allocations');
        await clearActivity('activities');
        await clearActivity('teamMembers');
        await clearActivity('audit_events');
        await clearActivity('operator_activities');
        await clearActivity('collaborations');
        await clearActivity('entities');

        await refreshData();
        notify({ type: 'success', message: 'Cloud operational data cleared.' });
      }
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to clear global data.' });
    } finally {
      setIsClearingGlobalData(false);
    }
  };

  const fetchAccessRequests = React.useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !canViewOperatorLogs) return;
    setRequestsLoading(true);
    setRequestsNotice(null);
    setRequestsNoticeLoginValue(null);
    setRequestsNoticeCopied(null);
    try {
      const { data, error } = await supabase
        .from('access_requests')
        .select('id, created_at, login_id, requested_role, status, reviewed_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) {
        setAccessRequests([]);
        const normalizedErrorMessage = (error.message ?? '').toLowerCase();
        setRequestsNotice(normalizedErrorMessage.includes('access_requests')
          ? 'access_requests activity not found yet. Run supabase/migrations/20260322230000_flow_ops_schema.sql.'
          : `Unable to load access requests: ${error.message}`);
        return;
      }
      setAccessRequests((data ?? []) as AccessRequestRow[]);
    } catch (error) {
      const detailedError = error instanceof Error ? error.message : 'Transport request failed.';
      setAccessRequests([]);
      setRequestsNotice(`Unable to load access requests: ${detailedError}`);
    } finally {
      setRequestsLoading(false);
    }
  }, [canViewOperatorLogs]);

  const fetchAccessInvites = React.useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !canViewOperatorLogs) return;
    setInviteLoading(true);
    try {
      const { data, error } = await supabase
        .from('access_invites')
        .select('id, label, created_at, expires_at, revoked_at, last_used_at, use_count, max_uses')
        .order('created_at', { ascending: false })
        .limit(120);

      if (error) {
        setAccessInvites([]);
        const normalizedErrorMessage = (error.message ?? '').toLowerCase();
        setInviteNotice(normalizedErrorMessage.includes('access_invites')
          ? 'access_invites activity not found yet. Run supabase/migrations/20260322230000_flow_ops_schema.sql.'
          : `Unable to load invite tokens: ${error.message}`);
        return;
      }

      setAccessInvites((data ?? []) as AccessInviteRow[]);
    } catch (error) {
      const detailedError = error instanceof Error ? error.message : 'Transport request failed.';
      setAccessInvites([]);
      setInviteNotice(`Unable to load invite tokens: ${detailedError}`);
    } finally {
      setInviteLoading(false);
    }
  }, [canViewOperatorLogs]);

  const fetchClusterAdmins = React.useCallback(async (
    orgIdOverride?: string,
  ) => {
    const orgId = orgIdOverride ?? activeOrgId;
    if (!isSupabaseConfigured || !supabase || !canAccessAdminUi || !orgId) return;

    setClusterAdminsLoading(true);
    setClusterAdminsNotice(null);

    try {
      const accessToken = await getSupabaseAccessToken();
      if (!accessToken) {
        setClusterAdminsNotice('Cluster admin loading requires an active auth session.');
        return;
      }

      const { data, error } = await supabase.functions.invoke<ManageClusterAdminsResult>('manage-organizations', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: {
          action: 'list-cluster-admins',
          org_id: orgId,
        },
      });

      if (error) {
        setClusterAdminsNotice(`Unable to load cluster admins: ${String(error)}`);
        return;
      }

      setClusterAdmins(data?.admins ?? []);
      setManagedClusterId(data?.cluster_id ?? null);
      setClusterManagedOrgIds(data?.managed_org_ids ?? []);
    } catch (error) {
      setClusterAdminsNotice(`Transport error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setClusterAdminsLoading(false);
    }
  }, [activeOrgId, canAccessAdminUi]);

  React.useEffect(() => {
    void fetchAccessRequests();
    void fetchAccessInvites();
    void fetchClusterAdmins();
  }, [fetchAccessInvites, fetchAccessRequests, fetchClusterAdmins]);

  const reviewAccessRequest = async (request: AccessRequestRow, status: 'approved' | 'rejected') => {
    if (!supabase || !user) return;
    setBusyRequestId(request.id);
    setRequestsNotice(null);
    setRequestsNoticeLoginValue(null);
    setRequestsNoticeCopied(null);

    if (status === 'approved') {
      const initialPassword = pendingPasswords[request.id]?.trim() || '';
      if (initialPassword.length < 8) {
        setRequestsNotice('Approval requires an initial password with at least 8 characters.');
        notify({ type: 'error', message: 'Initial password must be at least 8 characters.' });
        setBusyRequestId(null);
        return;
      }

      const accessToken = await getSupabaseAccessToken();

      if (!accessToken) {
        const detailedError = 'Approval failed: missing active auth activity. Please sign out and sign in again.';
        setRequestsNotice(detailedError);
        notify({ type: 'error', message: detailedError });
        setBusyRequestId(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke<ProvisionResult>('provision-user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: {
          access_request_id: request.id,
          teamMember_id: pendingTeamMemberIds[request.id]?.trim() || undefined,
          password: initialPassword,
          approved_role: pendingApprovedRoles[request.id] || request.requested_role,
        },
      });
      if (error) {
        const detailedError = (error as any)?.message ?? String(error);
        setRequestsNotice(`Approval failed: ${detailedError}`);
        notify({ type: 'error', message: `Approval failed: ${detailedError}` });
        setBusyRequestId(null);
        return;
      }
      const approvedLoginId = data?.login_id ?? request.login_id;
      await fetchAccessRequests();
      setBusyRequestId(null);
      setPendingPasswords(prev => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      setPendingTeamMemberIds(prev => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      setPendingApprovedRoles(prev => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      if (data?.user_already_exists) {
        setRequestsNotice(`Approved for ${approvedLoginId}. Existing account was updated.`);
        notify({ type: 'success', message: `Approved for ${approvedLoginId}. Existing account updated.` });
      } else {
        setRequestsNotice(`Approved for ${approvedLoginId}.`);
        notify({ type: 'success', message: `Approved for ${approvedLoginId}.` });
      }
      setRequestsNoticeLoginValue(approvedLoginId);
      return;
    }

    const { error } = await supabase.from('access_requests').update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', request.id);
    if (error) {
      setRequestsNotice(`Unable to update request: ${error.message}`);
      notify({ type: 'error', message: `Unable to update request: ${error.message}` });
      setBusyRequestId(null);
      return;
    }
    if (status === 'rejected') {
      setRequestsNotice('Request rejected.');
      notify({ type: 'info', message: 'Request rejected.' });
    }
    await fetchAccessRequests();
    setBusyRequestId(null);
  };

  const updateClusterAccountRole = async (account: ManagedClusterAccount) => {
    if (!supabase || !activeOrgId) return;

    const nextRole = pendingClusterRoles[account.user_id] || account.role;
    if (nextRole === account.role) return;

    const accessToken = await getSupabaseAccessToken();
    if (!accessToken) {
      setClusterAdminsNotice('Session expired.');
      return;
    }

    setBusyClusterUserId(account.user_id);
    setClusterAdminsNotice(null);

    const { error } = await supabase.functions.invoke('manage-organizations', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: {
        action: 'set-cluster-role',
        org_id: activeOrgId,
        target_user_id: account.user_id,
        target_role: nextRole,
      },
    });

    if (error) {
      setClusterAdminsNotice(`Update failed: ${String(error)}`);
      setBusyClusterUserId(null);
      return;
    }

    await fetchClusterAdmins();
    notify({ type: 'success', message: `Updated role for ${account.email}.` });
    setBusyClusterUserId(null);
  };

  const deleteClusterAccount = async (account: ManagedClusterAccount) => {
    if (!supabase || !activeOrgId) return;
    if (!window.confirm(`Delete account ${account.email}?`)) return;

    const accessToken = await getSupabaseAccessToken();
    if (!accessToken) return;

    setBusyClusterUserId(account.user_id);
    const { error } = await supabase.functions.invoke('manage-organizations', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: {
        action: 'delete-user',
        org_id: activeOrgId,
        target_user_id: account.user_id,
      },
    });

    if (error) {
      notify({ type: 'error', message: `Deletion failed: ${String(error)}` });
      setBusyClusterUserId(null);
      return;
    }

    await fetchClusterAdmins();
    notify({ type: 'success', message: `Account removed.` });
    setBusyClusterUserId(null);
  };

  const createAccessInvite = async () => {
    if (!supabase || !user || !activeOrgId) return;
    setInviteNotice(null);
    setInviteTokenValue(null);
    setInviteTokenCopied(false);

    const parsedMaxUses = Math.max(1, Math.floor(Number(inviteMaxUses) || 1));
    const parsedExpiryDays = Math.max(0, Math.floor(Number(inviteExpiryDays) || 0));
    const rawToken = generateInviteToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = parsedExpiryDays > 0
      ? new Date(Date.now() + parsedExpiryDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error } = await supabase.from('access_invites').insert([
      {
        org_id: activeOrgId,
        token_hash: tokenHash,
        label: inviteLabel.trim() || null,
        created_by: user.id,
        expires_at: expiresAt,
        max_uses: parsedMaxUses,
      },
    ]);

    if (error) {
      setInviteNotice(`Unable to create invite token: ${error.message}`);
      notify({ type: 'error', message: `Unable to create invite token: ${error.message}` });
      return;
    }

    setInviteLabel('');
    setInviteExpiryDays('7');
    setInviteMaxUses('1');
    setInviteNotice('Invite token created. Copy it now; the raw token is not stored.');
    setInviteTokenValue(rawToken);
    setInviteMessageCopied(false);
    notify({ type: 'success', message: 'Invite token created.' });
    await fetchAccessInvites();
  };

  const revokeAccessInvite = async (inviteId: string) => {
    if (!supabase) return;
    setBusyInviteId(inviteId);
    const { error } = await supabase
      .from('access_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId);

    if (error) {
      setInviteNotice(`Unable to revoke invite token: ${error.message}`);
      notify({ type: 'error', message: `Unable to revoke invite token: ${error.message}` });
      setBusyInviteId(null);
      return;
    }

    notify({ type: 'success', message: 'Invite token revoked.' });
    setBusyInviteId(null);
    await fetchAccessInvites();
  };

  const backendStatus = isDemoMode
    ? 'Demo mode'
    : isSupabaseConfigured
      ? 'Connected'
      : 'Not configured';
  
  const roleLabel = React.useMemo(() => {
    if (clusterRole === 'cluster_admin') return 'Cluster Admin';
    if (clusterRole === 'cluster_operator') return 'Cluster Operator';
    if (role === 'admin') return 'Org Admin';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }, [clusterRole, role]);


  const provisionOrganization = async () => {
    if (!supabase || !activeOrgId || !clusterId) return;
    if (!window.confirm('Add a new organization to this cluster?')) return;

    const accessToken = await getSupabaseAccessToken();
    if (!accessToken) return;

    const { data, error } = await supabase.functions.invoke('manage-organizations', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: {
        action: 'provision-organization',
        org_id: activeOrgId,
        cluster_id: clusterId,
      },
    });

    if (error) {
      notify({ type: 'error', message: `Provisioning failed: ${String(error)}` });
      return;
    }

    notify({ type: 'success', message: 'New organization provisioned.' });
    await refreshData();
    await fetchClusterAdmins();
  };

  const filteredClusterAdmins = clusterAdmins.filter(admin =>
    (admin.email ?? '').toLowerCase().includes(clusterSearch.toLowerCase()) ||
    (admin.user_id ?? '').toLowerCase().includes(clusterSearch.toLowerCase())
  );

  const filteredInvites = accessInvites.filter(invite =>
    !invite.revoked_at &&
    (
      (invite.label ?? '').toLowerCase().includes(inviteSearch.toLowerCase()) ||
      invite.id.toLowerCase().includes(inviteSearch.toLowerCase())
    )
  );

  return (
    <div className={cn(embedded ? 'space-y-6' : 'page-shell', 'w-full min-w-0 overflow-x-hidden')}>
      {!embedded && (
        <div className="mb-6">
          <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100 mb-1">Settings</h2>
          <p className="text-xs text-stone-500">Deterministic Cluster-Organization Administration</p>
        </div>
      )}

      <div className="space-y-6">
        <div className="section">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">System</h3>
          <div className="space-y-2 text-sm text-stone-700 dark:text-stone-300">
            <p><span className="font-medium">Auth:</span> {user ? 'Authenticated' : 'Not authenticated'}</p>
            <p><span className="font-medium">Role:</span> {roleLabel}</p>
            <p><span className="font-medium">Backend:</span> {backendStatus}</p>
          </div>
        </div>

        {/* 1. Cluster Administration */}
        <div className="section border-t border-stone-200 dark:border-stone-800 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-stone-900 dark:text-stone-100">Cluster Administration</h3>
            {clusterId && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                Authoritative Cluster
              </span>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="bg-stone-50 dark:bg-stone-900/40 rounded-xl p-4 border border-stone-200 dark:border-stone-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-stone-400" />
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-tight">Active Cluster ID</span>
                </div>
                <span className="font-mono text-[11px] text-stone-400 select-all">{clusterId || 'None'}</span>
              </div>

              {clusterAdminsLoading ? (
                <div className="py-4 text-center text-xs text-stone-400">Loading cluster hierarchy...</div>
              ) : (
                <div className="space-y-3">
                  {clusterAdmins.length === 0 && !isClusterAdmin && (
                    <p className="text-xs text-stone-400 italic text-center py-4">No cluster admins found.</p>
                  )}
                  {/* Safeguard: Ensure current user is shown if they are a cluster admin but missing from list */}
                  {isClusterAdmin && !clusterAdmins.some(a => a.user_id === user?.id) && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20">
                      <div className="min-w-0 flex-1 mr-4">
                        <p className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">{user?.email} (You)</p>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter font-bold">
                          {clusterRole?.replace('_', ' ') || 'Cluster Admin'}
                        </p>
                      </div>
                      <span className="text-[10px] text-emerald-600 font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30">
                        Implicit Authority
                      </span>
                    </div>
                  )}
                  {filteredClusterAdmins.map(admin => (

                    <div key={admin.user_id} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-stone-800 border border-stone-100 dark:border-stone-700/50">
                      <div className="min-w-0 flex-1 mr-4">
                        <p className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">{admin.email}</p>
                        <p className="text-[10px] text-stone-500 uppercase tracking-tighter">{admin.role.replace('_', ' ')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          className="text-[10px] bg-stone-50 dark:bg-stone-900 border-stone-200 rounded px-1 py-0.5"
                          value={pendingClusterRoles[admin.user_id] || admin.role}
                          onChange={(e) => setPendingClusterRoles(prev => ({ ...prev, [admin.user_id]: e.target.value as any }))}
                        >
                          <option value="cluster_admin">Admin</option>
                          <option value="cluster_operator">Operator</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button 
                          onClick={() => void updateClusterAccountRole(admin)}
                          disabled={busyClusterUserId === admin.user_id}
                          className="text-[10px] text-emerald-600 font-bold uppercase hover:bg-emerald-50 dark:hover:bg-emerald-900/20 px-1.5 py-0.5 rounded"
                        >
                          {busyClusterUserId === admin.user_id ? '...' : 'Save'}
                        </button>
                        {admin.user_id !== user?.id && (
                          <button 
                            onClick={() => void deleteClusterAccount(admin)}
                            disabled={busyClusterUserId === admin.user_id}
                            className="text-[10px] text-stone-400 hover:text-red-600 px-1.5 py-0.5 rounded"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Organization Provisioning */}
        <div className="section border-t border-stone-200 dark:border-stone-800 pt-6">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Deterministic Provisioning</h3>
          <div className="bg-white dark:bg-stone-900 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-4">
            <p className="text-xs text-stone-600 dark:text-stone-400 mb-4">
              Provision a new organization within your cluster. Deterministic mapping ensures cross-org stability.
            </p>
            <div className="flex gap-3">
              <button 
                disabled={!clusterId}
                onClick={() => void provisionOrganization()}
                className="action-btn-primary text-xs h-9 px-4 disabled:opacity-50"
              >
                Add Organization to Cluster
              </button>
              {!clusterId && (
                <button 
                  onClick={() => void bootstrapClusterAdmin()}
                  className="action-btn-secondary text-xs h-9 px-4 border-amber-200 text-amber-800 dark:text-amber-400 dark:border-amber-900/50"
                >
                  Bootstrap New Cluster
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 3. Cross-Organization Switching */}
        <div className="section border-t border-stone-200 dark:border-stone-800 pt-6">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Scoped Context Switcher</h3>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {managedOrgIds.length === 0 && <p className="text-xs text-stone-400 italic">No organizations available to switch.</p>}
              {managedOrgIds.map(id => (
                <button
                  key={id}
                  onClick={() => void updateProfileOrgId(id)}
                  className={cn(
                    "text-[11px] px-3 py-1.5 rounded-full border transition-all",
                    activeOrgId === id 
                      ? "bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900 dark:border-stone-100" 
                      : "bg-white dark:bg-stone-800 text-stone-600 border-stone-200 dark:border-stone-700 hover:border-stone-400"
                  )}
                >
                  {id.slice(0, 8)}...
                </button>
              ))}
            </div>
            <p className="text-[10px] text-stone-400 italic">
              Switching organization updates your RLS scope instantly.
            </p>
          </div>
        </div>

        {/* 4. Admin Hierarchy Rules */}
        <div className="section border-t border-stone-200 dark:border-stone-800 pt-6">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Hierarchy Definitions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700">
              <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1">Clusters</p>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                Top-level administrative containers. Cluster Admins manage all Orgs within.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700">
              <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1">Organizations</p>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                Standard work environments. TeamMembership is explicit and scoped per Org.
              </p>
            </div>
          </div>
        </div>

        <div className="section border-t border-stone-200 dark:border-stone-800 pt-6">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Data & Governance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className="text-amber-500" />
                <h4 className="text-xs font-semibold uppercase tracking-tight text-stone-900 dark:text-stone-100">System Reset</h4>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-4 h-8">
                Permanently clear all operational data. This action is irreversible.
              </p>
              <button
                type="button"
                onClick={() => { void clearGlobalData(); }}
                disabled={!canManageGlobalData || isClearingGlobalData}
                className="action-btn-secondary w-full text-xs h-9 justify-center border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
              >
                {isClearingGlobalData ? 'Resetting…' : 'Reset System'}
              </button>
            </div>

            <div className="bg-stone-50/50 dark:bg-stone-900/20 border border-dashed border-stone-200 dark:border-stone-700/50 rounded-xl p-4 flex flex-col justify-between opacity-80">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-tight text-stone-400 mb-2">Bulk Export</h4>
                <p className="text-[11px] text-stone-400 italic">
                  Data export is currently restricted to reduce privacy exposure and maintain compliance integrity.
                </p>
              </div>
              <button disabled className="mt-4 w-full text-xs h-9 rounded-md border border-stone-100 dark:border-stone-800 text-stone-300 dark:text-stone-600 bg-transparent cursor-not-allowed">
                Export (Restricted)
              </button>
            </div>
          </div>
        </div>


        <LiveOperatorsTracker />

        {canViewOperatorLogs && (
          <>
          <div className="section">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-stone-900 dark:text-stone-100">Invite Tokens</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                  {accessInvites.length} active/recent
                </span>
                <button
                  type="button"
                  onClick={() => { void fetchAccessInvites(); }}
                  disabled={inviteLoading}
                  className="action-btn-secondary text-xs"
                >
                  {inviteLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            </div>
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
              Admin-only invite issuance. The token determines the target organization; the raw token is shown once and is not stored.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-[1.3fr_0.7fr_0.7fr_auto] gap-3 mb-4">
              <input
                type="text"
                placeholder="Invite label (optional)"
                className="control-input"
                value={inviteLabel}
                onChange={(e) => setInviteLabel(e.target.value)}
              />
              <input
                type="number"
                min="0"
                className="control-input"
                placeholder="Expiry days"
                value={inviteExpiryDays}
                onChange={(e) => setInviteExpiryDays(e.target.value)}
              />
              <input
                type="number"
                min="1"
                className="control-input"
                placeholder="Max uses"
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(e.target.value)}
              />
              <button
                type="button"
                onClick={() => { void createAccessInvite(); }}
                className="action-btn-primary text-xs"
              >
                Create Invite
              </button>
            </div>

            {inviteNotice && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-xs text-stone-700 dark:text-stone-200 mb-4 space-y-2">
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">{inviteNotice}</p>
                {inviteTokenValue && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-stone-500 dark:text-stone-400 w-20 shrink-0">Token:</span>
                      <span className="font-mono bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-0.5 text-stone-900 dark:text-stone-100 select-all break-all">{inviteTokenValue}</span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(inviteTokenValue);
                          setInviteTokenCopied(true);
                          window.setTimeout(() => setInviteTokenCopied(false), 1400);
                        }}
                        className="px-2 py-0.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-[11px] font-medium hover:bg-stone-100 dark:hover:bg-stone-700 shrink-0"
                      >
                        {inviteTokenCopied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="space-y-1">
                      <span className="text-stone-500 dark:text-stone-400">Share message:</span>
                      <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-3 font-mono text-[11px] leading-5 text-stone-800 dark:text-stone-100 whitespace-pre-wrap break-words">
                        {buildInviteShareMessage(inviteTokenValue)}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(buildInviteShareMessage(inviteTokenValue));
                          setInviteMessageCopied(true);
                          window.setTimeout(() => setInviteMessageCopied(false), 1400);
                        }}
                        className="px-2 py-1 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-[11px] font-medium hover:bg-stone-100 dark:hover:bg-stone-700"
                      >
                        {inviteMessageCopied ? '✓ Message Copied' : 'Copy Share Message'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <CollapsibleActivitySection
              title="Invite Tokens"
              summary={`${accessInvites.length} active/recent`}
              defaultExpanded
              maxExpandedHeightClass="max-h-[420px]"
              maxCollapsedHeightClass="max-h-[96px]"
              extraHeaderContent={
                <input
                  type="text"
                  placeholder="Search labels..."
                  value={inviteSearch}
                  onChange={e => setInviteSearch(e.target.value)}
                  className="control-input py-1 px-2 text-xs min-w-[150px]"
                />
              }
            >
              <table className="desktop-grid w-full activity-auto text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                  <tr>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Label</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Created</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Expires</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Usage</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">State</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {filteredInvites.map((invite) => {
                    const isRevoked = Boolean(invite.revoked_at);
                    const isExpired = Boolean(invite.expires_at && new Date(invite.expires_at).getTime() < Date.now());
                    const isExhausted = invite.use_count >= invite.max_uses;
                    const state = isRevoked ? 'revoked' : isExpired ? 'expired' : isExhausted ? 'used' : 'active';
                    return (
                      <tr key={invite.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 text-stone-700 dark:text-stone-300">
                        <td className="px-4 py-2.5 truncate" title={invite.label ?? '-'}>{invite.label ?? '-'}</td>
                        <td className="px-4 py-2.5 text-xs text-stone-500 dark:text-stone-400">{new Date(invite.created_at).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-xs text-stone-500 dark:text-stone-400">{invite.expires_at ? new Date(invite.expires_at).toLocaleString() : 'Never'}</td>
                        <td className="px-4 py-2.5 text-xs">{invite.use_count} / {invite.max_uses}</td>
                        <td className="px-4 py-2.5 capitalize">{state}</td>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => { void revokeAccessInvite(invite.id); }}
                            disabled={busyInviteId === invite.id || isRevoked}
                            className="px-2 py-1 rounded-md text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            {isRevoked ? 'Revoked' : busyInviteId === invite.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!inviteLoading && accessInvites.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-stone-400">No invite tokens yet.</td>
                    </tr>
                  )}
                  {inviteLoading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8">
                        <div className="mx-auto max-w-sm">
                          <LoadingLine label="Loading invite tokens…" compact />
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CollapsibleActivitySection>
          </div>

          <div className="section">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-stone-900 dark:text-stone-100">Account Requests</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                  {accessRequests.length} pending
                </span>
                <button
                  type="button"
                  onClick={() => { void fetchAccessRequests(); }}
                  disabled={requestsLoading}
                  className="action-btn-secondary text-xs"
                >
                  {requestsLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            </div>
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
              Admin-only review queue for new account requests. Approval applies the login ID, the final role you choose here, and the initial password you set here.
            </p>

            {requestsNotice && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-xs text-stone-700 dark:text-stone-200 mb-4 space-y-2">
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">{requestsNotice}</p>
                {requestsNoticeLoginValue && (
                  <div className="flex items-center gap-2">
                    <span className="text-stone-500 dark:text-stone-400 w-20 shrink-0">Login ID:</span>
                    <span className="font-mono bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-2 py-0.5 text-stone-900 dark:text-stone-100 select-all">{requestsNoticeLoginValue}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(requestsNoticeLoginValue);
                        setRequestsNoticeCopied('login');
                        window.setTimeout(() => setRequestsNoticeCopied(null), 1400);
                      }}
                      className="px-2 py-0.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-[11px] font-medium hover:bg-stone-100 dark:hover:bg-stone-700 shrink-0"
                    >
                      {requestsNoticeCopied === 'login' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-stone-400 dark:text-stone-500 pt-1">Initial passwords are entered during approval and are not shown again after submission.</p>
              </div>
            )}

            <CollapsibleActivitySection
              title="Account Requests"
              summary={`${accessRequests.length} pending`}
              defaultExpanded
              maxExpandedHeightClass="max-h-[520px]"
              maxCollapsedHeightClass="max-h-[96px]"
            >
              <table className="desktop-grid w-full activity-auto text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                  <tr>
                    <th className="px-4 py-2.5 w-[170px] text-[11px] font-semibold uppercase tracking-wide">Requested</th>
                    <th className="px-4 py-2.5 w-[220px] text-[11px] font-semibold uppercase tracking-wide">Login ID</th>
                    <th className="px-4 py-2.5 w-[120px] text-[11px] font-semibold uppercase tracking-wide">Requested</th>
                    <th className="px-4 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Approve As</th>
                    <th className="px-4 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">TeamMember ID</th>
                    <th className="px-4 py-2.5 w-[180px] text-[11px] font-semibold uppercase tracking-wide">Initial Password</th>
                    <th className="px-4 py-2.5 w-[210px] text-[11px] font-semibold uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {accessRequests.map(request => {
                    return (
                      <tr key={request.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 text-stone-700 dark:text-stone-300">
                        <td className="px-4 py-2.5 text-xs text-stone-500 dark:text-stone-400">{new Date(request.created_at).toLocaleString()}</td>
                        <td className="px-4 py-2.5 truncate" title={request.login_id}>{request.login_id}</td>
                        <td className="px-4 py-2.5 capitalize">{dbRoleToAppRole(request.requested_role)}</td>
                        <td className="px-4 py-2.5">
                          <select
                            className="w-full px-2 py-1 text-xs border border-stone-200 dark:border-stone-700 rounded bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                            value={pendingApprovedRoles[request.id] || request.requested_role}
                            onChange={(e) => setPendingApprovedRoles(prev => ({ ...prev, [request.id]: e.target.value as DbRole }))}
                          >
                            <option value="viewer">Viewer</option>
                            <option value="operator">Operator</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            placeholder="e.g. OP-001"
                            className="w-full px-2 py-1 text-xs border border-stone-200 dark:border-stone-700 rounded bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                            value={pendingTeamMemberIds[request.id] || ''}
                            onChange={(e) => setPendingTeamMemberIds(prev => ({ ...prev, [request.id]: e.target.value }))}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="password"
                            placeholder="Min 8 characters"
                            className="w-full px-2 py-1 text-xs border border-stone-200 dark:border-stone-700 rounded bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                            value={pendingPasswords[request.id] || ''}
                            onChange={(e) => setPendingPasswords(prev => ({ ...prev, [request.id]: e.target.value }))}
                            autoComplete="new-password"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => { void reviewAccessRequest(request, 'approved'); }}
                              disabled={busyRequestId === request.id}
                              className="px-2 py-1 rounded-md text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => { void reviewAccessRequest(request, 'rejected'); }}
                              disabled={busyRequestId === request.id}
                              className="px-2 py-1 rounded-md text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!requestsLoading && accessRequests.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-stone-400">No pending account requests.</td>
                    </tr>
                  )}
                  {requestsLoading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8">
                        <div className="mx-auto max-w-sm">
                          <LoadingLine label="Loading requests…" compact />
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CollapsibleActivitySection>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
