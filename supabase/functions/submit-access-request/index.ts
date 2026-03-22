import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
interface HitRecord {
  timestamps: number[];
}

const store = new Map<string, HitRecord>();

const CLEANUP_INTERVAL_MS = 60_000; // prune stale keys every 60 s
let lastCleanup = Date.now();

function pruneStale(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, record] of store) {
    record.timestamps = record.timestamps.filter((t) => t > cutoff);
    if (record.timestamps.length === 0) store.delete(key);
  }
}

type RateLimitConfig = {
  maxRequests: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | null;
};

function checkRateLimit(
  clientIp: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - config.windowMs;

  pruneStale(config.windowMs);

  let record = store.get(clientIp);
  if (!record) {
    record = { timestamps: [] };
    store.set(clientIp, record);
  }

  record.timestamps = record.timestamps.filter((t) => t > cutoff);

  if (record.timestamps.length >= config.maxRequests) {
    const oldestInWindow = record.timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  record.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - record.timestamps.length,
    retryAfterMs: null,
  };
}

function resolveClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

function rateLimitResponse(
  retryAfterMs: number,
  origin: string | null,
  corsHeaders: Record<string, string>,
): Response {
  const retryAfterSeconds = Math.ceil((retryAfterMs || 1000) / 1000);
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );
}

const RATE_LIMIT: RateLimitConfig = { maxRequests: 10, windowMs: 60_000 };

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

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

const resolveCorsHeaders = (origin: string | null) => {
  const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};

const json = (status: number, body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...resolveCorsHeaders(origin), 'Content-Type': 'application/json' },
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

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: resolveCorsHeaders(origin) });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }, origin);

  // --- Rate Limiting ---
  const clientIp = resolveClientIp(request);
  const rl = checkRateLimit(clientIp, RATE_LIMIT);
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfterMs ?? 1000, origin, resolveCorsHeaders(origin));
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

  if (rawRequestedRole === 'admin') {
    return json(403, { error: 'Admin access cannot be requested through invite flow.' }, origin);
  }

  const tokenHash = await sha256Hex(rawInviteToken);
  const { data: inviteRow, error: inviteError } = await adminClient
    .from('access_invites')
    .select('id, org_id, token_hash, expires_at, revoked_at, use_count, max_uses')
    .eq('token_hash', tokenHash)
    .maybeSingle<InviteRow>();

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
