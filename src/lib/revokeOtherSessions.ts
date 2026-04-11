import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './supabase';

function logRevokeFailure(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  const ctx = error && typeof error === 'object' && 'context' in error ? (error as { context?: Response }).context : undefined;
  const status = ctx && typeof ctx.status === 'number' ? ctx.status : null;
  if (status != null) {
    console.warn('[flow-ops] revoke-other-sessions failed:', `HTTP ${status}`, msg);
  } else {
    console.warn('[flow-ops] revoke-other-sessions failed:', msg);
  }
}

/**
 * Calls the Edge Function that revokes other GoTrue sessions (scope "others").
 * Sends an explicit Bearer token (same pattern as Settings `invokeSafe`) so the call
 * succeeds immediately after SIGNED_IN when implicit headers can lag.
 */
export async function invokeRevokeOtherSessions(client: SupabaseClient): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    const {
      data: { session },
    } = await client.auth.refreshSession();
    if (!session?.access_token) return;

    const { data, error } = await client.functions.invoke('revoke-other-sessions', {
      method: 'POST',
      body: {},
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      logRevokeFailure(error);
      return;
    }

    if (data && typeof data === 'object' && 'error' in data) {
      console.warn('[flow-ops] revoke-other-sessions failed:', (data as { error?: string }).error);
    }
  } catch (e) {
    logRevokeFailure(e);
  }
}
