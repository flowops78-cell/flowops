import { useState, useCallback } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useAppRole } from '../context/AppRoleContext';
import { DbRole } from '../lib/roles';
import { sanitizeLabel } from '../lib/labels';
import { FunctionsHttpError } from '@supabase/supabase-js';

export type AccessRequestRow = {
  id: string;
  created_at: string;
  login_id: string;
  requested_role: DbRole;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_at?: string | null;
};

export type ProvisionResult = {
  ok?: boolean;
  login_id?: string;
  app_role?: DbRole;
  user_already_exists?: boolean;
};

// Duplicated from Settings to avoid circular deps — thin wrapper for edge fn calls.
async function invokeSafe<T = unknown>(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: Error | null }> {
  const { data: { session } } = await supabase!.auth.getSession();
  if (!session) {
    return { data: null, error: new Error('Authentication required') };
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
      } catch { /* keep generic message */ }
    }
    return { data: null, error: new Error(message) };
  }
  return result;
}

function toDisplayError(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof Error && error.message) return sanitizeLabel(error.message);
  if (typeof error === 'string' && error.trim()) return sanitizeLabel(error);
  if (error !== null && error !== undefined) return sanitizeLabel(String(error));
  return fallback;
}

export function useAccessRequests() {
  const { notify } = useNotification();
  const { user } = useAuth();
  const { canAccessAdminUi, refreshAuthority } = useAppRole();

  const [accessRequests, setAccessRequests] = useState<AccessRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsNotice, setRequestsNotice] = useState<string | null>(null);
  const [requestsNoticeLoginValue, setRequestsNoticeLoginValue] = useState<string | null>(null);
  const [requestsNoticeCopied, setRequestsNoticeCopied] = useState<'login' | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [pendingProvisionDisplayNames, setPendingProvisionDisplayNames] = useState<Record<string, string>>({});
  const [pendingPasswords, setPendingPasswords] = useState<Record<string, string>>({});
  const [pendingApprovedRoles, setPendingApprovedRoles] = useState<Record<string, DbRole>>({});

  const canViewOperatorLogs = canAccessAdminUi;

  const fetchAccessRequests = useCallback(async () => {
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

  return {
    accessRequests,
    requestsLoading,
    requestsNotice,
    requestsNoticeLoginValue,
    requestsNoticeCopied,
    setRequestsNoticeCopied,
    busyRequestId,
    pendingProvisionDisplayNames,
    setPendingProvisionDisplayNames,
    pendingPasswords,
    setPendingPasswords,
    pendingApprovedRoles,
    setPendingApprovedRoles,
    fetchAccessRequests,
    reviewAccessRequest,
  };
}
