import React from 'react';
import { useLocation } from 'react-router-dom';
import { LogOut, ChevronDown } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { DbRole, dbRoleToAppRole } from '../lib/roles';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabaseAccessToken, isSupabaseConfigured, SUPABASE_ANON_KEY, supabase } from '../lib/supabase';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import LoadingLine from '../components/LoadingLine';
import LiveOperatorsTracker from '../components/LiveOperatorsTracker';
import { LABELS, getRoleLabel, sanitizeLabel } from '../lib/labels';
import { SETTINGS_PASSWORD_HASH } from '../lib/settingsDeepLinks';

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
    activeOrgId,
    entities: rawEntities,
    activities: rawActivities,
    records: rawRecords,
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
    canAccessAdminUi, 
    clusterId: contextClusterId, 
    refreshAuthority, 
    manageableClusters, 
    manageableOrgsByCluster,
    managedOrgIds: authorityManagedOrgIds,
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
    // 1. Safe Session Guard — refresh first to avoid stale JWTs
    const { data: { session: freshSession }, error: refreshErr } = await supabase!.auth.refreshSession();
    const session = freshSession;
    if (refreshErr || !session) {
      console.warn(`[invokeSafe] No active session for ${functionName}:`, refreshErr?.message ?? 'null session');
      return { data: null, error: new Error("Authentication required") };
    }

    // 2. Standardized Invoke (Explicitly inject JWT to ensure coverage)
    if (import.meta.env.DEV) {
      console.log(`[invokeSafe] Calling ${functionName} with explicit JWT...`);
    }
    const result = await supabase!.functions.invoke<T>(functionName, {
      body,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'X-Client-Info': 'flow-ops-admin',
      },
    });
    if (result.error) {
      let message = result.error.message;
      const res = result.response;
      if (result.error instanceof FunctionsHttpError && res) {
        try {
          const ct = res.headers.get('content-type') ?? '';
          if (ct.includes('application/json')) {
            const body = (await res.clone().json()) as { error?: string; message?: string; details?: string };
            message = body.error || body.message || body.details || message;
          }
        } catch {
          /* keep generic message */
        }
      }
      return { data: null, error: new Error(message) };
    }
    return result;
  }, []);

  
  // Password Management State
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false);

  /** Workspace admin UI: invites, access requests, default invites — not “view logs” literally. */
  const canManageWorkspaceAccess = canAccessAdminUi;
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
  /** Optional `organization_memberships.display_name` when approving access. */
  const [pendingProvisionDisplayNames, setPendingProvisionDisplayNames] = React.useState<Record<string, string>>({});
  const [pendingPasswords, setPendingPasswords] = React.useState<Record<string, string>>({});
  const [pendingApprovedRoles, setPendingApprovedRoles] = React.useState<Record<string, DbRole>>({});
  const [clusterAdmins, setClusterAdmins] = React.useState<ManagedClusterAccount[]>([]);
  const [managedClusterId, setManagedClusterId] = React.useState<string | null>(null);
  const [newOrgAdminEmail, setNewOrgAdminEmail] = React.useState('');
  const [grantAccessEmail, setGrantAccessEmail] = React.useState('');
  const [grantAccessRole, setGrantAccessRole] = React.useState<'admin' | 'operator' | 'viewer'>('operator');
  const [grantAccessOrgId, setGrantAccessOrgId] = React.useState('');
  const [grantAccessBusy, setGrantAccessBusy] = React.useState(false);

  React.useEffect(() => {
    if (activeOrgId) setGrantAccessOrgId(activeOrgId);
  }, [activeOrgId]);
  const [isProvisioning, setIsProvisioning] = React.useState(false);

  // Wire real state to the variables used in JSX
  const clusterId = managedClusterId || contextClusterId;
  const [clusterAdminsLoading, setClusterAdminsLoading] = React.useState(false);
  const [clusterAdminsNotice, setClusterAdminsNotice] = React.useState<string | null>(null);
  const [pendingClusterRoles, setPendingClusterRoles] = React.useState<Record<string, 'cluster_admin' | 'cluster_operator'>>({});
  const [busyClusterUserId, setBusyClusterUserId] = React.useState<string | null>(null);
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
  const location = useLocation();

  React.useEffect(() => {
    if (embedded) return;
    if (location.hash === SETTINGS_PASSWORD_HASH) setShowAdvanced(true);
  }, [embedded, location.hash, location.pathname]);

  React.useEffect(() => {
    if (embedded || location.hash !== SETTINGS_PASSWORD_HASH || !showAdvanced) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('settings-password')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [embedded, location.hash, location.pathname, showAdvanced]);

  // Platform Directory State
  const [platformAccounts, setPlatformAccounts] = React.useState<PlatformAccount[]>([]);
  const [platformDirectoryLoading, setPlatformDirectoryLoading] = React.useState(false);
  const [platformDirectorySearch, setPlatformDirectorySearch] = React.useState('');

  const isOrgAdmin = !isClusterAdmin && role === 'admin';
  const activeOrg = activeOrgId ? availableOrgs[activeOrgId] : null;
  const canEditIdentity = (isClusterAdmin || role === 'admin') && !!activeOrgId;

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
        'This removes activities, entities, records, operator sessions, expenses, adjustment requests, collaboration profiles, and channel movements. This cannot be undone.',
      danger: true,
      confirmLabel: 'Clear data',
    });
    if (!ok) return;

    setIsClearingGlobalData(true);
    try {
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

      // FK-safe order (matches 00000000000000_init_canonical_schema.sql)
      await clearActivity('channel_records');
      await clearActivity('records');
      await clearActivity('operator_activities');
      await clearActivity('activities');
      await clearActivity('audit_events');
      await clearActivity('entities');
      await clearActivity('collaborations');
      await clearActivity('channels');

      await refreshData();
      notify({ type: 'success', message: 'Cloud operational data cleared.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to clear global data.' });
    } finally {
      setIsClearingGlobalData(false);
    }
  };

  const fetchAccessRequests = React.useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !canManageWorkspaceAccess) return;
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
  }, [canManageWorkspaceAccess]);

  const fetchAccessInvites = React.useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !canManageWorkspaceAccess) return;
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
  }, [canManageWorkspaceAccess]);

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
    } catch (error) {
      setClusterAdminsNotice(`Transport error: ${toDisplayError(error)}`);
    } finally {
      setClusterAdminsLoading(false);
    }
  }, [activeOrgId, canAccessAdminUi]);

  const fetchPlatformDirectory = React.useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !isClusterAdmin) return;
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
  }, [isClusterAdmin, notify]);

  React.useEffect(() => {
    if (authLoading) return; // Prevent premature calls before session is ready
    
    void fetchAccessRequests();
    void fetchAccessInvites();
    void fetchClusterAdmins();
    if (isClusterAdmin) void fetchPlatformDirectory();
  }, [authLoading, fetchAccessInvites, fetchAccessRequests, fetchClusterAdmins, isClusterAdmin, fetchPlatformDirectory]);

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

      const displayNameOverride = pendingProvisionDisplayNames[request.id]?.trim() || '';

      const { data, error } = await invokeSafe<ProvisionResult>('provision-user', {
        access_request_id: request.id,
        display_name: displayNameOverride || undefined,
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
      setPendingProvisionDisplayNames(prev => {
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
      setPendingProvisionDisplayNames(prev => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      setPendingPasswords(prev => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
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

    await Promise.all([fetchClusterAdmins(), fetchPlatformDirectory()]);
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

  const backendStatus = isSupabaseConfigured ? 'Connected' : 'Not configured';
  
  const roleLabel = React.useMemo(() => {
    if (isClusterAdmin || clusterRole === 'cluster_admin') return getRoleLabel('cluster_admin');
    if (clusterRole === 'cluster_operator') return getRoleLabel('cluster_operator');
    return getRoleLabel(role);
  }, [isClusterAdmin, clusterRole, role]);
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

  const grantWorkspaceOrgOptions = React.useMemo(() => {
    const all = Object.values(availableOrgs);
    if (authorityManagedOrgIds.length === 0) return all;
    return all.filter((o) => authorityManagedOrgIds.includes(o.id));
  }, [availableOrgs, authorityManagedOrgIds]);

  const grantWorkspaceToExistingUser = async () => {
    if (!supabase || !activeOrgId) return;
    const email = grantAccessEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notify({ type: 'error', message: 'Enter a valid email for an account that already exists in Auth.' });
      return;
    }
    const orgId = grantAccessOrgId || activeOrgId;
    if (!authorityManagedOrgIds.includes(orgId)) {
      notify({ type: 'error', message: 'Pick a workspace you manage.' });
      return;
    }
    setGrantAccessBusy(true);
    try {
      await refreshAuthority();
      const { error } = await invokeSafe('manage-organizations', {
        action: 'assign-org-admin',
        org_id: orgId,
        target_email: email,
        target_role: grantAccessRole,
      });
      if (error) throw error;
      notify({
        type: 'success',
        message: `${email} can open the app for this workspace as ${grantAccessRole}. They should refresh or use Check status.`,
      });
      setGrantAccessEmail('');
      if (isClusterAdmin) await fetchPlatformDirectory();
    } catch (err) {
      notify({
        type: 'error',
        message: `Could not grant workspace access: ${toDisplayError(err)}`,
      });
    } finally {
      setGrantAccessBusy(false);
    }
  };

  const clusterManagedByUserId = React.useMemo(() => {
    const m = new Map<string, ManagedClusterAccount>();
    for (const a of clusterAdmins) {
      if (a.type === 'cluster' && !m.has(a.user_id)) m.set(a.user_id, a);
    }
    return m;
  }, [clusterAdmins]);

  const refreshPeopleDirectory = React.useCallback(async () => {
    await fetchPlatformDirectory();
    await fetchClusterAdmins();
  }, [fetchPlatformDirectory, fetchClusterAdmins]);

  const filteredPlatformAccounts = React.useMemo(() => {
    const q = platformDirectorySearch.trim().toLowerCase();
    if (!q) return platformAccounts;
    return platformAccounts.filter(
      acc =>
        (acc.email ?? '').toLowerCase().includes(q) ||
        (acc.user_id ?? '').toLowerCase().includes(q)
    );
  }, [platformAccounts, platformDirectorySearch]);

  const filteredInvites = accessInvites.filter(invite =>
    !invite.revoked_at &&
    (
      (invite.label ?? '').toLowerCase().includes(inviteSearch.toLowerCase()) ||
      invite.id.toLowerCase().includes(inviteSearch.toLowerCase())
    )
  );

  const switcherOrgs = React.useMemo(() => {
    if (isClusterAdmin) {
      const effectiveClusterId = scopeClusterId || contextClusterId;
      const fromCluster =
        effectiveClusterId && manageableOrgsByCluster[effectiveClusterId]
          ? manageableOrgsByCluster[effectiveClusterId]
          : null;
      if (fromCluster && fromCluster.length > 0) return fromCluster;
    }
    return Object.values(availableOrgs);
  }, [
    availableOrgs,
    contextClusterId,
    isClusterAdmin,
    manageableOrgsByCluster,
    scopeClusterId,
  ]);

  const showGroupSwitcher = isClusterAdmin && manageableClusters.length > 1;
  const showWorkspaceSwitcher = switcherOrgs.length > 1;
  const showWorkspaceQuickCard = Boolean(activeOrgId && activeOrg);

  const slot =
    'rounded-xl border border-stone-200/90 bg-stone-50/50 p-4 dark:border-stone-800 dark:bg-stone-900/40';

  return (
    <div className={cn(embedded ? 'space-y-6' : 'page-shell', 'w-full min-w-0 overflow-x-hidden')}>
      {!embedded && (
        <header className="mb-5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Settings</h1>
          {activeOrg?.name ? (
            <span className="max-w-full truncate text-sm text-stone-500 dark:text-stone-400">{activeOrg.name}</span>
          ) : null}
          <span className="text-xs text-stone-400 dark:text-stone-500">{roleLabel}</span>
        </header>
      )}

      <div className="space-y-4">

        {showWorkspaceQuickCard && (
          <div id="settings-workspace-switch" className={cn(slot, 'scroll-mt-24')}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
              <p className="truncate text-base font-medium text-stone-900 dark:text-stone-100">
                {activeOrg?.name || activeOrg?.tag || '—'}
              </p>
              {(showGroupSwitcher || showWorkspaceSwitcher) && (
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:max-w-xl lg:shrink-0">
                  {showGroupSwitcher && (
                    <select
                      className="control-input min-w-[10rem] flex-1 py-2 text-sm"
                      value={scopeClusterId || contextClusterId || ''}
                      onChange={e => setScopeClusterId(e.target.value)}
                      aria-label="Group"
                    >
                      <option value="" disabled>
                        Group…
                      </option>
                      {manageableClusters.map(cluster => (
                        <option key={cluster.id} value={cluster.id}>
                          {cluster.name || cluster.tag || cluster.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  )}
                  {showWorkspaceSwitcher && (
                    <select
                      className="control-input min-w-[10rem] flex-1 py-2 text-sm"
                      value={activeOrgId || ''}
                      onChange={e => typeof switchOrg === 'function' && switchOrg(e.target.value)}
                      aria-label="Workspace"
                    >
                      {switcherOrgs.map(org => (
                        <option key={org.id} value={org.id}>
                          {org.name || org.tag || org.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
            {isClusterAdmin && clusterId && (
              <div className="mt-3 flex flex-col gap-2 border-t border-stone-200/80 pt-3 dark:border-stone-700/80 sm:flex-row sm:items-center">
                <input
                  type="email"
                  placeholder="New workspace — admin email (optional)"
                  className="control-input flex-1 py-2 text-xs"
                  value={newOrgAdminEmail}
                  onChange={e => setNewOrgAdminEmail(e.target.value)}
                  disabled={isProvisioning}
                />
                <button
                  type="button"
                  onClick={() => void provisionOrganization()}
                  disabled={isProvisioning}
                  className="action-btn-primary h-9 shrink-0 px-3 text-xs"
                >
                  {isProvisioning ? '…' : 'Create'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {canEditIdentity && (
            <div className={slot}>
              <p className="mb-3 text-sm font-medium text-stone-800 dark:text-stone-200">Workspace name and tag</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  className="control-input text-sm"
                  value={editOrgName}
                  onChange={e => setEditOrgName(e.target.value)}
                  placeholder="Name"
                />
                <input
                  type="text"
                  className="control-input font-mono text-sm"
                  value={editOrgTag}
                  onChange={e => setEditOrgTag(e.target.value.toUpperCase())}
                  placeholder="TAG"
                />
              </div>
              <button
                onClick={handleUpdateOrgIdentity}
                disabled={isUpdatingOrgIdentity}
                className="action-btn-primary mt-3 h-9 w-full justify-center text-xs sm:w-auto sm:px-4"
              >
                {isUpdatingOrgIdentity ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          {canManageWorkspaceAccess && (
            <div id="settings-grant-access" className={cn(slot, 'scroll-mt-24')}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-stone-800 dark:text-stone-200">People</p>
                {accessRequests.length > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                    {accessRequests.length} pending
                  </span>
                ) : null}
              </div>
              <button
                onClick={() => void createAccessInvite()}
                className="action-btn-primary mb-3 h-9 w-full justify-center text-xs"
              >
                New invite link
              </button>
              {inviteTokenValue && (
                <div className="mb-3 space-y-2 rounded-lg border border-stone-200/90 bg-white/80 p-2 dark:border-stone-700 dark:bg-stone-950/50">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate font-mono text-[10px] text-stone-700 dark:text-stone-300 select-all">{inviteTokenValue}</span>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(inviteTokenValue); setInviteTokenCopied(true); setTimeout(() => setInviteTokenCopied(false), 2000); }}
                      className="shrink-0 text-[11px] font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-300"
                    >
                      {inviteTokenCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(buildInviteShareMessage(inviteTokenValue)); setInviteMessageCopied(true); setTimeout(() => setInviteMessageCopied(false), 2000); }}
                    className="w-full rounded-md bg-stone-100 py-1.5 text-[11px] text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                  >
                    {inviteMessageCopied ? 'Copied' : 'Copy message'}
                  </button>
                </div>
              )}
              {inviteNotice && !inviteTokenValue && <p className="mb-2 text-[11px] text-red-600 dark:text-red-400">{inviteNotice}</p>}

              <div className="space-y-2 border-t border-stone-200/80 pt-3 dark:border-stone-700/80">
                {grantWorkspaceOrgOptions.length > 1 && (
                  <select
                    className="control-input w-full py-2 text-xs"
                    value={grantAccessOrgId || activeOrgId || ''}
                    onChange={e => setGrantAccessOrgId(e.target.value)}
                    disabled={grantAccessBusy}
                    aria-label="Workspace for access grant"
                  >
                    {grantWorkspaceOrgOptions.map(org => (
                      <option key={org.id} value={org.id}>{org.name || org.tag || org.id.slice(0, 8)}</option>
                    ))}
                  </select>
                )}
                <input
                  type="email"
                  autoComplete="off"
                  placeholder="Email (existing account)"
                  className="control-input py-2 text-xs"
                  value={grantAccessEmail}
                  onChange={e => setGrantAccessEmail(e.target.value)}
                  disabled={grantAccessBusy}
                />
                <div className="flex gap-2">
                  <select
                    className="control-input flex-1 py-2 text-xs"
                    value={grantAccessRole}
                    onChange={e => setGrantAccessRole(e.target.value as 'admin' | 'operator' | 'viewer')}
                    disabled={grantAccessBusy}
                    aria-label="Role"
                  >
                    <option value="admin">{LABELS.roles.workspaceAdmin}</option>
                    <option value="operator">{LABELS.roles.workspaceManager}</option>
                    <option value="viewer">{LABELS.roles.viewer}</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void grantWorkspaceToExistingUser()}
                    disabled={grantAccessBusy}
                    className="action-btn-primary shrink-0 px-3 text-xs"
                  >
                    {grantAccessBusy ? '…' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-stone-200/70 pt-3 dark:border-stone-800/70">
          <button
            type="button"
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
            className="rounded-lg border border-stone-200 bg-stone-50/80 px-2.5 py-1 text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:pointer-events-none disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-300 dark:hover:bg-stone-800/80"
          >
            {isExporting ? 'Exporting…' : 'Export data'}
          </button>
          {lastExportMeta ? (
            <span className="text-[10px] tabular-nums text-stone-400 dark:text-stone-500">
              {lastExportMeta.rows} rows
            </span>
          ) : null}
          {canManageGlobalData ? (
            <>
              <span className="hidden text-stone-300 sm:inline dark:text-stone-600" aria-hidden>
                ·
              </span>
              <button
                type="button"
                disabled={isClearingGlobalData}
                onClick={() => void clearGlobalData()}
                className="rounded-lg border border-red-200/70 bg-transparent px-2.5 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-40 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                {isClearingGlobalData ? 'Resetting…' : 'Reset workspace'}
              </button>
            </>
          ) : null}
        </div>

        {canManageWorkspaceAccess && accessRequests.length > 0 && (
          <div className={slot}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-stone-800 dark:text-stone-200">Access requests</p>
              <button
                type="button"
                onClick={() => { void fetchAccessInvites(); void fetchAccessRequests(); }}
                className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-300"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-3">
              {accessRequests.map(req => (
                <div
                  key={req.id}
                  className="space-y-2 rounded-lg border border-stone-200/90 bg-white/60 p-3 dark:border-stone-700 dark:bg-stone-950/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-stone-900 dark:text-stone-100">{req.login_id}</p>
                      <p className="text-[11px] text-stone-500">{getRoleLabel(req.requested_role)}</p>
                    </div>
                  </div>
                  <input
                    type="password"
                    placeholder="Initial password (8+)"
                    className="control-input w-full py-1.5 text-xs"
                    value={pendingPasswords[req.id] || ''}
                    onChange={e => setPendingPasswords(prev => ({ ...prev, [req.id]: e.target.value }))}
                  />
                  <input
                    type="text"
                    placeholder="Display name (optional)"
                    className="control-input w-full py-1.5 text-xs"
                    value={pendingProvisionDisplayNames[req.id] || ''}
                    onChange={e =>
                      setPendingProvisionDisplayNames(prev => ({
                        ...prev,
                        [req.id]: e.target.value,
                      }))
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void reviewAccessRequest(req, 'approved')}
                      disabled={busyRequestId === req.id}
                      className="action-btn-primary h-8 flex-1 justify-center text-xs"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void reviewAccessRequest(req, 'rejected')}
                      disabled={busyRequestId === req.id}
                      className="h-8 flex-1 rounded-lg border border-stone-200 text-xs text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
              {requestsNotice && <p className="text-[11px] text-stone-500">{requestsNotice}</p>}
            </div>
          </div>
        )}

        <div className="border-t border-stone-200/80 pt-4 dark:border-stone-800/80">
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
          >
            <ChevronDown size={14} className={cn('transition-transform duration-200', showAdvanced && 'rotate-180')} />
            More
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div id="settings-password" className={cn(slot, 'scroll-mt-24')}>
                  <p className="mb-2 text-sm font-medium text-stone-800 dark:text-stone-200">Password</p>
                  <div className="space-y-2">
                    <input
                      type="password"
                      className="control-input w-full py-2 text-xs"
                      placeholder="New password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                    />
                    <input
                      type="password"
                      className="control-input w-full py-2 text-xs"
                      placeholder="Confirm"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => void handleUpdatePassword()}
                      disabled={isUpdatingPassword}
                      className="action-btn-primary h-9 w-full justify-center text-xs sm:w-auto sm:px-4"
                    >
                      {isUpdatingPassword ? 'Updating…' : 'Update'}
                    </button>
                  </div>
                </div>

                <div className={slot}>
                  <p className="mb-2 text-sm font-medium text-stone-800 dark:text-stone-200">Account</p>
                  <p className="truncate text-xs text-stone-600 dark:text-stone-300">{user?.email ?? '—'}</p>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    {roleLabel}
                    <span className="text-stone-400 dark:text-stone-500"> · </span>
                    {backendStatus}
                  </p>
                  {canEditIdentity && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-stone-200/80 pt-3 dark:border-stone-700/80 sm:flex-row sm:items-center">
                      <input
                        type="text"
                        className="control-input flex-1 font-mono text-xs"
                        value={editOrgSlug}
                        onChange={e => setEditOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        placeholder="URL slug"
                      />
                      <button
                        type="button"
                        onClick={handleUpdateOrgIdentity}
                        disabled={isUpdatingOrgIdentity}
                        className="action-btn-primary h-8 shrink-0 px-3 text-xs"
                      >
                        {isUpdatingOrgIdentity ? '…' : 'Save slug'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {canManageWorkspaceAccess && (
                <div className={slot}>
                  <p className="mb-3 text-sm font-medium text-stone-800 dark:text-stone-200">Default invites</p>
                  <div className="grid max-w-lg grid-cols-3 gap-2">
                    <input type="text" placeholder="Label" className="control-input py-1.5 text-xs" value={inviteLabel} onChange={e => setInviteLabel(e.target.value)} />
                    <input type="number" placeholder="Days" className="control-input py-1.5 text-xs" value={inviteExpiryDays} onChange={e => setInviteExpiryDays(e.target.value)} />
                    <input type="number" placeholder="Uses" className="control-input py-1.5 text-xs" value={inviteMaxUses} onChange={e => setInviteMaxUses(e.target.value)} />
                  </div>
                  {filteredInvites.length > 0 && (
                    <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto app-scroll">
                      {filteredInvites.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between gap-2 rounded-md border border-stone-200/80 px-2 py-1.5 dark:border-stone-700">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-medium text-stone-700 dark:text-stone-300">{inv.label || '—'}</p>
                            <p className="text-[10px] text-stone-400">{inv.use_count}/{inv.max_uses}</p>
                          </div>
                          <button type="button" onClick={() => void revokeAccessInvite(inv.id)} disabled={busyInviteId === inv.id} className="shrink-0 text-[11px] text-red-600 hover:underline dark:text-red-400">
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className={slot}>
                <p className="mb-2 text-sm font-medium text-stone-800 dark:text-stone-200">Export</p>
                <div className="flex flex-wrap items-end gap-2">
                  {isClusterAdmin && (
                    <div className="flex gap-0.5 rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
                      {(['org', 'cluster'] as const).map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setExportScope(s)}
                          className={cn(
                            'rounded-md px-2 py-1 text-[11px] font-medium',
                            exportScope === s ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100' : 'text-stone-500',
                          )}
                        >
                          {s === 'org' ? 'Workspace' : 'Group'}
                        </button>
                      ))}
                    </div>
                  )}
                  <select
                    value={exportDataset}
                    onChange={e => setExportDataset(e.target.value)}
                    className="control-input min-w-[8rem] py-1.5 text-xs"
                    aria-label="Export dataset"
                  >
                    <option value="all">Full</option>
                    <option value="entities">Entities</option>
                    <option value="activities">Activities</option>
                    <option value="audit_events">Audit</option>
                  </select>
                </div>
              </div>

              <div className={slot}>
                <button
                  type="button"
                  onClick={() => void handleSignOutAll()}
                  className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                >
                  <LogOut size={14} />
                  Sign out everywhere
                </button>
              </div>

              {isClusterAdmin && (
                <div className={slot}>
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-stone-800 dark:text-stone-200">Directory</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search…"
                        className="control-input w-44 min-w-0 py-1.5 text-xs"
                        value={platformDirectorySearch}
                        onChange={e => setPlatformDirectorySearch(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => void refreshPeopleDirectory()}
                        disabled={platformDirectoryLoading || clusterAdminsLoading}
                        className="text-xs text-stone-500 hover:text-stone-800 disabled:opacity-40 dark:hover:text-stone-300"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                  {clusterAdminsNotice && <p className="mb-2 text-[11px] text-amber-600 dark:text-amber-400">{clusterAdminsNotice}</p>}
                  <div className="overflow-hidden rounded-lg border border-stone-200/90 dark:border-stone-700">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-stone-200/80 bg-stone-100/80 dark:border-stone-700 dark:bg-stone-800/50">
                            <th className="px-3 py-2 text-[10px] font-medium text-stone-500">Email</th>
                            <th className="px-3 py-2 text-[10px] font-medium text-stone-500">Roles</th>
                            <th className="px-3 py-2 text-[10px] font-medium text-stone-500 whitespace-nowrap">Group</th>
                            <th className="px-3 py-2 text-right text-[10px] font-medium text-stone-500"> </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                          {platformDirectoryLoading ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-6">
                                <LoadingLine label="Loading…" compact />
                              </td>
                            </tr>
                          ) : filteredPlatformAccounts.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-[11px] text-stone-400">
                                No matches.
                              </td>
                            </tr>
                          ) : (
                            filteredPlatformAccounts.map(acc => {
                              const clusterManaged = clusterManagedByUserId.get(acc.user_id);
                              const isSelf = acc.user_id === user?.id;
                              const effectiveClusterRole: 'cluster_admin' | 'cluster_operator' =
                                clusterManaged?.role === 'cluster_admin' || clusterManaged?.role === 'cluster_operator'
                                  ? clusterManaged.role
                                  : 'cluster_operator';
                              return (
                                <tr key={acc.user_id} className="group hover:bg-stone-50/50 dark:hover:bg-stone-800/20 transition-colors">
                                  <td className="px-3 py-2">
                                    <p className="text-xs font-medium text-stone-900 dark:text-stone-100">{acc.email || '—'}</p>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-1">
                                      {acc.cluster_roles.map((cr, i) => (
                                        <span key={i} className="text-[9px] font-black uppercase bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/20">{cr.role.replace('_', ' ')}</span>
                                      ))}
                                      {acc.org_roles.map((om, i) => (
                                        <span key={i} className="text-[9px] font-black uppercase bg-violet-50 dark:bg-violet-900/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded border border-violet-100 dark:border-violet-900/20">{om.role}</span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 align-top">
                                    {clusterManaged ? (
                                      isSelf ? (
                                        <span className="text-[10px] text-stone-400">—</span>
                                      ) : (
                                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:flex-wrap">
                                          <select
                                            className="text-[10px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded px-1.5 py-1 outline-none font-bold text-stone-600 dark:text-stone-300 max-w-[9rem]"
                                            value={pendingClusterRoles[acc.user_id] ?? effectiveClusterRole}
                                            onChange={e =>
                                              setPendingClusterRoles(prev => ({
                                                ...prev,
                                                [acc.user_id]: e.target.value as 'cluster_admin' | 'cluster_operator',
                                              }))
                                            }
                                          >
                                            <option value="cluster_admin">Admin</option>
                                            <option value="cluster_operator">Operator</option>
                                          </select>
                                          <button
                                            type="button"
                                            onClick={() => void updateClusterAccountRole(clusterManaged)}
                                            disabled={busyClusterUserId === acc.user_id}
                                            className="text-[10px] font-bold text-emerald-600 uppercase hover:underline disabled:opacity-40"
                                          >
                                            Save
                                          </button>
                                        </div>
                                      )
                                    ) : (
                                      <span className="text-[10px] text-stone-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right align-top">
                                    <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!acc.email) return;
                                          setGrantAccessEmail(acc.email);
                                          window.requestAnimationFrame(() => {
                                            document.getElementById('settings-grant-access')?.scrollIntoView({
                                              behavior: 'smooth',
                                              block: 'start',
                                            });
                                          });
                                        }}
                                        className="text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                                      >
                                        Add
                                      </button>
                                      <button
                                        type="button"
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
                                        className="text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-300"
                                      >
                                        Reset
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
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
