import React from 'react';
import { ShieldCheck, LogOut, CheckCircle2, AlertTriangle, Key, Globe } from 'lucide-react';
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
import IdentityBadge from '../components/IdentityBadge';

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
    availableOrgs,
    switchOrg,
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
  const bootstrapClusterAdmin = async () => {
    if (!supabase) {
      notify({ type: 'error', message: 'Not ready: client not initialized.' });
      return;
    }
    if (!window.confirm('Bootstrap a new cluster and make yourself cluster admin? This is a one-time operation.')) return;
    const accessToken = await getSupabaseAccessToken();
    if (!accessToken) { notify({ type: 'error', message: 'Unable to get access token. Please sign in.' }); return; }
    const { data, error } = await supabase.functions.invoke('manage-organizations', {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
      body: { action: 'bootstrap-cluster-admin' },
    });
    if (error) { notify({ type: 'error', message: `Bootstrap failed: ${String(error)}` }); return; }
    notify({ type: 'success', message: (data as any)?.message ?? 'Cluster bootstrapped! Reload to activate your new cluster.' });
    await refreshData();
    await fetchClusterAdmins();
  };
  // NOTE: these are wired to real state below after useState declarations
  // clusterId and managedOrgIds are declared after the useState block
  const { 
    role, 
    clusterRole, 
    isClusterAdmin, 
    isPlatformAdmin,
    canAccessAdminUi, 
    clusterId: contextClusterId, 
    refreshAuthority, 
    manageableClusters, 
    manageableOrgsByCluster 
  } = useAppRole();

  const { notify } = useNotification();
  const { user, updatePassword: supabaseUpdatePassword } = useAuth();
  
  // Password Management State
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false);

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

  // Wire real state to the variables used in JSX
  const clusterId = managedClusterId || contextClusterId;
  const managedOrgIds = clusterManagedOrgIds;
  const [clusterAdminsLoading, setClusterAdminsLoading] = React.useState(false);
  const [clusterAdminsNotice, setClusterAdminsNotice] = React.useState<string | null>(null);
  const [pendingClusterRoles, setPendingClusterRoles] = React.useState<Record<string, 'cluster_admin' | 'cluster_operator'>>({});
  const [busyClusterUserId, setBusyClusterUserId] = React.useState<string | null>(null);
  const [clusterSearch, setClusterSearch] = React.useState('');
  const [scopeClusterId, setScopeClusterId] = React.useState<string | null>(null);
  // Bulk Export state
  const [exportScope, setExportScope] = React.useState<'cluster' | 'org'>('org');
  const [exportOrgId, setExportOrgId] = React.useState<string>('');
  const [exportClusterId, setExportClusterId] = React.useState<string>('');
  const [exportDataset, setExportDataset] = React.useState<string>('all');
  const [isExporting, setIsExporting] = React.useState(false);
  const [lastExportMeta, setLastExportMeta] = React.useState<{ rows: number; ts: string } | null>(null);
  const isOrgAdmin = !isClusterAdmin && role === 'admin';

  // Sync local scopeClusterId with the global contextClusterId when it changes (e.g. after switchOrg)
  React.useEffect(() => {
    if (contextClusterId) setScopeClusterId(contextClusterId);
  }, [contextClusterId]);

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
    if (!isSupabaseConfigured || !supabase || !canAccessAdminUi) return;

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

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      notify({ type: 'error', message: 'All fields are required.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      notify({ type: 'error', message: 'Passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      notify({ type: 'error', message: 'Password must be at least 8 characters.' });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await supabaseUpdatePassword(newPassword);
      notify({ type: 'success', message: 'Password updated successfully.' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      notify({ type: 'error', message: `Update failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const resetUserPassword = async (targetUserId: string) => {
    if (!window.confirm('Send password reset email to this user?')) return;
    setBusyClusterUserId(targetUserId);
    try {
      const accessToken = await getSupabaseAccessToken();
      const { data, error } = await supabase!.functions.invoke('manage-organizations', {
        headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
        body: { action: 'reset-user-password', target_user_id: targetUserId },
      });
      if (error) throw error;
      notify({ type: 'success', message: (data as any)?.message || 'Reset email sent.' });
    } catch (err) {
      notify({ type: 'error', message: `Reset failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusyClusterUserId(null);
    }
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
    // Priority: Platforms Admin > Cluster Admin > Org Admin
    if (isPlatformAdmin) return 'Platform Admin';
    if (isClusterAdmin || clusterRole === 'cluster_admin') return 'Cluster Admin';
    if (clusterRole === 'cluster_operator') return 'Cluster Operator';
    if (role === 'admin') return 'Org Admin';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }, [isPlatformAdmin, isClusterAdmin, clusterRole, role]);


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
    // Refresh authority so managedOrgIds updates → availableOrgs re-fetches → switcher shows new org
    await refreshAuthority();
    await refreshData();
    await fetchClusterAdmins();
    // Auto-switch into the newly provisioned org if returned
    if ((data as any)?.org_id) {
      switchOrg((data as any).org_id);
    }
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

      <div className="space-y-8">
        {/* SECTION 1: PERSONAL ACCOUNT */}
        <div className="section">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={20} className="text-stone-400" />
            <h3 className="font-semibold text-base text-stone-900 dark:text-stone-100">Personal Account</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Authority Resolution</p>
              <div className="space-y-2 text-sm text-stone-700 dark:text-stone-300">
                <p className="flex justify-between items-center bg-stone-50 dark:bg-stone-800/50 p-2 rounded-lg">
                  <span className="font-medium text-stone-500">Auth:</span> 
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{user ? 'Authenticated' : 'None'}</span>
                </p>
                <p className="flex justify-between items-center bg-stone-50 dark:bg-stone-800/50 p-2 rounded-lg">
                  <span className="font-medium text-stone-500">Role:</span> 
                  <span className="font-bold uppercase tracking-tight text-stone-700 dark:text-stone-200">{roleLabel}</span>
                </p>
                <p className="flex justify-between items-center bg-stone-50 dark:bg-stone-800/50 p-2 rounded-lg">
                  <span className="font-medium text-stone-500">Backend:</span> 
                  <span className="italic text-stone-400">{backendStatus}</span>
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Key size={16} className="text-stone-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Security Credentials</span>
              </div>
              <p className="text-[11px] text-stone-500 mb-3 px-1 leading-relaxed">
                Update the security credentials for your current logged-in identity (<span className="text-stone-900 dark:text-stone-100 font-medium">{user?.email}</span>).
              </p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-stone-400">New Password</label>
                  <input 
                    type="password" 
                    className="w-full bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Min 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-stone-400">Confirm Password</label>
                  <input 
                    type="password" 
                    className="w-full bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => void handleUpdatePassword()}
                  disabled={isUpdatingPassword}
                  className="w-full py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: ACTIVE SCOPE & CONTEXT */}
        <div className="section border-t border-stone-200 dark:border-stone-800 pt-8">
          <div className="flex items-center gap-2 mb-6">
            <Globe size={20} className="text-stone-400" />
            <h3 className="font-semibold text-base text-stone-900 dark:text-stone-100">Hierarchy & Context</h3>
          </div>
          
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-sm">
            {/* Header / Active Identity */}
            <div className="p-5 border-b border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30 flex items-center justify-between">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-2">Administrative Context</h4>
                <div className="flex items-center gap-3">
                  {contextClusterId ? (
                    <IdentityBadge
                      type="cluster"
                      size="sm"
                      id={contextClusterId}
                      name={manageableClusters.find(c => c.id === contextClusterId)?.name || undefined}
                      tag={manageableClusters.find(c => c.id === contextClusterId)?.tag || undefined}
                    />
                  ) : null}
                  
                  {contextClusterId && activeOrgId && <span className="text-stone-300 dark:text-stone-700">/</span>}
                  
                  {activeOrgId ? (
                    <IdentityBadge
                      type="org"
                      size="sm"
                      id={activeOrgId}
                      name={availableOrgs[activeOrgId]?.name}
                      slug={availableOrgs[activeOrgId]?.slug}
                      tag={availableOrgs[activeOrgId]?.tag}
                    />
                  ) : (!contextClusterId && !activeOrgId) ? (
                    <span className="text-xs font-bold text-stone-400 italic">No Active Context Resolved</span>
                  ) : null}
                </div>
              </div>
              <div className="text-right">
                <span className={cn(
                  "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                  isPlatformAdmin 
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800" 
                    : "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700"
                )}>
                  {isPlatformAdmin ? 'Platform Scope' : isClusterAdmin ? 'Cluster Scope' : 'Org Scope'}
                </span>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Selector 1: Cluster */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">1. Target Cluster Selection</label>
                {(!isClusterAdmin && !isPlatformAdmin) ? (
                  <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 text-[11px] text-stone-500 italic">
                    Cluster switching restricted for Organization members.
                  </div>
                ) : manageableClusters.length <= 1 ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700">
                    <IdentityBadge
                      type="cluster"
                      size="sm"
                      id={manageableClusters[0]?.id || ''}
                      name={manageableClusters[0]?.name || 'Current Cluster'}
                      tag={manageableClusters[0]?.tag || 'N/A'}
                    />
                    <span className="text-[10px] font-bold text-stone-400 uppercase ml-auto">Fixed Context</span>
                  </div>
                ) : (
                  <select 
                    className="w-full bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                    value={scopeClusterId || contextClusterId || ''}
                    onChange={(e) => setScopeClusterId(e.target.value)}
                  >
                    <option value="" disabled>Choose a cluster...</option>
                    {manageableClusters.map(cluster => (
                      <option key={cluster.id} value={cluster.id}>{cluster.tag || cluster.name} ({cluster.slug})</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Selector 2: Organization */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">2. Operational Organization</label>
                {(() => {
                  const effectiveClusterId = scopeClusterId || contextClusterId;
                  const orgsInCluster = (effectiveClusterId && manageableOrgsByCluster[effectiveClusterId]) 
                    ? manageableOrgsByCluster[effectiveClusterId] 
                    : Object.values(availableOrgs);

                  if (orgsInCluster.length === 0) {
                    return (
                      <div className="p-3 rounded-xl border border-stone-100 dark:border-stone-800 bg-stone-50/30 dark:bg-stone-800/20 flex items-center gap-3">
                        <AlertTriangle size={14} className="text-stone-400" />
                        <span className="text-[11px] text-stone-500 italic">
                          {isPlatformAdmin ? "Select a cluster to browse organizations." : "No organizations assigned to this account."}
                        </span>
                      </div>
                    );
                  }

                  if (orgsInCluster.length === 1 && !isPlatformAdmin) {
                    const fixedOrg = orgsInCluster[0];
                    return (
                      <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 flex items-center justify-between">
                        <IdentityBadge
                          type="org"
                          size="sm"
                          id={fixedOrg.id}
                          name={fixedOrg.name || undefined}
                          tag={fixedOrg.tag || undefined}
                        />
                        <span className="text-[9px] font-black uppercase tracking-widest text-stone-400 px-2 py-0.5 bg-white dark:bg-stone-900 rounded-lg shadow-sm">Fixed Context</span>
                      </div>
                    );
                  }

                  return (
                    <select 
                      className="w-full bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500 shadow-sm transition-all outline-none"
                      value={activeOrgId || ''}
                      onChange={(e) => typeof switchOrg === 'function' && switchOrg(e.target.value)}
                    >
                      <option value="" disabled>{activeOrgId ? 'Change organization...' : 'Select organization...'}</option>
                      {orgsInCluster.map(org => (
                        <option key={org.id} value={org.id}>{org.name} ({org.tag || org.slug || org.id.slice(0, 4)})</option>
                      ))}
                    </select>
                  );
                })()}
              </div>
            </div>

            <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex flex-wrap gap-4">
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 flex-1 min-w-[200px]">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Architecture Note</p>
                <p className="text-[11px] text-stone-500 leading-relaxed italic">
                  Deterministic cluster-level authority grants access to all organizations within the selected scope. Switching updates RLS context instantly.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 flex-1 min-w-[200px]">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Human Identity</p>
                <p className="text-[11px] text-stone-500 leading-relaxed italic">
                  Context is resolved using canonical Tags (e.g. BEI-OPS) and Slugs (beirut-ops) for operational clarity.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: ADMINISTRATION (Invites & Requests) */}
        {canViewOperatorLogs && (
          <div className="section border-t border-stone-200 dark:border-stone-800 pt-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-stone-400" />
                <h3 className="font-semibold text-base text-stone-900 dark:text-stone-100">Access Administration</h3>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { void fetchAccessInvites(); void fetchAccessRequests(); }}
                  disabled={inviteLoading || requestsLoading}
                  className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-[11px] font-bold uppercase tracking-wider text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-900 transition-all"
                >
                  {(inviteLoading || requestsLoading) ? 'Syncing...' : 'Refresh Queue'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Invites Card */}
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-5 border-b border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100 mb-1">Invite Issuance</h4>
                  <p className="text-[11px] text-stone-500">Generate secure, multi-use invite tokens for the current organization.</p>
                </div>
                <div className="p-5 space-y-4 flex-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-stone-400">Token Label</label>
                      <input type="text" placeholder="e.g. Q2 Operations" className="control-input py-1.5" value={inviteLabel} onChange={e => setInviteLabel(e.target.value)} />
                    </div>
                    <div className="flex gap-3">
                      <div className="space-y-1 flex-1">
                        <label className="text-[10px] font-bold uppercase text-stone-400">Expiry (Days)</label>
                        <input type="number" className="control-input py-1.5" value={inviteExpiryDays} onChange={e => setInviteExpiryDays(e.target.value)} />
                      </div>
                      <div className="space-y-1 flex-1">
                        <label className="text-[10px] font-bold uppercase text-stone-400">Max Uses</label>
                        <input type="number" className="control-input py-1.5" value={inviteMaxUses} onChange={e => setInviteMaxUses(e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <button onClick={() => void createAccessInvite()} className="action-btn-primary w-full h-9 text-xs justify-center font-bold">Create Token</button>
                  
                  {inviteNotice && (
                    <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 space-y-3">
                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">{inviteNotice}</p>
                      {inviteTokenValue && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] bg-white dark:bg-stone-800 px-2 py-1 rounded border border-stone-100 dark:border-stone-700 select-all flex-1 truncate">{inviteTokenValue}</span>
                            <button onClick={() => { navigator.clipboard.writeText(inviteTokenValue); setInviteTokenCopied(true); setTimeout(() => setInviteTokenCopied(false), 2000); }} className="text-[10px] font-bold text-stone-500 uppercase">{inviteTokenCopied ? 'Copied' : 'Copy'}</button>
                          </div>
                          <button onClick={() => { navigator.clipboard.writeText(buildInviteShareMessage(inviteTokenValue)); setInviteMessageCopied(true); setTimeout(() => setInviteMessageCopied(false), 2000); }} className="w-full py-1 text-[10px] font-bold uppercase tracking-tighter text-stone-500 bg-stone-100 dark:bg-stone-800 rounded">
                            {inviteMessageCopied ? 'Share Message Copied' : 'Copy Full Invite Message'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Requests Card */}
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="p-5 border-b border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100 mb-1">Account Review</h4>
                  <p className="text-[11px] text-stone-500">Evaluate and approve pending access requests from the portal.</p>
                </div>
                <div className="p-5 flex-1 flex flex-col items-center justify-center min-h-[140px]">
                  {accessRequests.length > 0 ? (
                    <div className="text-center">
                      <p className="text-2xl font-light text-stone-900 dark:text-stone-100">{accessRequests.length}</p>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Pending Review</p>
                      <p className="text-[10px] text-stone-500 mt-2 italic">Scroll down to the unified queue below for actions.</p>
                    </div>
                  ) : (
                    <div className="text-center opacity-40">
                      <CheckCircle2 size={32} className="mx-auto text-stone-300 mb-2" />
                      <p className="text-xs text-stone-500 font-medium">Clear Queue</p>
                      <p className="text-[10px] text-stone-400 mt-1">No pending account requests.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: CLUSTER MANAGEMENT (Cluster Admin Only) */}
        {(isClusterAdmin || isPlatformAdmin) && (
          <div className="section border-t border-stone-200 dark:border-stone-800 pt-8">
            <div className="flex items-center gap-2 mb-6">
              <ShieldCheck size={20} className="text-stone-400" />
              <h3 className="font-semibold text-base text-stone-900 dark:text-stone-100">Cluster Administration</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Cluster Members Card */}
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-5 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between bg-stone-50/50 dark:bg-stone-800/30">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100 mb-1">Administrative Hierarchy</h4>
                    <p className="text-[11px] text-stone-500">Manage high-privilege cluster accounts and system roles.</p>
                  </div>
                </div>
                <div className="p-5">
                  <div className="mb-4">
                    <input type="text" placeholder="Filter admins..." className="w-full text-[11px] bg-stone-50 dark:bg-stone-800 border-none rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500" value={clusterSearch} onChange={e => setClusterSearch(e.target.value)} />
                  </div>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 app-scroll">
                    {clusterAdminsLoading ? (
                      <LoadingLine label="Fetching hierarchy..." compact />
                    ) : filteredClusterAdmins.length === 0 ? (
                      <p className="text-[11px] text-stone-400 italic text-center py-8">No results in this scope.</p>
                    ) : filteredClusterAdmins.map(admin => {
                      const isSelf = admin.user_id === user?.id;
                      const isLastAdmin = admin.role === 'cluster_admin' && clusterAdmins.filter(a => a.role === 'cluster_admin').length === 1;
                      return (
                        <div key={admin.user_id} className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700/50 flex items-center justify-between group">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">{admin.email} {isSelf && '(You)'}</p>
                            <span className="text-[9px] font-black uppercase tracking-tighter text-emerald-600 dark:text-emerald-400">{admin.role.replace('_', ' ')}</span>
                          </div>
                          {!isSelf && (
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <select 
                                className="text-[10px] bg-white dark:bg-stone-900 border-stone-200 rounded px-1 py-0.5 outline-none font-bold text-stone-600"
                                value={pendingClusterRoles[admin.user_id] || admin.role}
                                onChange={(e) => setPendingClusterRoles(prev => ({ ...prev, [admin.user_id]: e.target.value as any }))}
                              >
                                <option value="cluster_admin">Admin</option>
                                <option value="cluster_operator">Operator</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button onClick={() => updateClusterAccountRole(admin)} className="text-[10px] font-bold text-emerald-600 uppercase">Save</button>
                            </div>
                          )}
                          {isSelf && <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Fixed</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Provisioning Card */}
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-5 border-b border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30 font-bold">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100 mb-1">Deterministic Provisioning</h4>
                  <p className="text-[11px] text-stone-500">Deploy new work environments within this cluster hierarchy.</p>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed italic">
                    All provisioned organizations use deterministic UUID mapping to ensure secondary systems and edge functions recognize the new context without manual configuration.
                  </p>
                  <div className="flex flex-col gap-2">
                    {clusterId ? (
                      <button onClick={() => void provisionOrganization()} className="action-btn-primary w-full h-10 text-xs justify-center font-bold">
                        Add Organization to Cluster
                      </button>
                    ) : (
                      <button onClick={() => void bootstrapClusterAdmin()} className="w-full h-10 rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-bold uppercase tracking-widest hover:bg-amber-100 transition-colors">
                        Self-Bootstrap Cluster
                      </button>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 space-y-1">
                    <p className="text-[10px] font-bold text-stone-400 uppercase">Current Auth Cluster</p>
                    <p className="font-mono text-[11px] text-stone-600 truncate">{contextClusterId || 'No Cluster context'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 5: OPERATIONS (Bulk Export) */}
        <div className="section border-t border-stone-200 dark:border-stone-800 pt-8">
          <div className="flex items-center gap-2 mb-6">
            <LogOut size={20} className="rotate-180 text-stone-400" />
            <h3 className="font-semibold text-base text-stone-900 dark:text-stone-100">Governance & Export</h3>
          </div>

          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-sm max-w-2xl overflow-hidden">
            <div className="p-5 border-b border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Governed Bulk Export</h4>
                {lastExportMeta && <span className="text-[10px] font-bold text-stone-400">LAST: {lastExportMeta.rows} ROWS</span>}
              </div>
              <p className="text-[11px] text-stone-500">Atomic snapshots with full audit transparency. Sensitive fields are redacted at the Edge.</p>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Export Scope</label>
                    {(isClusterAdmin || isPlatformAdmin) ? (
                      <div className="flex gap-1 bg-stone-50 dark:bg-stone-800 p-1 rounded-lg">
                        <button onClick={() => setExportScope('cluster')} className={cn("flex-1 py-1.5 text-[10px] font-bold uppercase tracking-tighter rounded transition-all", exportScope === 'cluster' ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-sm" : "text-stone-500")}>Entire Cluster</button>
                        <button onClick={() => setExportScope('org')} className={cn("flex-1 py-1.5 text-[10px] font-bold uppercase tracking-tighter rounded transition-all", (exportScope === 'org' || (!isClusterAdmin && !isPlatformAdmin)) ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-sm" : "text-stone-500")}>Organization</button>
                      </div>
                    ) : (
                      <div className="py-2.5 px-4 bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-100 dark:border-stone-700">
                        <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Fixed: Organization</span>
                      </div>
                    )}
                  </div>
                  
                  {isPlatformAdmin && exportScope === 'cluster' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Target Cluster</label>
                      <select 
                        value={exportClusterId || contextClusterId || ''} 
                        onChange={e => setExportClusterId(e.target.value)} 
                        className="w-full text-xs font-bold bg-stone-50 dark:bg-stone-800 border-none rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {manageableClusters.map(c => <option key={c.id} value={c.id}>{c.tag || c.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Dataset Selection</label>
                    <select value={exportDataset} onChange={e => setExportDataset(e.target.value)} className="w-full text-xs font-medium bg-stone-50 dark:bg-stone-800 border-none rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500">
                      <option value="all">Full Operational State</option>
                      <option value="entities">Entities & Meta</option>
                      <option value="activities">Activity Feeds</option>
                      <option value="audit_events">Audit Trail</option>
                    </select>
                  </div>
                </div>

                <div className="bg-stone-50 dark:bg-stone-800/50 rounded-xl p-4 border border-stone-100 dark:border-stone-700 flex flex-col justify-center gap-2">
                  <div className="flex items-center gap-2 text-stone-400">
                    <Globe size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Resolution Preview</span>
                  </div>
                  <div className="space-y-1.5 mt-1">
                    <p className="text-[10px] flex justify-between font-medium">
                      <span>Target:</span> 
                      <span className="text-stone-900 dark:text-stone-100 font-bold">
                        {exportScope === 'cluster' 
                          ? (manageableClusters.find(c => c.id === (exportClusterId || contextClusterId))?.tag || 'Entire Cluster')
                          : (Object.values(availableOrgs).find(o => o.id === (exportOrgId || activeOrgId))?.name || 'Selected Org')}
                      </span>
                    </p>
                    <p className="text-[10px] flex justify-between font-medium"><span>Auth:</span> <span className="text-emerald-600 uppercase font-black tracking-tighter">{roleLabel} Verified</span></p>
                    <p className="text-[10px] flex justify-between font-medium"><span>Redaction:</span> <span className="text-stone-500 italic">Enabled</span></p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => {
                  const runExport = async () => {
                    if (!window.confirm(`Initiate ${exportScope} export? This action is audit-logged.`)) return;
                    setIsExporting(true);
                    try {
                      const accessToken = await getSupabaseAccessToken();
                      if (!accessToken) throw new Error('Session expired.');
                      const { data, error } = await supabase!.functions.invoke('export-data', {
                        headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
                        body: { scope: exportScope, dataset: exportDataset, org_id: exportOrgId || activeOrgId || '', cluster_id: contextClusterId || '' },
                      });
                      if (error) throw error;
                      const result = data as any;
                      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `flow-ops-${exportScope}-${exportDataset}-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      setLastExportMeta({ rows: result.total_rows ?? 0, ts: result.exported_at ?? new Date().toISOString() });
                      notify({ type: 'success', message: `Export complete. Audit trail ID: ${result.audit_event_id.slice(0, 8)}` });
                    } catch (err) {
                      notify({ type: 'error', message: `Export failed: ${String(err)}` });
                    } finally { setIsExporting(false); }
                  };
                  void runExport();
                }}
                disabled={isExporting} 
                className="w-full py-2.5 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30"
              >
                {isExporting ? 'Packaging Data...' : 'Generate Governed Export'}
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 6: DANGER ZONE */}
        <div className="section border-t-4 border-red-500/10 pt-12">
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle size={20} className="text-red-500" />
            <h3 className="font-semibold text-base text-red-600 dark:text-red-400">Danger Zone</h3>
          </div>

          <div className="bg-red-50/30 dark:bg-red-950/10 border-2 border-red-100 dark:border-red-900/20 rounded-2xl p-6 max-w-2xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-md">
                <h4 className="text-xs font-bold uppercase tracking-widest text-red-700 dark:text-red-400 mb-1">Irreversible System Reset</h4>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                  Executing a reset permanently purges all operational data, entities, and activity histories for the current organization. This action cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { void clearGlobalData(); }}
                disabled={!canManageGlobalData || isClearingGlobalData}
                className="h-10 px-6 bg-white dark:bg-stone-900 border-2 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] hover:bg-red-600 hover:text-white dark:hover:bg-red-900 hover:border-red-600 transition-all disabled:opacity-20 flex-shrink-0"
              >
                {isClearingGlobalData ? 'Purging...' : 'Execute Reset'}
              </button>
            </div>
          </div>
        </div>


        <LiveOperatorsTracker />
      </div>
    </div>
  );
}
