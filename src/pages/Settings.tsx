import React from 'react';
import { ShieldCheck, LogOut, CheckCircle2, AlertTriangle, Key, Globe, Settings as SettingsIcon, ChevronDown, Pencil, UserPlus, Download } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { DbRole, dbRoleToAppRole } from '../lib/roles';
import { getSupabaseAccessToken, isSupabaseConfigured, SUPABASE_ANON_KEY, supabase } from '../lib/supabase';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import LoadingLine from '../components/LoadingLine';
import CollapsibleActivitySection from '../components/CollapsibleActivitySection';
import LiveOperatorsTracker from '../components/LiveOperatorsTracker';
import IdentityBadge from '../components/IdentityBadge';
import { LABELS, getRoleLabel, sanitizeLabel } from '../lib/labels';

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
  role: 'cluster_admin' | 'cluster_operator' | 'viewer' | 'admin' | 'operator';
  type: 'cluster' | 'organization';
  org_role?: 'admin' | 'operator' | 'viewer';
  active_org_id: string | null;
  created_at: string | null;
};

type PlatformAccount = {
  user_id: string;
  email: string | null;
  active_org_id: string | null;
  active_cluster_id: string | null;
  cluster_roles: Array<{ cluster_id: string; role: string }>;
  org_roles: Array<{ org_id: string; role: string; status: string }>;
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
  const { confirm } = useConfirm();
  const { user, loading: authLoading, signOut: supabaseSignOut, updatePassword: supabaseUpdatePassword } = useAuth();
  const refreshPromiseRef = React.useRef<Promise<any> | null>(null);

  const toDisplayMessage = React.useCallback((message: string) => sanitizeLabel(message), []);
  const toDisplayError = React.useCallback((error: unknown, fallback = 'Something went wrong.') => {
    if (error instanceof Error && error.message) return sanitizeLabel(error.message);
    if (typeof error === 'string' && error.trim()) return sanitizeLabel(error);
    if (error !== null && error !== undefined) return sanitizeLabel(String(error));
    return fallback;
  }, []);

  const handleSignOutAll = async () => {
    try {
      const ok = await confirm({
        title: 'Sign out everywhere?',
        message: 'This will sign out all sessions on all your devices.',
        confirmLabel: 'Sign out',
        danger: true,
      });
      if (!ok) return;
      await supabaseSignOut({ scope: 'global' });
      notify({ type: 'success', message: 'Signed out of all devices.' });
    } catch (err: any) {
      notify({ type: 'error', message: err.message || 'Failed to sign out globally.' });
    }
  };

  const invokeSafe = React.useCallback(async <T = any>(
    functionName: string,
    body: any
  ): Promise<{ data: T | null; error: any }> => {
    // 1. Safe Session Guard
    const { data: { session } } = await supabase!.auth.getSession();
    if (!session) {
      console.warn(`[invokeSafe] No active session found for ${functionName}. Skipping to prevent 401 spam.`);
      return { data: null, error: new Error("Authentication required") };
    }

    // 2. Standardized Invoke (Explicitly inject JWT to ensure coverage)
    if (import.meta.env.DEV) {
      console.log(`[invokeSafe] Calling ${functionName} with explicit JWT...`);
    }
    return await supabase!.functions.invoke<T>(functionName, {
      body,
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-Client-Info': 'flow-ops-admin'
      }
    });
  }, []);

  
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
  const [newOrgAdminEmail, setNewOrgAdminEmail] = React.useState('');
  const [isProvisioning, setIsProvisioning] = React.useState(false);

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
  
  // Organization Identity State
  const [editOrgName, setEditOrgName] = React.useState('');
  const [editOrgTag, setEditOrgTag] = React.useState('');
  const [editOrgSlug, setEditOrgSlug] = React.useState('');
  const [isUpdatingOrgIdentity, setIsUpdatingOrgIdentity] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  
  // Platform Directory State
  const [platformAccounts, setPlatformAccounts] = React.useState<PlatformAccount[]>([]);
  const [platformDirectoryLoading, setPlatformDirectoryLoading] = React.useState(false);
  const [platformDirectorySearch, setPlatformDirectorySearch] = React.useState('');

  const isOrgAdmin = !isClusterAdmin && role === 'admin';
  const activeOrg = activeOrgId ? availableOrgs[activeOrgId] : null;
  const canEditIdentity = (isPlatformAdmin || isClusterAdmin || role === 'admin') && !!activeOrgId;

  // Sync local scopeClusterId with the global contextClusterId when it changes (e.g. after switchOrg)
  React.useEffect(() => {
    if (contextClusterId) setScopeClusterId(contextClusterId);
  }, [contextClusterId]);

  // Sync Organization Identity fields when activeOrgId changes
  React.useEffect(() => {
    if (activeOrgId && availableOrgs[activeOrgId]) {
      const org = availableOrgs[activeOrgId];
      setEditOrgName(org.name || '');
      setEditOrgTag(org.tag || '');
      setEditOrgSlug(org.slug || '');
    }
  }, [activeOrgId, availableOrgs]);

  const canManageGlobalData = canAccessAdminUi;
  const profileId = user?.id ?? '';
  const profileLookupSql = profileId
    ? `select id, org_id, meta_org_id\nfrom public.profiles\nwhere id = '${profileId}';`
    : `select id, org_id, meta_org_id\nfrom public.profiles\nwhere id = 'YOUR_AUTH_USER_ID';`;
  const orgCandidatesSql = `select distinct org_id\nfrom public.activities\nwhere org_id is not null\norder by org_id;`;
  const profileUpdateSql = profileId
    ? `update public.profiles\nset org_id = 'YOUR_ORG_UUID'\nwhere id = '${profileId}';`
    : `update public.profiles\nset org_id = 'YOUR_ORG_UUID'\nwhere id = 'YOUR_AUTH_USER_ID';`;

  const handleUpdateOrgIdentity = async () => {
    if (!activeOrgId || !supabase) return;
    await refreshAuthority();
    setIsUpdatingOrgIdentity(true);
    try {
      const { error } = await invokeSafe('manage-organizations', {
        action: 'update-organization-identity',
        org_id: activeOrgId,
        name: editOrgName,
        tag: editOrgTag,
        slug: editOrgSlug
      });
      if (error) throw error;
      notify({ type: 'success', message: 'Workspace identity updated.' });
      await refreshData();
      await refreshAuthority();
    } catch (err) {
      notify({ type: 'error', message: `Update failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setIsUpdatingOrgIdentity(false);
    }
  };

  const clearGlobalData = async () => {
    if (!canManageGlobalData) {
      notify({ type: 'error', message: 'Only admin can clear global data.' });
      return;
    }
    if (isClearingGlobalData) return;

    const ok = await confirm({
      title: 'Clear all operational data?',
      message:
        'This removes activities, entities, records, team roster and operator sessions, expenses, adjustment requests, collaboration profiles, and channel movements. This cannot be undone.',
      danger: true,
      confirmLabel: 'Clear data',
    });
    if (!ok) return;

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
          ? 'access_requests table not found. Apply supabase/migrations/00000000000000_init_canonical_schema.sql.'
          : `Unable to load access requests: ${toDisplayError(error.message)}`);
        return;
      }
      setAccessRequests((data ?? []) as AccessRequestRow[]);
    } catch (error) {
      const detailedError = toDisplayError(error, 'Transport request failed.');
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
          ? 'access_invites table not found. Apply supabase/migrations/00000000000000_init_canonical_schema.sql.'
          : `Unable to load invite tokens: ${toDisplayError(error.message)}`);
        return;
      }

      setAccessInvites((data ?? []) as AccessInviteRow[]);
    } catch (error) {
      const detailedError = toDisplayError(error, 'Transport request failed.');
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
      const { data, error } = await invokeSafe<ManageClusterAdminsResult>('manage-organizations', {
        action: 'list-cluster-admins',
        org_id: orgId,
      });

      if (error) {
        setClusterAdminsNotice(`Unable to load group managers: ${toDisplayError(error)}`);
        return;
      }

      setClusterAdmins(data?.admins ?? []);
      setManagedClusterId(data?.cluster_id ?? null);
      setClusterManagedOrgIds(data?.managed_org_ids ?? []);
    } catch (error) {
      setClusterAdminsNotice(`Transport error: ${toDisplayError(error)}`);
    } finally {
      setClusterAdminsLoading(false);
    }
  }, [activeOrgId, canAccessAdminUi]);

  const fetchPlatformDirectory = React.useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !isPlatformAdmin) return;
    setPlatformDirectoryLoading(true);
    try {
      const { data, error } = await invokeSafe<{ ok: boolean; accounts: PlatformAccount[] }>('manage-organizations', {
        action: 'list-all-accounts'
      });
      if (error) throw error;
      setPlatformAccounts(data?.accounts ?? []);
    } catch (err) {
      notify({ type: 'error', message: `Directory fetch failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setPlatformDirectoryLoading(false);
    }
  }, [isPlatformAdmin, notify]);

  React.useEffect(() => {
    if (authLoading) return; // Prevent premature calls before session is ready
    
    void fetchAccessRequests();
    void fetchAccessInvites();
    void fetchClusterAdmins();
    if (isPlatformAdmin) void fetchPlatformDirectory();
  }, [authLoading, fetchAccessInvites, fetchAccessRequests, fetchClusterAdmins, isPlatformAdmin, fetchPlatformDirectory]);

  const reviewAccessRequest = async (request: AccessRequestRow, status: 'approved' | 'rejected') => {
    if (!supabase || !user) return;
    await refreshAuthority();
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

      const { data, error } = await invokeSafe<ProvisionResult>('provision-user', {
        access_request_id: request.id,
        teamMember_id: pendingTeamMemberIds[request.id]?.trim() || undefined,
        password: initialPassword,
        approved_role: pendingApprovedRoles[request.id] || request.requested_role,
      });
      if (error) {
        const detailedError = toDisplayError(error);
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
      const detailedError = toDisplayError(error.message);
      setRequestsNotice(`Unable to update request: ${detailedError}`);
      notify({ type: 'error', message: `Unable to update request: ${detailedError}` });
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
    await refreshAuthority();

    const nextRole = pendingClusterRoles[account.user_id] || account.role;
    if (nextRole === account.role) return;

    setBusyClusterUserId(account.user_id);
    setClusterAdminsNotice(null);

    const { error } = await invokeSafe('manage-organizations', {
      action: 'set-cluster-role',
      org_id: activeOrgId,
      target_user_id: account.user_id,
      target_role: nextRole,
    });

    if (error) {
      setClusterAdminsNotice(`Update failed: ${toDisplayError(error)}`);
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
    setBusyClusterUserId(targetUserId);
    try {
      const { data, error } = await invokeSafe('manage-organizations', { 
        action: 'reset-user-password', 
        target_user_id: targetUserId 
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
    await refreshAuthority();
    const okDel = await confirm({
      title: 'Delete account?',
      message: `Delete account ${account.email ?? account.user_id}?`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!okDel) return;

    setBusyClusterUserId(account.user_id);
    const { error } = await invokeSafe('manage-organizations', {
      action: 'delete-user',
      org_id: activeOrgId,
      target_user_id: account.user_id,
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
      const detailedError = toDisplayError(error.message);
      setInviteNotice(`Unable to create invite token: ${detailedError}`);
      notify({ type: 'error', message: `Unable to create invite token: ${detailedError}` });
      return;
    }

    setInviteLabel('');
    setInviteExpiryDays('7');
    setInviteMaxUses('1');
    setInviteNotice(toDisplayMessage('Invite token created. Copy it now; the raw token is not stored.'));
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
      const detailedError = toDisplayError(error.message);
      setInviteNotice(`Unable to revoke invite token: ${detailedError}`);
      notify({ type: 'error', message: `Unable to revoke invite token: ${detailedError}` });
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
    if (isPlatformAdmin) return getRoleLabel('platform_admin');
    if (isClusterAdmin || clusterRole === 'cluster_admin') return getRoleLabel('cluster_admin');
    if (clusterRole === 'cluster_operator') return getRoleLabel('cluster_operator');
    return getRoleLabel(role);
  }, [isPlatformAdmin, isClusterAdmin, clusterRole, role]);
  const provisionOrganization = async () => {
    if (!supabase || !activeOrgId || !clusterId) return;
    const okProv = await confirm({
      title: 'Add workspace?',
      message: 'Add a new workspace to this group?',
      confirmLabel: 'Add',
    });
    if (!okProv) return;

    await refreshAuthority();
    setIsProvisioning(true);
    try {
      const { data, error } = await invokeSafe('manage-organizations', {
        action: 'provision-organization',
        org_id: activeOrgId,
        cluster_id: clusterId,
      });

      if (error) {
        notify({ type: 'error', message: `Provisioning failed: ${String(error)}` });
        return;
      }

      const newOrgId = (data as any)?.org_id;
      
      if (newOrgId && newOrgAdminEmail.trim()) {
        const { error: assignError } = await invokeSafe('manage-organizations', {
          action: 'assign-org-admin',
          org_id: newOrgId,
          target_email: newOrgAdminEmail.trim(),
          target_role: 'admin',
        });
        if (assignError) {
          console.warn('Workspace created but manager assignment failed:', assignError);
        }
      }

      notify({ type: 'success', message: 'New workspace created.' });
      setNewOrgAdminEmail('');
      await refreshAuthority();
      await refreshData();
      await fetchClusterAdmins();
      
      if (newOrgId) {
        switchOrg(newOrgId);
      }
    } catch (err) {
      notify({ type: 'error', message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setIsProvisioning(false);
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
        <div className="section-card p-5 lg:p-6 flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 border border-stone-200 dark:border-stone-700">
              <SettingsIcon size={20} className="text-stone-900 dark:text-stone-100" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                {activeOrg?.name || 'Settings'}
              </h2>
              <p className="text-xs text-stone-500 mt-0.5 font-medium uppercase tracking-wider">{roleLabel}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">

        {/* ── 4 ACTION CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* 1. Identity */}
          {canEditIdentity && (
            <div className="section-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Pencil size={15} className="text-stone-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Edit workspace</span>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Name</label>
                  <input
                    type="text"
                    className="control-input"
                    value={editOrgName}
                    onChange={e => setEditOrgName(e.target.value)}
                    placeholder="e.g. Beirut Ops"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Short tag</label>
                  <input
                    type="text"
                    className="control-input font-mono text-xs"
                    value={editOrgTag}
                    onChange={e => setEditOrgTag(e.target.value.toUpperCase())}
                    placeholder="e.g. OPS"
                  />
                </div>
              </div>
              <button
                onClick={handleUpdateOrgIdentity}
                disabled={isUpdatingOrgIdentity}
                className="action-btn-primary w-full h-9 text-xs justify-center font-bold"
              >
                {isUpdatingOrgIdentity ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

          {/* 2. Access */}
          {canViewOperatorLogs && (
            <div className="section-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus size={15} className="text-stone-400" />
                  <span className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Access</span>
                </div>
                {accessRequests.length > 0 && (
                  <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[9px] font-black uppercase tracking-tighter rounded-full border border-amber-200 dark:border-amber-800">
                    {accessRequests.length} pending
                  </span>
                )}
              </div>
              <button
                onClick={() => void createAccessInvite()}
                className="action-btn-primary w-full h-9 text-xs justify-center font-bold"
              >
                + Invite user
              </button>
              {inviteTokenValue && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 space-y-2">
                  <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">Token ready — copy now</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] bg-white dark:bg-stone-800 px-2 py-1 rounded border border-stone-100 dark:border-stone-700 select-all flex-1 truncate">{inviteTokenValue}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(inviteTokenValue); setInviteTokenCopied(true); setTimeout(() => setInviteTokenCopied(false), 2000); }}
                      className="text-[10px] font-bold text-stone-500 uppercase shrink-0"
                    >
                      {inviteTokenCopied ? '✓' : 'Copy'}
                    </button>
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(buildInviteShareMessage(inviteTokenValue)); setInviteMessageCopied(true); setTimeout(() => setInviteMessageCopied(false), 2000); }}
                    className="w-full py-1 text-[10px] font-bold uppercase text-stone-500 bg-stone-100 dark:bg-stone-800 rounded"
                  >
                    {inviteMessageCopied ? 'Copied' : 'Copy full invite message'}
                  </button>
                </div>
              )}
              {inviteNotice && !inviteTokenValue && (
                <p className="text-[10px] text-red-500">{inviteNotice}</p>
              )}
            </div>
          )}

          {/* 3. Export */}
          <div className="section-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download size={15} className="text-stone-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Export</span>
              </div>
              {lastExportMeta && (
                <span className="text-[10px] text-stone-400 font-medium">{lastExportMeta.rows} rows</span>
              )}
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed">Full workspace snapshot as JSON.</p>
            <button
              disabled={isExporting}
              onClick={() => {
                const runExport = async () => {
                  const okEx = await confirm({
                    title: 'Export workspace data?',
                    message: 'This action is audit-logged.',
                    confirmLabel: 'Export',
                  });
                  if (!okEx) return;
                  setIsExporting(true);
                  try {
                    const { data, error } = await invokeSafe('export-data', {
                      scope: exportScope,
                      dataset: exportDataset,
                      org_id: exportOrgId || activeOrgId || '',
                      cluster_id: contextClusterId || ''
                    });
                    if (error) throw error;
                    const result = data as any;
                    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `flow-ops-export-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setLastExportMeta({ rows: result.total_rows ?? 0, ts: result.exported_at ?? new Date().toISOString() });
                    notify({ type: 'success', message: `Export complete. Audit ID: ${String(result.audit_event_id ?? '').slice(0, 8)}` });
                  } catch (err) {
                    notify({ type: 'error', message: `Export failed: ${String(err)}` });
                  } finally { setIsExporting(false); }
                };
                void runExport();
              }}
              className="w-full py-2.5 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30"
            >
              {isExporting ? 'Exporting...' : 'Export data'}
            </button>
          </div>

          {/* 4. Reset */}
          {canManageGlobalData && (
            <div className="section-card p-5 space-y-4 border-red-100 dark:border-red-900/20">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-red-400" />
                <span className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Reset workspace</span>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed">Permanently purge all workspace data. Cannot be undone.</p>
              <button
                disabled={isClearingGlobalData}
                onClick={() => void clearGlobalData()}
                className="w-full h-9 rounded-xl border-2 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white dark:hover:bg-red-900 transition-all disabled:opacity-20"
              >
                {isClearingGlobalData ? 'Resetting...' : 'Reset workspace'}
              </button>
            </div>
          )}
        </div>

        {/* ── ADVANCED COLLAPSE ── */}
        <div className="border-t border-stone-200 dark:border-stone-800 pt-6">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-xs font-bold text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors uppercase tracking-widest mb-0"
          >
            <ChevronDown size={14} className={cn('transition-transform duration-200', showAdvanced && 'rotate-180')} />
            Advanced
          </button>

          {showAdvanced && (
            <div className="mt-6 space-y-6">

              {/* Password */}
              <div className="section-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Key size={16} className="text-stone-400" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Password</h3>
                </div>
                <p className="text-[11px] text-stone-500 mb-4">Update security for <span className="font-medium text-stone-900 dark:text-stone-100">{user?.email}</span></p>
                <div className="space-y-3 max-w-sm">
                  <input type="password" className="control-input py-2 text-xs" placeholder="New password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  <input type="password" className="control-input py-2 text-xs" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                  <button onClick={() => void handleUpdatePassword()} disabled={isUpdatingPassword} className="action-btn-primary w-full h-9 text-xs justify-center">
                    {isUpdatingPassword ? 'Updating...' : 'Update password'}
                  </button>
                </div>
              </div>

              {/* Account status */}
              <div className="section-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck size={16} className="text-stone-400" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Account</h3>
                </div>
                <div className="space-y-2 max-w-sm text-sm">
                  {[
                    { label: 'Identity', value: user ? 'Authenticated' : 'None', color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Role', value: roleLabel, bold: true },
                    { label: 'Status', value: backendStatus, italic: true, color: 'text-stone-400' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-stone-50/50 dark:bg-stone-800/40 px-3 py-2.5 rounded-lg border border-stone-100/50 dark:border-stone-800">
                      <span className="text-xs font-medium text-stone-500">{item.label}</span>
                      <span className={cn('text-xs', item.bold && 'font-bold uppercase tracking-tight text-stone-700 dark:text-stone-200', item.italic && 'italic', item.color || 'text-stone-700 dark:text-stone-300')}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Workspace slug */}
              {canEditIdentity && (
                <div className="section-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Globe size={16} className="text-stone-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Slug</h3>
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <label className="text-[10px] font-bold uppercase text-stone-400">ID Slug</label>
                    <input
                      type="text"
                      className="control-input font-mono text-xs"
                      value={editOrgSlug}
                      onChange={e => setEditOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                      placeholder="e.g. beirut-ops"
                    />
                    <p className="text-[9px] text-stone-400 italic">Used for URL paths and deterministic routing.</p>
                  </div>
                  <button onClick={handleUpdateOrgIdentity} disabled={isUpdatingOrgIdentity} className="mt-3 action-btn-primary h-8 px-4 text-xs">
                    {isUpdatingOrgIdentity ? 'Saving...' : 'Save slug'}
                  </button>
                </div>
              )}

              {/* Workspace switcher (admin) */}
              {(isClusterAdmin || isPlatformAdmin) && (
                <div className="section-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Globe size={16} className="text-stone-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Switch workspace</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {manageableClusters.length > 1 && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Group</label>
                        <select
                          className="w-full bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                          value={scopeClusterId || contextClusterId || ''}
                          onChange={e => setScopeClusterId(e.target.value)}
                        >
                          <option value="" disabled>Choose group...</option>
                          {manageableClusters.map(cluster => (
                            <option key={cluster.id} value={cluster.id}>{cluster.name || cluster.tag || cluster.id.slice(0, 8)}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {(() => {
                      const effectiveClusterId = scopeClusterId || contextClusterId;
                      const orgsInCluster = (effectiveClusterId && manageableOrgsByCluster[effectiveClusterId])
                        ? manageableOrgsByCluster[effectiveClusterId]
                        : Object.values(availableOrgs);
                      if (orgsInCluster.length <= 1) return null;
                      return (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Workspace</label>
                          <select
                            className="w-full bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                            value={activeOrgId || ''}
                            onChange={e => typeof switchOrg === 'function' && switchOrg(e.target.value)}
                          >
                            <option value="" disabled>Change workspace...</option>
                            {orgsInCluster.map(org => (
                              <option key={org.id} value={org.id}>{org.name || org.tag || org.id.slice(0, 8)}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                  {clusterId && (
                    <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800">
                      <label className="text-[10px] font-bold uppercase text-stone-400 tracking-wider block mb-2">Add workspace</label>
                      <div className="flex gap-2 max-w-sm">
                        <input
                          type="email"
                          placeholder="Admin email (optional)"
                          className="flex-1 text-xs font-bold bg-stone-50 dark:bg-stone-800 border-none rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                          value={newOrgAdminEmail}
                          onChange={e => setNewOrgAdminEmail(e.target.value)}
                          disabled={isProvisioning}
                        />
                        <button onClick={() => void provisionOrganization()} disabled={isProvisioning} className="action-btn-primary px-4 text-xs font-bold shrink-0">
                          {isProvisioning ? '...' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Invite settings */}
              {canViewOperatorLogs && (
                <div className="section-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Key size={16} className="text-stone-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Invite settings</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-3 max-w-sm mb-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-stone-400">Label</label>
                      <input type="text" placeholder="Q2 Ops" className="control-input py-1.5 text-xs" value={inviteLabel} onChange={e => setInviteLabel(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-stone-400">Expiry (days)</label>
                      <input type="number" className="control-input py-1.5 text-xs" value={inviteExpiryDays} onChange={e => setInviteExpiryDays(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-stone-400">Max uses</label>
                      <input type="number" className="control-input py-1.5 text-xs" value={inviteMaxUses} onChange={e => setInviteMaxUses(e.target.value)} />
                    </div>
                  </div>
                  {filteredInvites.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto app-scroll">
                      <p className="text-[10px] font-bold uppercase text-stone-400 tracking-widest">{filteredInvites.length} active tokens</p>
                      {filteredInvites.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700">
                          <div>
                            <p className="text-[10px] font-bold text-stone-700 dark:text-stone-300">{inv.label || 'Unlabeled'}</p>
                            <p className="text-[9px] text-stone-400">{inv.use_count}/{inv.max_uses} uses</p>
                          </div>
                          <button onClick={() => void revokeAccessInvite(inv.id)} disabled={busyInviteId === inv.id} className="text-[9px] font-bold text-red-400 uppercase hover:text-red-600 transition-colors">Revoke</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pending access requests */}
              {canViewOperatorLogs && accessRequests.length > 0 && (
                <div className="section-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-stone-400" />
                      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Pending requests ({accessRequests.length})</h3>
                    </div>
                    <button onClick={() => { void fetchAccessInvites(); void fetchAccessRequests(); }} className="text-[10px] font-bold uppercase text-stone-400 hover:text-stone-600 transition-colors">Refresh</button>
                  </div>
                  <div className="space-y-3">
                    {accessRequests.map(req => (
                      <div key={req.id} className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-stone-900 dark:text-stone-100">{req.login_id}</p>
                            <p className="text-[10px] text-stone-400">{getRoleLabel(req.requested_role)}</p>
                          </div>
                          <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-50 dark:bg-amber-900/10 px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-800">Pending</span>
                        </div>
                        <div className="space-y-2">
                          <input
                            type="password"
                            placeholder="Set initial password (min 8)"
                            className="control-input py-1.5 text-xs w-full"
                            value={pendingPasswords[req.id] || ''}
                            onChange={e => setPendingPasswords(prev => ({ ...prev, [req.id]: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <button onClick={() => void reviewAccessRequest(req, 'approved')} disabled={busyRequestId === req.id} className="action-btn-primary flex-1 h-8 text-xs justify-center">Approve</button>
                            <button onClick={() => void reviewAccessRequest(req, 'rejected')} disabled={busyRequestId === req.id} className="flex-1 h-8 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-bold text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">Reject</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {requestsNotice && <p className="text-[10px] text-stone-500 italic">{requestsNotice}</p>}
                  </div>
                </div>
              )}

              {/* Export config */}
              <div className="section-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Download size={16} className="text-stone-400" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Export config</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 max-w-sm">
                  {(isClusterAdmin || isPlatformAdmin) && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Level</label>
                      <div className="flex gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl">
                        {(['org', 'cluster'] as const).map(s => (
                          <button key={s} onClick={() => setExportScope(s)} className={cn('flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all', exportScope === s ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-900' : 'text-stone-400 hover:text-stone-600')}>
                            {s === 'org' ? 'Workspace' : 'Group'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Dataset</label>
                    <select value={exportDataset} onChange={e => setExportDataset(e.target.value)} className="w-full text-xs bg-stone-50 dark:bg-stone-800 border-none rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500">
                      <option value="all">Full</option>
                      <option value="entities">Entities</option>
                      <option value="activities">Activities</option>
                      <option value="audit_events">Audit trail</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Sessions */}
              <div className="section-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <LogOut size={16} className="text-stone-400" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Sessions</h3>
                </div>
                <p className="text-[11px] text-stone-500 mb-4">Sign out of all active sessions across all devices.</p>
                <button
                  onClick={() => void handleSignOutAll()}
                  className="h-10 px-6 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[11px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  <LogOut size={14} />
                  Sign out all devices
                </button>
              </div>

              {/* System Directory (platform admin only) */}
              {isPlatformAdmin && (
                <div className="section-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Globe size={16} className="text-emerald-500" />
                      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Directory</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Search users..."
                        className="text-[11px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-emerald-500 w-48"
                        value={platformDirectorySearch}
                        onChange={e => setPlatformDirectorySearch(e.target.value)}
                      />
                      <button onClick={() => void fetchPlatformDirectory()} className="text-[10px] font-bold text-stone-400 uppercase hover:text-stone-600 transition-colors">Refresh</button>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-stone-50/50 dark:bg-stone-800/30 border-b border-stone-100 dark:border-stone-800">
                            <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400">Email</th>
                            <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400">Roles</th>
                            <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                          {platformDirectoryLoading ? (
                            <tr>
                              <td colSpan={3} className="px-5 py-8">
                                <LoadingLine label="Loading..." compact />
                              </td>
                            </tr>
                          ) : platformAccounts
                              .filter(acc => !platformDirectorySearch || acc.email?.toLowerCase().includes(platformDirectorySearch.toLowerCase()))
                              .map(acc => (
                            <tr key={acc.user_id} className="group hover:bg-stone-50/50 dark:hover:bg-stone-800/20 transition-colors">
                              <td className="px-5 py-3">
                                <p className="text-xs font-bold text-stone-900 dark:text-stone-100">{acc.email || 'unset'}</p>
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {acc.cluster_roles.map((cr, i) => (
                                    <span key={i} className="text-[9px] font-black uppercase bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/20">{cr.role.replace('_', ' ')}</span>
                                  ))}
                                  {acc.org_roles.map((om, i) => (
                                    <span key={i} className="text-[9px] font-black uppercase bg-violet-50 dark:bg-violet-900/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded border border-violet-100 dark:border-violet-900/20">{om.role}</span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => { if (acc.email) setNewOrgAdminEmail(acc.email); }}
                                    className="text-[10px] font-bold text-emerald-600 uppercase hover:underline"
                                  >
                                    Assign
                                  </button>
                                  <button
                                    onClick={() => {
                                      void (async () => {
                                        if (acc.user_id === user?.id) { notify({ type: 'error', message: 'You cannot reset your own password from here.' }); return; }
                                        const okReset = await confirm({
                                          title: 'Reset password?',
                                          message: `Send reset email to ${acc.email}?`,
                                          confirmLabel: 'Send',
                                        });
                                        if (okReset) void resetUserPassword(acc.user_id);
                                      })();
                                    }}
                                    className="text-[10px] font-bold text-stone-400 uppercase hover:text-stone-600 transition-colors"
                                  >
                                    Reset
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Group Administration (cluster admin only) */}
              {(isClusterAdmin || isPlatformAdmin) && (
                <div className="section-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck size={16} className="text-stone-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100">Group managers</h3>
                  </div>
                  <div className="mb-3">
                    <input
                      type="text"
                      placeholder="Filter managers..."
                      className="w-full text-[11px] bg-stone-50 dark:bg-stone-800 border-none rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-emerald-500"
                      value={clusterSearch}
                      onChange={e => setClusterSearch(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto app-scroll">
                    {clusterAdminsLoading ? (
                      <LoadingLine label="Loading managers..." compact />
                    ) : filteredClusterAdmins.length === 0 ? (
                      <p className="text-[11px] text-stone-400 italic text-center py-6">No results.</p>
                    ) : filteredClusterAdmins.map(admin => {
                      const isSelf = admin.user_id === user?.id;
                      return (
                        <div key={admin.user_id} className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-700 flex items-center justify-between group gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">{admin.email} {isSelf && '(You)'}</p>
                            <p className="text-[9px] font-bold uppercase tracking-tighter text-stone-400 mt-0.5">
                              {admin.type === 'cluster' ? `Group ${admin.role.replace('_', ' ')}` : `Workspace ${admin.role}`}
                            </p>
                          </div>
                          {!isSelf && admin.type === 'cluster' && (
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <select
                                className="text-[10px] bg-white dark:bg-stone-900 border-stone-200 rounded px-1 py-0.5 outline-none font-bold text-stone-600"
                                value={pendingClusterRoles[admin.user_id] || admin.role}
                                onChange={e => setPendingClusterRoles(prev => ({ ...prev, [admin.user_id]: e.target.value as any }))}
                              >
                                <option value="cluster_admin">Admin</option>
                                <option value="cluster_operator">Operator</option>
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
              )}

            </div>
          )}
        </div>

        <LiveOperatorsTracker />
      </div>
    </div>
  );
}
