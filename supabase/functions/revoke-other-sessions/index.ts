/// <reference path="../_shared/edge-runtime.d.ts" />

/**
 * Revokes all other GoTrue refresh sessions for the caller (scope "others").
 *
 * Security: `verify_jwt` is false at the gateway; we validate the Bearer access
 * token with `auth.getUser` (anon client) before calling admin APIs.
 *
 * POST + Authorization: Bearer <user_access_token>
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY), SB_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, resolveClientIp, rateLimitResponse } from '../_shared/rate-limiter.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

const RATE_LIMIT = { maxRequests: 40, windowMs: 60_000 };

const json = (status: number, body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  });

const parseBearer = (headerValue: string | null): string | null => {
  if (!headerValue) return null;
  const lower = headerValue.toLowerCase();
  if (!lower.startsWith('bearer ')) return null;
  const token = headerValue.slice(7).trim();
  return token || null;
};

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(origin) });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }, origin);

  const clientIp = resolveClientIp(request);
  const rl = checkRateLimit(clientIp, RATE_LIMIT);
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfterMs ?? 1000, origin, getCorsHeaders(origin));
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey =
    Deno.env.get('SUPABASE_ANON_KEY') ||
    Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY') ||
    Deno.env.get('VITE_SUPABASE_ANON_KEY');
  const serviceRoleKey =
    Deno.env.get('SB_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: 'Server misconfiguration.' }, origin);
  }

  const accessToken = parseBearer(request.headers.get('Authorization'));
  if (!accessToken) {
    return json(401, { error: 'Missing Authorization bearer token.' }, origin);
  }

  const verifyClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await verifyClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return json(401, { error: 'Invalid or expired session.' }, origin);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await adminClient.auth.admin.signOut(accessToken, 'others');

  if (error) {
    console.error('revoke-other-sessions: admin.signOut failed:', error.message);
    return json(401, { error: 'Unable to revoke other sessions.' }, origin);
  }

  return json(200, { ok: true }, origin);
});
