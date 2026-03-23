import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
interface HitRecord {
  timestamps: number[];
}

const store = new Map<string, HitRecord>();

const CLEANUP_INTERVAL_MS = 60_000;
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

const RATE_LIMIT: RateLimitConfig = { maxRequests: 30, windowMs: 60_000 };

type DbRole = 'admin' | 'operator' | 'viewer';

type ManageMetaOrgAdminsPayload = {
  action: 'list' | 'set-role' | 'delete-user' | 'list-org-contexts' | 'switch-org-context' | 'provision-org-context';
  org_id?: string;
  target_user_id?: string;
  target_role?: DbRole;
  access_token?: string;
};

type ManagedAccount = {
  user_id: string;
  login_id: string | null;
  org_id: string | null;
  meta_org_id: string | null;
  role: DbRole;
  member_id: string | null;
  member_name: string | null;
  created_at: string | null;
};

const json = (status: number, body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  });

const parseBearerToken = (headerValue: string | null): string | null => {
  if (!headerValue) return null;
  const lower = headerValue.toLowerCase();
  if (!lower.startsWith('bearer ')) return null;
  return headerValue.slice(7).trim();
};

const normalizeOrgId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeRole = (value: unknown): DbRole | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'admin' || normalized === 'operator' || normalized === 'viewer') {
    return normalized;
  }
  return null;
};

const upsertOrgMetaMapping = async (adminClient: ReturnType<typeof createClient>, orgId: string, metaOrgId: string) => {
  const { error } = await adminClient
    .from('org_meta_mapping')
    .upsert({ org_id: orgId, meta_org_id: metaOrgId });

  if (error) {
    throw new Error(`Unable to persist org/meta mapping: ${error.message}`);
  }
};

const dedupeOrgIds = (values: Array<string | null | undefined>) => Array.from(new Set(
  values.filter((value): value is string => typeof value === 'string' && value.length > 0),
));

