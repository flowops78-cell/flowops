import React from 'react';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { DbRole, dbRoleToAppRole } from '../lib/roles';
import { isSupabaseConfigured, SUPABASE_ANON_KEY, supabase } from '../lib/supabase';
import { useNotification } from '../context/NotificationContext';
import LoadingLine from '../components/LoadingLine';
import CollapsibleWorkspaceSection from '../components/CollapsibleWorkspaceSection';
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

type ManagedMetaOrgAccount = {
  user_id: string;
  login_id: string | null;
  org_id: string | null;
  meta_org_id: string | null;
  role: DbRole;
  member_id: string | null;
  member_name: string | null;
  created_at: string | null;
};

type ManageMetaOrgAdminsResult = {
  ok?: boolean;
  meta_org_id?: string | null;
  managed_org_ids?: string[];
  accounts?: ManagedMetaOrgAccount[];
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
  const {
    isDemoMode,
    activeOrgId,
    units,
    workspaces,
    entries,
    members: members,
    activityLogs,
    expenses,
    adjustments,
    channelEntries,
    partners,
    partnerEntries,
    systemEvents,
    operatorLogs,
    recordSystemEvent,
    refreshData,
  } = useData();
  const { role, canAccessAdminUi } = useAppRole();
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
  const [pendingMemberIds, setPendingMemberIds] = React.useState<Record<string, string>>({});
  const [pendingPasswords, setPendingPasswords] = React.useState<Record<string, string>>({});
  const [pendingApprovedRoles, setPendingApprovedRoles] = React.useState<Record<string, DbRole>>({});
  const [metaOrgAccounts, setMetaOrgAccounts] = React.useState<ManagedMetaOrgAccount[]>([]);
  const [managedMetaOrgId, setManagedMetaOrgId] = React.useState<string | null>(null);
  const [managedOrgIds, setManagedOrgIds] = React.useState<string[]>([]);
  const [metaOrgAdminsLoading, setMetaOrgAdminsLoading] = React.useState(false);
  const [metaOrgAdminsNotice, setMetaOrgAdminsNotice] = React.useState<string | null>(null);
  const [pendingMetaOrgRoles, setPendingMetaOrgRoles] = React.useState<Record<string, Extract<DbRole, 'admin' | 'operator'>>>({});
  const [busyMetaOrgUserId, setBusyMetaOrgUserId] = React.useState<string | null>(null);

  const canManageGlobalData = canAccessAdminUi;

  const getAccessToken = React.useCallback(async () => {
    if (!supabase) return null;
    let { data: sessionData } = await supabase.auth.getSession();
    let accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      accessToken = refreshData.session?.access_token;
    }
    return accessToken ?? null;
  }, []);

  const clearGlobalData = async () => {
    if (!canManageGlobalData) {
      notify({ type: 'error', message: 'Only admin can clear global data.' });
      return;
    }
    if (isClearingGlobalData) return;

    const confirmed = window.confirm('Clear all operational data? This removes workspaces, participants, entries, member records, member activities, expenses, adjustment requests, partner network, and channel movements. This cannot be undone.');
    if (!confirmed) return;

    setIsClearingGlobalData(true);
    try {
      if (isDemoMode) {
        const demoKeys = [
          'flow_ops_units',
          'flow_ops_workspaces',
          'flow_ops_entries',
          'flow_ops_members',
          'flow_ops_activity_logs',
          'flow_ops_outflows',
          'flow_ops_adjustments',
          'flow_ops_channel_base',
          'flow_ops_partners',
          'flow_ops_partner_trans',
          'flow_ops_audit_events_v2',
          'flow_ops_operator_log_id',
          'flow_ops_operator_log_started_at',
          'flow_ops_operator_log_user_id',
          'flow_ops_missing_supabase_workspaces',
        ];
        demoKeys.forEach(key => localStorage.removeItem(key));
        demoKeys.forEach(key => localStorage.removeItem(key));
        await refreshData();
        notify({ type: 'success', message: 'Demo data cleared.' });
      } else {
        const client = supabase;
        if (!client) throw new Error('Supabase project connectivity is not configured in environment variables.');

        const isMissingWorkspaceError = (message: string) => {
          const normalized = message.toLowerCase();
          return normalized.includes('could not find the workspace') || normalized.includes('relation') || normalized.includes('schema cache');
        };

        const clearWorkspace = async (workspaceName: string) => {
          const { error } = await client.from(workspaceName).delete().not('id', 'is', null);
          if (error && !isMissingWorkspaceError(error.message ?? '')) {
            throw new Error(`${workspaceName}: ${error.message}`);
          }
        };

        await clearWorkspace('entries');
        await clearWorkspace('activity_logs');
        await clearWorkspace('outflows');
        await clearWorkspace('adjustments');
        await clearWorkspace('channel_entries');
        await clearWorkspace('partner_entries');
        await clearWorkspace('workspaces');
        await clearWorkspace('members');
        await clearWorkspace('audit_events');
        await clearWorkspace('operator_activities');
        await clearWorkspace('partners');
        await clearWorkspace('units');

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
        ? 'access_requests workspace not found yet. Run supabase/migrations/20260322230000_flow_ops_schema.sql.'
        : `Unable to load access requests: ${error.message}`);
      setRequestsLoading(false);
      return;
    }
    setAccessRequests((data ?? []) as AccessRequestRow[]);
    setRequestsLoading(false);
  }, [canViewOperatorLogs]);

  const fetchAccessInvites = React.useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !canViewOperatorLogs) return;
    setInviteLoading(true);
    const { data, error } = await supabase
      .from('access_invites')
      .select('id, label, created_at, expires_at, revoked_at, last_used_at, use_count, max_uses')
      .order('created_at', { ascending: false })
      .limit(120);

    if (error) {
      setAccessInvites([]);
      const normalizedErrorMessage = (error.message ?? '').toLowerCase();
      setInviteNotice(normalizedErrorMessage.includes('access_invites')
        ? 'access_invites workspace not found yet. Run supabase/migrations/20260322230000_flow_ops_schema.sql.'
        : `Unable to load invite tokens: ${error.message}`);
      setInviteLoading(false);
      return;
    }

    setAccessInvites((data ?? []) as AccessInviteRow[]);
    setInviteLoading(false);
  }, [canViewOperatorLogs]);

  const fetchMetaOrgAdmins = React.useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !canManageMetaOrgAdmins || !activeOrgId) return;

    setMetaOrgAdminsLoading(true);
    setMetaOrgAdminsNotice(null);

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMetaOrgAdminsNotice('Meta-org admin loading requires an active auth session. Sign in again and retry.');
      setMetaOrgAdminsLoading(false);
      return;
    }

    const { data, error } = await supabase.functions.invoke<ManageMetaOrgAdminsResult>('manage-meta-org-admins', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: {
        action: 'list',
        org_id: activeOrgId,
        access_token: accessToken,
      },
    });

    if (error) {
      const detailedError = (error as any)?.message ?? String(error);
      setMetaOrgAccounts([]);
      setManagedMetaOrgId(null);
      setManagedOrgIds([]);
      setMetaOrgAdminsNotice(`Unable to load meta-org admins: ${detailedError}`);
      setMetaOrgAdminsLoading(false);
      return;
    }

    setMetaOrgAccounts(data?.accounts ?? []);
    setManagedMetaOrgId(data?.meta_org_id ?? null);
    setManagedOrgIds(data?.managed_org_ids ?? []);
    setMetaOrgAdminsLoading(false);
  }, [activeOrgId, canManageMetaOrgAdmins, getAccessToken]);

  React.useEffect(() => {
    void fetchAccessRequests();
    void fetchAccessInvites();
    void fetchMetaOrgAdmins();
  }, [fetchAccessInvites, fetchAccessRequests, fetchMetaOrgAdmins]);

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

      const accessToken = await getAccessToken();

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
          member_id: pendingMemberIds[request.id]?.trim() || undefined,
          password: initialPassword,
          approved_role: pendingApprovedRoles[request.id] || request.requested_role,
          access_token: accessToken,
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
      setPendingMemberIds(prev => {
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

  const updateMetaOrgAccountRole = async (account: ManagedMetaOrgAccount) => {
    if (!supabase || !activeOrgId) return;

    const nextRole = pendingMetaOrgRoles[account.user_id] || (account.role === 'admin' ? 'admin' : 'operator');
    if (nextRole === account.role) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMetaOrgAdminsNotice('Meta-org admin updates require an active auth session. Sign in again and retry.');
      return;
    }

    setBusyMetaOrgUserId(account.user_id);
    setMetaOrgAdminsNotice(null);

    const { error } = await supabase.functions.invoke<ManageMetaOrgAdminsResult>('manage-meta-org-admins', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: {
        action: 'set-role',
        org_id: activeOrgId,
        target_user_id: account.user_id,
        target_role: nextRole,
        access_token: accessToken,
      },
    });

    if (error) {
      const detailedError = (error as any)?.message ?? String(error);
      setMetaOrgAdminsNotice(`Unable to update account role: ${detailedError}`);
      notify({ type: 'error', message: `Unable to update account role: ${detailedError}` });
      setBusyMetaOrgUserId(null);
      return;
    }

    await fetchMetaOrgAdmins();
    void recordSystemEvent({
      action: 'role_updated',
      entity: 'member',
      entity_id: account.user_id,
      details: `Role updated for ${account.login_id}: ${nextRole}`,
    });
    notify({ type: 'success', message: `Updated ${account.login_id ?? 'account'} to ${nextRole}.` });
    setBusyMetaOrgUserId(null);
  };

  const deleteMetaOrgAccount = async (account: ManagedMetaOrgAccount) => {
    if (!supabase || !activeOrgId) return;
    if (!window.confirm(`Permanently delete account ${account.login_id ?? account.user_id}? This will remove the authentication record and all associated identity mapping. This cannot be undone.`)) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMetaOrgAdminsNotice('Meta-org admin updates require an active auth session. Sign in again and retry.');
      return;
    }

    setBusyMetaOrgUserId(account.user_id);
    setMetaOrgAdminsNotice(null);

    const { error } = await supabase.functions.invoke<ManageMetaOrgAdminsResult>('manage-meta-org-admins', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: {
        action: 'delete-user',
        org_id: activeOrgId,
        target_user_id: account.user_id,
        access_token: accessToken,
      },
    });

    if (error) {
      const detailedError = (error as any)?.message ?? String(error);
      setMetaOrgAdminsNotice(`Unable to delete account: ${detailedError}`);
      notify({ type: 'error', message: `Unable to delete account: ${detailedError}` });
      setBusyMetaOrgUserId(null);
      return;
    }

    await fetchMetaOrgAdmins();
    void recordSystemEvent({
      action: 'member_removed',
      entity: 'member',
      entity_id: account.user_id,
      details: `Permanently deleted account: ${account.login_id}`,
    });
    notify({ type: 'success', message: `Permanently removed ${account.login_id ?? 'account'}.` });
    setBusyMetaOrgUserId(null);
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
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div className={cn(embedded ? 'space-y-6' : 'page-shell', 'w-full min-w-0 overflow-x-hidden')}>
      {!embedded && (
        <div>
          <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100 mb-1">Settings</h2>
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

        <div className="section">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Access</h3>
          <div className="space-y-2 text-sm text-stone-700 dark:text-stone-300">
            <p><span className="font-medium">Role Source:</span> Locked</p>
            <p className="truncate"><span className="font-medium">Workspace:</span> {activeOrgId ?? 'Not assigned'}</p>
            {canManageMetaOrgAdmins && (
              <p className="truncate"><span className="font-medium">Meta-Org:</span> {managedMetaOrgId ?? 'Not assigned yet'}</p>
            )}
          </div>
        </div>

        {canManageMetaOrgAdmins && (
          <div className="section">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-stone-900 dark:text-stone-100">Meta-Org Admins</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                  {metaOrgAccounts.filter((account) => account.role === 'admin').length} admins
                </span>
                <button
                  type="button"
                  onClick={() => { void fetchMetaOrgAdmins(); }}
                  disabled={metaOrgAdminsLoading}
                  className="action-btn-secondary text-xs"
                >
                  {metaOrgAdminsLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            </div>
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
              Promote or demote shared-org operators inside the current meta-org. Viewer accounts stay on the invite/request path so demo tenants remain isolated.
            </p>
            <div className="grid gap-2 md:grid-cols-2 mb-4 text-xs text-stone-500 dark:text-stone-400">
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 px-3 py-2">
                <span className="font-medium text-stone-700 dark:text-stone-300">Managed meta-org:</span> {managedMetaOrgId ?? 'Will be assigned on first shared admin promotion'}
              </div>
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 px-3 py-2">
                <span className="font-medium text-stone-700 dark:text-stone-300">Managed orgs:</span> {managedOrgIds.length > 0 ? managedOrgIds.length : 1}
              </div>
            </div>

            {metaOrgAdminsNotice && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-stone-700 dark:text-stone-200 mb-4">
                {metaOrgAdminsNotice}
              </div>
            )}

            <CollapsibleWorkspaceSection
              title="Meta-Org Accounts"
              summary={`${metaOrgAccounts.length} scoped users`}
              defaultExpanded
              maxExpandedHeightClass="max-h-[420px]"
              maxCollapsedHeightClass="max-h-[96px]"
            >
              <table className="desktop-grid w-full workspace-auto text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                  <tr>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Login</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Team Record</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Org</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Current</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Set Role</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {metaOrgAccounts.map((account) => {
                    const currentSelectableRole: Extract<DbRole, 'admin' | 'operator'> = account.role === 'admin' ? 'admin' : 'operator';
                    const pendingRole = pendingMetaOrgRoles[account.user_id] || currentSelectableRole;
                    return (
                      <tr key={account.user_id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 text-stone-700 dark:text-stone-300">
                        <td className="px-4 py-2.5">
                          <div className="truncate" title={account.login_id ?? ''}>{account.login_id ?? 'Unknown'}</div>
                          <div className="text-[11px] text-stone-400 dark:text-stone-500">{account.created_at ? new Date(account.created_at).toLocaleDateString() : 'No created date'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <div>{account.member_name ?? 'No team record'}</div>
                          <div className="text-[11px] text-stone-400 dark:text-stone-500">{account.member_id ?? 'No member ID'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-stone-500 dark:text-stone-400">{account.org_id ?? '-'}</td>
                        <td className="px-4 py-2.5 capitalize">{dbRoleToAppRole(account.role)}</td>
                        <td className="px-4 py-2.5">
                          <select
                            className="w-full px-2 py-1 text-xs border border-stone-200 dark:border-stone-700 rounded bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                            value={pendingRole}
                            onChange={(e) => setPendingMetaOrgRoles(prev => ({ ...prev, [account.user_id]: e.target.value as Extract<DbRole, 'admin' | 'operator'> }))}
                          >
                            <option value="operator">Operator</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => { void updateMetaOrgAccountRole(account); }}
                              disabled={busyMetaOrgUserId === account.user_id || pendingRole === currentSelectableRole}
                              className="px-2 py-1 rounded-md text-xs bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300 transition-colors"
                            >
                              {busyMetaOrgUserId === account.user_id ? 'Saving…' : 'Apply'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { void deleteMetaOrgAccount(account); }}
                              disabled={busyMetaOrgUserId === account.user_id || account.user_id === user?.id}
                              className="px-2 py-1 rounded-md text-xs border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                              title="Delete Auth Account"
                            >
                              {busyMetaOrgUserId === account.user_id ? '…' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!metaOrgAdminsLoading && metaOrgAccounts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-stone-400">No scoped accounts found for this meta-org yet.</td>
                    </tr>
                  )}
                  {metaOrgAdminsLoading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8">
                        <div className="mx-auto max-w-sm">
                          <LoadingLine label="Loading meta-org admins…" compact />
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CollapsibleWorkspaceSection>
          </div>
        )}

        <div className="section">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">Data</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void clearGlobalData(); }}
              disabled={!canManageGlobalData || isClearingGlobalData}
              className="action-btn-secondary text-xs"
            >
              {isClearingGlobalData ? 'Resetting…' : 'Reset System'}
            </button>
          </div>
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Bulk data export is disabled to reduce privacy exposure.</p>
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

            <CollapsibleWorkspaceSection
              title="Invite Tokens"
              summary={`${accessInvites.length} active/recent`}
              defaultExpanded
              maxExpandedHeightClass="max-h-[420px]"
              maxCollapsedHeightClass="max-h-[96px]"
            >
              <table className="desktop-grid w-full workspace-auto text-left text-[13px]">
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
                  {accessInvites.map((invite) => {
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
            </CollapsibleWorkspaceSection>
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

            <CollapsibleWorkspaceSection
              title="Account Requests"
              summary={`${accessRequests.length} pending`}
              defaultExpanded
              maxExpandedHeightClass="max-h-[520px]"
              maxCollapsedHeightClass="max-h-[96px]"
            >
              <table className="desktop-grid w-full workspace-auto text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                  <tr>
                    <th className="px-4 py-2.5 w-[170px] text-[11px] font-semibold uppercase tracking-wide">Requested</th>
                    <th className="px-4 py-2.5 w-[220px] text-[11px] font-semibold uppercase tracking-wide">Login ID</th>
                    <th className="px-4 py-2.5 w-[120px] text-[11px] font-semibold uppercase tracking-wide">Requested</th>
                    <th className="px-4 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Approve As</th>
                    <th className="px-4 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Member ID</th>
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
                            value={pendingMemberIds[request.id] || ''}
                            onChange={(e) => setPendingMemberIds(prev => ({ ...prev, [request.id]: e.target.value }))}
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
            </CollapsibleWorkspaceSection>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
