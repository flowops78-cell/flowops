import { useState, useCallback } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { sanitizeLabel } from '../lib/labels';
import { generateInviteToken, sha256Hex, buildInviteShareMessage } from '../lib/settingsInviteUtils';

export type AccessInviteRow = {
  id: string;
  label?: string | null;
  created_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
  use_count: number;
  max_uses: number;
};

function toDisplayError(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof Error && error.message) return sanitizeLabel(error.message);
  if (typeof error === 'string' && error.trim()) return sanitizeLabel(error);
  if (error !== null && error !== undefined) return sanitizeLabel(String(error));
  return fallback;
}

function toDisplayMessage(message: string) {
  return sanitizeLabel(message);
}

export function useAccessInvites() {
  const { notify } = useNotification();
  const { user } = useAuth();
  const { activeOrgId } = useData();
  const { canAccessAdminUi } = useAppRole();

  const [accessInvites, setAccessInvites] = useState<AccessInviteRow[]>([]);
  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteExpiryDays, setInviteExpiryDays] = useState('7');
  const [inviteMaxUses, setInviteMaxUses] = useState('1');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [inviteTokenValue, setInviteTokenValue] = useState<string | null>(null);
  const [inviteTokenCopied, setInviteTokenCopied] = useState(false);
  const [inviteMessageCopied, setInviteMessageCopied] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const canViewOperatorLogs = canAccessAdminUi;

  const fetchAccessInvites = useCallback(async () => {
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

  const filteredInvites = accessInvites.filter(invite =>
    !invite.revoked_at &&
    (
      (invite.label ?? '').toLowerCase().includes(inviteSearch.toLowerCase()) ||
      invite.id.toLowerCase().includes(inviteSearch.toLowerCase())
    )
  );

  return {
    accessInvites,
    inviteLabel,
    setInviteLabel,
    inviteExpiryDays,
    setInviteExpiryDays,
    inviteMaxUses,
    setInviteMaxUses,
    inviteLoading,
    inviteSearch,
    setInviteSearch,
    inviteNotice,
    inviteTokenValue,
    inviteTokenCopied,
    setInviteTokenCopied,
    inviteMessageCopied,
    setInviteMessageCopied,
    busyInviteId,
    filteredInvites,
    fetchAccessInvites,
    createAccessInvite,
    revokeAccessInvite,
    /** Re-exported for the "Copy message" button in Settings UI */
    buildInviteShareMessage,
  };
}