const loadClusterContext = async (
  adminClient: ReturnType<typeof createClient>,
  callerUserId: string,
  requestedOrgId?: string,
) => {
  const { data: callerRoleData, error: callerRoleError } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', callerUserId)
    .single();

  if (callerRoleError || !callerRoleData) {
    throw new Error('Caller role not found in user_roles.');
  }

  if (callerRoleData.role !== 'admin') {
    throw new Error('Only admin accounts can manage meta-org admins.');
  }

  const { data: callerProfileData, error: callerProfileError } = await adminClient
    .from('profiles')
    .select('org_id, meta_org_id')
    .eq('id', callerUserId)
    .maybeSingle();

  if (callerProfileError) {
    throw new Error(`Unable to resolve caller profile: ${callerProfileError.message}`);
  }

  const callerOrgId = callerProfileData?.org_id ?? requestedOrgId ?? null;
  let metaOrgId = callerProfileData?.meta_org_id ?? null;

  if (!metaOrgId && callerOrgId) {
    const { data: mappingData, error: mappingError } = await adminClient
      .from('org_meta_mapping')
      .select('meta_org_id')
      .eq('org_id', callerOrgId)
      .maybeSingle();

    if (mappingError) {
      throw new Error(`Unable to resolve org cluster mapping: ${mappingError.message}`);
    }

    metaOrgId = mappingData?.meta_org_id ?? null;
  }

  let managedOrgIds: string[] = [];
  if (metaOrgId) {
    const { data: mappingRows, error: mappingRowsError } = await adminClient
      .from('org_meta_mapping')
      .select('org_id')
      .eq('meta_org_id', metaOrgId);

    if (mappingRowsError) {
      throw new Error(`Unable to resolve managed orgs: ${mappingRowsError.message}`);
    }

    managedOrgIds = (mappingRows ?? [])
      .map((row) => row.org_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  if (callerOrgId && !managedOrgIds.includes(callerOrgId)) {
    managedOrgIds.unshift(callerOrgId);
  }

  managedOrgIds = Array.from(new Set(managedOrgIds));

  return {
    callerOrgId,
    metaOrgId,
    managedOrgIds,
  };
};

Deno.serve(async (request) => {
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

  let payload: ManageMetaOrgAdminsPayload;
  try {
    payload = await request.json() as ManageMetaOrgAdminsPayload;
  } catch {
    return json(400, { error: 'Invalid JSON payload.' }, origin);
  }

  const headerBearerToken = parseBearerToken(request.headers.get('Authorization'));
  const payloadBearerToken = (payload.access_token ?? '').trim() || null;
  const bearerToken = payloadBearerToken || headerBearerToken;
  if (!bearerToken) {
    return json(401, { error: 'Missing bearer token.' }, origin);
  }

  const { data: authUserData, error: authUserError } = await adminClient.auth.getUser(bearerToken);
  if (authUserError || !authUserData.user) {
    return json(401, { error: 'Unable to resolve authenticated user.' }, origin);
  }

  const callerUserId = authUserData.user.id;

  let clusterContext;
  try {
    clusterContext = await loadClusterContext(adminClient, callerUserId, normalizeOrgId(payload.org_id) ?? undefined);
  } catch (error) {
    return json(403, { error: error instanceof Error ? error.message : 'Unable to resolve admin scope.' }, origin);
  }

  if (payload.action === 'list-org-contexts') {
    if (clusterContext.metaOrgId === null) {
      const { data: workspaceOrgRows, error: workspaceOrgRowsError } = await adminClient
        .from('workspaces')
        .select('org_id')
        .not('org_id', 'is', null);

      if (workspaceOrgRowsError) {
        return json(400, { error: `Unable to load workspace orgs: ${workspaceOrgRowsError.message}` }, origin);
      }

      const { data: mappedOrgRows, error: mappedOrgRowsError } = await adminClient
        .from('org_meta_mapping')
        .select('org_id');

      if (mappedOrgRowsError) {
        return json(400, { error: `Unable to load mapped orgs: ${mappedOrgRowsError.message}` }, origin);
      }

      const { data: profileOrgRows, error: profileOrgRowsError } = await adminClient
        .from('profiles')
        .select('org_id')
        .not('org_id', 'is', null);

      if (profileOrgRowsError) {
        return json(400, { error: `Unable to load profile orgs: ${profileOrgRowsError.message}` }, origin);
      }

      const orgs = dedupeOrgIds([
        ...(workspaceOrgRows ?? []).map((row) => row.org_id),
        ...(mappedOrgRows ?? []).map((row) => row.org_id),
        ...(profileOrgRows ?? []).map((row) => row.org_id),
      ]);

      return json(200, {
        ok: true,
        meta_org_id: clusterContext.metaOrgId,
        managed_org_ids: orgs,
      }, origin);
    }

    return json(200, {
      ok: true,
      meta_org_id: clusterContext.metaOrgId,
      managed_org_ids: clusterContext.managedOrgIds,
    }, origin);
  }

  if (payload.action === 'switch-org-context') {
    const requestedOrgId = normalizeOrgId(payload.org_id);

    if (requestedOrgId !== null && clusterContext.metaOrgId !== null && !clusterContext.managedOrgIds.includes(requestedOrgId)) {
      return json(403, { error: 'Target organization is outside your managed org scope.' }, origin);
    }

    const { error: profileUpdateError } = await adminClient
      .from('profiles')
      .update({ org_id: requestedOrgId })
      .eq('id', callerUserId);

    if (profileUpdateError) {
      return json(400, { error: `Unable to switch organization context: ${profileUpdateError.message}` }, origin);
    }

    return json(200, {
      ok: true,
      org_id: requestedOrgId,
      meta_org_id: clusterContext.metaOrgId,
    }, origin);
  }

  if (payload.action === 'provision-org-context') {
    const requestedOrgId = normalizeOrgId(payload.org_id) ?? crypto.randomUUID();
    const provisionedMetaOrgId = crypto.randomUUID();

    const { error: profileUpdateError } = await adminClient
      .from('profiles')
      .update({
        org_id: requestedOrgId,
        meta_org_id: provisionedMetaOrgId,
      })
      .eq('id', callerUserId);

    if (profileUpdateError) {
      return json(400, { error: `Unable to provision organization context: ${profileUpdateError.message}` }, origin);
    }

    try {
      await upsertOrgMetaMapping(adminClient, requestedOrgId, provisionedMetaOrgId);
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : 'Unable to persist fresh workspace mapping.' }, origin);
    }

    return json(200, {
      ok: true,
      org_id: requestedOrgId,
      meta_org_id: provisionedMetaOrgId,
      managed_org_ids: [requestedOrgId],
    }, origin);
  }

  if (payload.action === 'set-role') {
    const targetUserId = payload.target_user_id?.trim();
    const targetRole = normalizeRole(payload.target_role);

    if (!targetUserId || !targetRole) {
      return json(400, { error: 'target_user_id and a valid target_role are required.' }, origin);
    }

    if (targetRole === 'viewer') {
      return json(400, { error: 'Use the invite/request workflow for viewer accounts.' }, origin);
    }

    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from('profiles')
      .select('id, org_id, meta_org_id')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetProfileError) {
      return json(400, { error: `Unable to resolve target profile: ${targetProfileError.message}` }, origin);
    }

    if (!targetProfile?.id || !targetProfile.org_id) {
      return json(404, { error: 'Target user profile was not found or is missing an org assignment.' }, origin);
    }

    const targetInScope = clusterContext.managedOrgIds.includes(targetProfile.org_id)
      || (clusterContext.metaOrgId !== null && targetProfile.meta_org_id === clusterContext.metaOrgId);

    if (!targetInScope) {
      return json(403, { error: 'Target account is outside your managed org scope.' }, origin);
    }

    let resolvedMetaOrgId = clusterContext.metaOrgId;
    if (targetRole === 'admin' && !resolvedMetaOrgId) {
      resolvedMetaOrgId = crypto.randomUUID();

      if (clusterContext.callerOrgId) {
        const { error: callerProfileUpdateError } = await adminClient
          .from('profiles')
          .update({ meta_org_id: resolvedMetaOrgId })
          .eq('id', callerUserId);

        if (callerProfileUpdateError) {
          return json(400, { error: `Unable to initialize caller meta-org: ${callerProfileUpdateError.message}` }, origin);
        }

        await upsertOrgMetaMapping(adminClient, clusterContext.callerOrgId, resolvedMetaOrgId);
      }
    }

    const targetProfilePatch: Record<string, string | null> = {};
    if (targetRole === 'admin') {
      targetProfilePatch.meta_org_id = resolvedMetaOrgId;
      if (resolvedMetaOrgId) {
        await upsertOrgMetaMapping(adminClient, targetProfile.org_id, resolvedMetaOrgId);
      }
    }

    if (Object.keys(targetProfilePatch).length > 0) {
      const { error: profileUpdateError } = await adminClient
        .from('profiles')
        .update(targetProfilePatch)
        .eq('id', targetUserId);

      if (profileUpdateError) {
        return json(400, { error: `Unable to update target profile: ${profileUpdateError.message}` }, origin);
      }
    }

    const { error: roleUpsertError } = await adminClient
      .from('user_roles')
      .upsert({ user_id: targetUserId, role: targetRole });

    if (roleUpsertError) {
      return json(400, { error: `Unable to update target role: ${roleUpsertError.message}` }, origin);
    }

    const users = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const targetUser = users.data.users.find((item) => item.id === targetUserId);
    if (targetUser) {
      await adminClient.auth.admin.updateUserById(targetUserId, {
        user_metadata: { ...(targetUser.user_metadata ?? {}), app_role: targetRole },
      });
    }

    clusterContext = await loadClusterContext(adminClient, callerUserId, payload.org_id);
  }

  if (payload.action === 'delete-user') {
    const targetUserId = payload.target_user_id?.trim();
    if (!targetUserId) {
      return json(400, { error: 'target_user_id is required for deletion.' }, origin);
    }

    if (targetUserId === callerUserId) {
      return json(400, { error: 'You cannot delete your own account from this interface.' }, origin);
    }

    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from('profiles')
      .select('id, org_id, meta_org_id')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetProfileError) {
      return json(400, { error: `Unable to resolve target profile: ${targetProfileError.message}` }, origin);
    }

    if (!targetProfile?.id || !targetProfile.org_id) {
      return json(404, { error: 'Target user profile was not found.' }, origin);
    }

    const targetInScope = clusterContext.managedOrgIds.includes(targetProfile.org_id)
      || (clusterContext.metaOrgId !== null && targetProfile.meta_org_id === clusterContext.metaOrgId);

    if (!targetInScope) {
      return json(403, { error: 'Target account is outside your managed org scope.' }, origin);
    }

    // Hierarchical Purge
    await adminClient.from('members').delete().eq('user_id', targetUserId);
    await adminClient.from('user_roles').delete().eq('user_id', targetUserId);
    await adminClient.from('profiles').delete().eq('id', targetUserId);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);

    if (deleteError) {
      return json(400, { error: `Auth deletion failed: ${deleteError.message}` }, origin);
    }

    clusterContext = await loadClusterContext(adminClient, callerUserId, payload.org_id);
  }

  const managedOrgIds = clusterContext.managedOrgIds;
  if (managedOrgIds.length === 0) {
    return json(200, {
      ok: true,
      meta_org_id: clusterContext.metaOrgId,
      managed_org_ids: [],
      accounts: [],
    }, origin);
  }

  const { data: profileRows, error: profileRowsError } = await adminClient
    .from('profiles')
    .select('id, org_id, meta_org_id, created_at')
    .in('org_id', managedOrgIds);

  if (profileRowsError) {
    return json(400, { error: `Unable to load managed profiles: ${profileRowsError.message}` }, origin);
  }

  const profileIds = (profileRows ?? []).map((row) => row.id).filter((value): value is string => Boolean(value));
  const { data: roleRows, error: roleRowsError } = await adminClient
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', profileIds);

  if (roleRowsError) {
    return json(400, { error: `Unable to load managed roles: ${roleRowsError.message}` }, origin);
  }

  const { data: memberRows, error: memberRowsError } = await adminClient
    .from('members')
    .select('user_id, member_id, name, org_id')
    .in('org_id', managedOrgIds);

  if (memberRowsError) {
    return json(400, { error: `Unable to load managed member rows: ${memberRowsError.message}` }, origin);
  }

  const authUsers = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailByUserId = new Map(authUsers.data.users.map((item) => [item.id, item.email ?? null]));
  const roleByUserId = new Map(roleRows?.map((item) => [item.user_id, item.role as DbRole]) ?? []);
  const memberByUserId = new Map(memberRows?.map((item) => [item.user_id, item]) ?? []);

  const accounts: ManagedAccount[] = (profileRows ?? [])
    .map((profileRow) => {
      const matchedMember = memberByUserId.get(profileRow.id);
      return {
        user_id: profileRow.id,
        login_id: emailByUserId.get(profileRow.id) ?? null,
        org_id: profileRow.org_id ?? null,
        meta_org_id: profileRow.meta_org_id ?? null,
        role: roleByUserId.get(profileRow.id) ?? 'viewer',
        member_id: matchedMember?.member_id ?? null,
        member_name: matchedMember?.name ?? null,
        created_at: profileRow.created_at ?? null,
      };
    })
    .sort((left, right) => {
      if (left.role === right.role) {
        return (left.login_id ?? '').localeCompare(right.login_id ?? '');
      }
      return left.role === 'admin' ? -1 : 1;
    });

  return json(200, {
    ok: true,
    meta_org_id: clusterContext.metaOrgId,
    managed_org_ids: managedOrgIds,
    accounts,
  }, origin);
});