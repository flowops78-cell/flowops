/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ensureOrgMembership, getCallerAuthorityContext, syncOrgGraph } from '../_shared/auth-model.ts';
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

type OrgIdRow = {
  org_id: string | null;
};

type MembershipScopeRow = {
  org_id: string;
  is_default_org: boolean;
  orgs?: { cluster_id?: string | null } | null;
};

type ProfileListRow = {
  id: string;
  org_id: string | null;
  meta_org_id: string | null;
  created_at: string | null;
};

type RoleListRow = {
  user_id: string;
  role: DbRole;
};

type MembershipRoleRow = {
  user_id: string;
  org_id: string;
  role: DbRole;
  is_default_org: boolean;
};

type MemberListRow = {
  user_id: string | null;
  member_id: string | null;
  name: string | null;
  org_id: string | null;
};

type AuthUserSummary = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
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
  const authority = await getCallerAuthorityContext(adminClient, callerUserId, {
    requestedOrgId: requestedOrgId ?? null,
  });

  if (!authority.isAdmin) {
    throw new Error('Only admin accounts can manage meta-org admins.');
  }

  return {
    callerOrgId: authority.currentOrgId,
    metaOrgId: authority.metaOrgId,
    managedOrgIds: authority.managedOrgIds,
    isPlatformAdmin: authority.isPlatformAdmin,
    source: authority.source,
  };
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

  let payload: ManageMetaOrgAdminsPayload;
  try {
    payload = await request.json() as ManageMetaOrgAdminsPayload;
  } catch {
    return json(400, { error: 'Invalid JSON payload.' }, origin);
  }

  const headerBearerToken = parseBearerToken(request.headers.get('Authorization'));
  const payloadBearerToken = (payload.access_token ?? '').trim() || null;
  const bearerToken = headerBearerToken || payloadBearerToken;
  if (!bearerToken) {
    return json(401, { error: 'Missing authentication token. Please sign in.' }, origin);
  }

  // Detect if only anon key is provided
  if (bearerToken === Deno.env.get('SUPABASE_ANON_KEY')) {
    return json(401, { error: 'User session required (only anon key provided). Please refresh your session.' }, origin);
  }

  const { data: authUserData, error: authUserError } = await adminClient.auth.getUser(bearerToken);
  if (authUserError || !authUserData.user) {
    return json(401, { error: 'Invalid or expired user session. Please sign in again.' }, origin);
  }

  const callerUserId = authUserData.user.id;

  if (payload.action === 'provision-org-context') {
    const requestedOrgId = normalizeOrgId(payload.org_id) ?? crypto.randomUUID();
    const provisionedMetaOrgId = crypto.randomUUID();

    // 1. Create the cluster record
    const { error: clusterError } = await adminClient
      .from('org_clusters')
      .insert({ id: provisionedMetaOrgId, name: 'Default Cluster' });

    if (clusterError) {
      return json(400, { error: `Unable to initialize cluster: ${clusterError.message}` }, origin);
    }

    // 2. Create the org record
    const { error: orgError } = await adminClient
      .from('orgs')
      .insert({ id: requestedOrgId, name: 'Default Organization', cluster_id: provisionedMetaOrgId });

    if (orgError) {
      return json(400, { error: `Unable to initialize organization: ${orgError.message}` }, origin);
    }

    // 3. Update the profile
    const { error: profileUpdateError } = await adminClient
      .from('profiles')
      .update({
        org_id: requestedOrgId,
        meta_org_id: provisionedMetaOrgId,
      })
      .eq('id', callerUserId);

    if (profileUpdateError) {
      // If profile doesn't exist, try to insert it (though it should exist)
      const { error: profileInsertError } = await adminClient
        .from('profiles')
        .upsert({
          id: callerUserId,
          org_id: requestedOrgId,
          meta_org_id: provisionedMetaOrgId,
        });
      
      if (profileInsertError) {
        return json(400, { error: `Unable to provision organization context: ${profileUpdateError.message}` }, origin);
      }
    }

    try {
      await upsertOrgMetaMapping(adminClient, requestedOrgId, provisionedMetaOrgId);
      await syncOrgGraph(adminClient, requestedOrgId, provisionedMetaOrgId);
      await ensureOrgMembership(adminClient, callerUserId, requestedOrgId, 'admin', {
        isDefaultOrg: true,
        status: 'active',
      });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : 'Unable to persist fresh workspace mapping.' }, origin);
    }

    let clusterContext;
    try {
      clusterContext = await loadClusterContext(adminClient, callerUserId, requestedOrgId);
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : 'Unable to reload provisioned admin scope.' }, origin);
    }

    return json(200, {
      ok: true,
      org_id: requestedOrgId,
      meta_org_id: provisionedMetaOrgId,
      managed_org_ids: clusterContext.managedOrgIds,
    }, origin);
  }

  let clusterContext;
  try {
    clusterContext = await loadClusterContext(adminClient, callerUserId, normalizeOrgId(payload.org_id) ?? undefined);
    console.log(`[manage-meta-org-admins] Context loaded for ${callerUserId}: isAdmin=${!!clusterContext.metaOrgId || clusterContext.isPlatformAdmin}, managedOrgs=${clusterContext.managedOrgIds.length}`);
  } catch (error) {
    console.error(`[manage-meta-org-admins] Failed to load cluster context for ${callerUserId}:`, error);
    return json(403, { error: error instanceof Error ? error.message : 'Unable to resolve admin scope.' }, origin);
  }

  if (payload.action === 'list-org-contexts' || payload.action === 'list' || (payload as any).action === 'list-meta-org-admins') {
    if (clusterContext.isPlatformAdmin || clusterContext.metaOrgId === null) {
      const { data: workspaceOrgRows, error: workspaceOrgRowsError } = await adminClient
        .from('workspaces')
        .select('org_id')
        .not('org_id', 'is', null);

      if (workspaceOrgRowsError) {
        return json(400, { error: `Unable to load workspace orgs: ${workspaceOrgRowsError.message}` }, origin);
      }

      const { data: orgRows, error: orgRowsError } = await adminClient
        .from('orgs')
        .select('id');

      if (orgRowsError) {
        return json(400, { error: `Unable to load org graph: ${orgRowsError.message}` }, origin);
      }

      const { data: profileOrgRows, error: profileOrgRowsError } = await adminClient
        .from('profiles')
        .select('org_id')
        .not('org_id', 'is', null);

      if (profileOrgRowsError) {
        return json(400, { error: `Unable to load profile orgs: ${profileOrgRowsError.message}` }, origin);
      }

      const orgs = dedupeOrgIds([
        ...((workspaceOrgRows ?? []) as OrgIdRow[]).map((row: OrgIdRow) => row.org_id),
        ...((orgRows ?? []) as Array<{ id: string | null }>).map((row) => row.id),
        ...((profileOrgRows ?? []) as OrgIdRow[]).map((row: OrgIdRow) => row.org_id),
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

    if (requestedOrgId) {
      try {
        await ensureOrgMembership(adminClient, callerUserId, requestedOrgId, 'admin', {
          isDefaultOrg: true,
          status: 'active',
        });
      } catch (error) {
        return json(400, { error: error instanceof Error ? error.message : 'Unable to switch membership context.' }, origin);
      }
    }

    return json(200, {
      ok: true,
      org_id: requestedOrgId,
      meta_org_id: clusterContext.metaOrgId,
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

    try {
      await ensureOrgMembership(adminClient, targetUserId, targetProfile.org_id, targetRole, {
        status: 'active',
      });
      if (targetRole === 'admin' && resolvedMetaOrgId) {
        await syncOrgGraph(adminClient, targetProfile.org_id, resolvedMetaOrgId);
      }
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : 'Unable to sync target membership role.' }, origin);
    }

    const users = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) {
      console.error(`[manage-meta-org-admins] Failed to list users during role update:`, users.error);
    } else if (users.data?.users) {
      const targetUser = users.data.users.find((item: AuthUserSummary) => item.id === targetUserId);
      if (targetUser) {
        await adminClient.auth.admin.updateUserById(targetUserId, {
          user_metadata: { ...(targetUser.user_metadata ?? {}), app_role: targetRole },
        });
      }
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
    await adminClient.from('org_memberships').delete().eq('user_id', targetUserId);
    await adminClient.from('user_roles').delete().eq('user_id', targetUserId);
    await adminClient.from('profiles').delete().eq('id', targetUserId);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);

    if (deleteError) {
      return json(400, { error: `Auth deletion failed: ${deleteError.message}` }, origin);
    }

    clusterContext = await loadClusterContext(adminClient, callerUserId, payload.org_id);
  }

  const managedOrgIds = clusterContext.managedOrgIds;
  console.log(`[manage-meta-org-admins] Listing accounts for scope: ${managedOrgIds.length} orgs`);
  if (managedOrgIds.length === 0 && !clusterContext.isPlatformAdmin && clusterContext.metaOrgId !== null) {
    return json(200, {
      ok: true,
      meta_org_id: clusterContext.metaOrgId,
      managed_org_ids: [],
      accounts: [],
    }, origin);
  }

  const profileQuery = adminClient
    .from('profiles')
    .select('id, org_id, meta_org_id, created_at');

  const { data: profileRows, error: profileRowsError } = (clusterContext.isPlatformAdmin || clusterContext.metaOrgId === null)
    ? await profileQuery
    : await profileQuery.in('org_id', managedOrgIds);

  if (profileRowsError) {
    return json(400, { error: `Unable to load managed profiles: ${profileRowsError.message}` }, origin);
  }

  const typedProfileRows = (profileRows ?? []) as ProfileListRow[];
  const profileIds = typedProfileRows.map((row: ProfileListRow) => row.id).filter((value: string | null): value is string => Boolean(value));
  const [{ data: roleRows, error: roleRowsError }, { data: membershipRoleRows, error: membershipRoleRowsError }] = await Promise.all([
    adminClient
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', profileIds),
    adminClient
      .from('org_memberships')
      .select('user_id, org_id, role, is_default_org')
      .in('org_id', managedOrgIds),
  ]);

  if (roleRowsError) {
    return json(400, { error: `Unable to load managed roles: ${roleRowsError.message}` }, origin);
  }

  if (membershipRoleRowsError) {
    return json(400, { error: `Unable to load managed memberships: ${membershipRoleRowsError.message}` }, origin);
  }

  const { data: memberRows, error: memberRowsError } = await adminClient
    .from('members')
    .select('user_id, member_id, name, org_id')
    .in('org_id', managedOrgIds);

  if (memberRowsError) {
    return json(400, { error: `Unable to load managed member rows: ${memberRowsError.message}` }, origin);
  }

  const authUsers = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authUsers.error) {
    return json(400, { error: `Unable to list auth users: ${authUsers.error.message}` }, origin);
  }
  if (!authUsers.data?.users) {
    return json(400, { error: 'Auth user directory is currently unreachable. Please retry.' }, origin);
  }

  const emailByUserId = new Map<string, string | null>(
    authUsers.data.users.map((item: AuthUserSummary) => [item.id, typeof item.email === 'string' ? item.email : null]),
  );
  const roleByUserId = new Map(((roleRows ?? []) as RoleListRow[]).map((item: RoleListRow) => [item.user_id, item.role]));
  const roleByUserOrg = new Map(((membershipRoleRows ?? []) as MembershipRoleRow[]).map((item: MembershipRoleRow) => [`${item.user_id}:${item.org_id}`, item.role]));
  const memberByUserId = new Map(((memberRows ?? []) as MemberListRow[]).map((item: MemberListRow) => [item.user_id, item]));

  const accounts: ManagedAccount[] = typedProfileRows
    .map((profileRow: ProfileListRow) => {
      const matchedMember = memberByUserId.get(profileRow.id);
      return {
        user_id: profileRow.id,
        login_id: emailByUserId.get(profileRow.id) ?? null,
        org_id: profileRow.org_id ?? null,
        meta_org_id: profileRow.meta_org_id ?? null,
        role: roleByUserOrg.get(`${profileRow.id}:${profileRow.org_id ?? ''}`) ?? roleByUserId.get(profileRow.id) ?? 'viewer',
        member_id: matchedMember?.member_id ?? null,
        member_name: matchedMember?.name ?? null,
        created_at: profileRow.created_at ?? null,
      };
    })
    .sort((left: ManagedAccount, right: ManagedAccount) => {
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