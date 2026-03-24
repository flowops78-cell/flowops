/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, resolveClientIp, rateLimitResponse } from '../_shared/rate-limiter.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

type StorageRole = 'admin' | 'operator' | 'viewer';

type InviteRow = {
  id: string;
  org_id: string;
  token_hash: string;
  expires_at: string | null;
  revoked_at: string | null;
  use_count: number;
  max_uses: number;
};

type RequestPayload = {
  invite_token: string;
  username: string;
  requested_role?: string | null;
};

type RequestableRole = Exclude<StorageRole, 'admin'>;

const json = (status: number, body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  });

const ROLE_DOMAIN_MAP: Record<StorageRole, string> = {
  admin: 'admin.os',
  operator: 'operator.os',
  viewer: 'viewer.os',
};

const normalizeRequestedRole = (value: unknown): RequestableRole => {
  if (typeof value !== 'string') return 'viewer';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'operator') return 'operator';
  return 'viewer';
};

const sha256Hex = async (input: string) => {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(origin) });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }, origin);

  // --- Rate Limiting ---
  const clientIp = resolveClientIp(request);
  const rl = checkRateLimit(clientIp, RATE_LIMIT);
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfterMs ?? 1000, origin, getCorsHeaders(origin));
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Missing Supabase function environment variables.' }, origin);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let payload: RequestPayload;
  try {
    payload = await request.json() as RequestPayload;
  } catch {
    return json(400, { error: 'Invalid JSON payload.' }, origin);
  }

  const rawInviteToken = (payload.invite_token ?? '').trim();
  const username = (payload.username ?? '').trim().toLowerCase();
  const requestedRole = normalizeRequestedRole(payload.requested_role);
  const rawRequestedRole = String(payload.requested_role ?? '').trim().toLowerCase();

  if (rawInviteToken.length < 16) {
    return json(400, { error: 'Invite token is invalid.' }, origin);
  }

  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    return json(400, { error: 'Username tag can only use lowercase letters, numbers, dot, underscore, and hyphen.' }, origin);
  }


  const tokenHash = await sha256Hex(rawInviteToken);
  const { data: inviteRowData, error: inviteError } = await adminClient
    .from('access_invites')
    .select('id, org_id, token_hash, expires_at, revoked_at, use_count, max_uses')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  const inviteRow = inviteRowData as InviteRow | null;

  if (inviteError) {
    return json(400, { error: `Unable to validate invite token: ${inviteError.message}` }, origin);
  }

  if (!inviteRow) {
    return json(404, { error: 'Invite token was not found.' }, origin);
  }

  if (inviteRow.revoked_at) {
    return json(403, { error: 'Invite token has been revoked.' }, origin);
  }

  if (inviteRow.expires_at && new Date(inviteRow.expires_at).getTime() < Date.now()) {
    return json(403, { error: 'Invite token has expired.' }, origin);
  }

  if (inviteRow.use_count >= inviteRow.max_uses) {
    return json(403, { error: 'Invite token has already been fully used.' }, origin);
  }

  const loginId = `${username}@${ROLE_DOMAIN_MAP[requestedRole]}`;

  const { error: insertError } = await adminClient
    .from('access_requests')
    .insert([
      {
        org_id: inviteRow.org_id,
        login_id: loginId,
        requested_role: requestedRole,
        status: 'pending',
      },
    ]);

  if (insertError) {
    return json(400, { error: insertError.message }, origin);
  }

  const { error: updateInviteError } = await adminClient
    .from('access_invites')
    .update({
      use_count: inviteRow.use_count + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', inviteRow.id);

  if (updateInviteError) {
    return json(400, { error: `Request created, but invite update failed: ${updateInviteError.message}` }, origin);
  }

  return json(200, {
    ok: true,
    login_id: loginId,
    requested_role: requestedRole,
  }, origin);
});
