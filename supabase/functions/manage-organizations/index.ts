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
type ClusterRole = 'cluster_admin' | 'cluster_operator' | 'viewer';

type ManageOrganizationsPayload = {
  action: 'bootstrap-cluster-admin' | 'list-cluster-admins' | 'provision-organization' | 'switch-active-org' | 'set-cluster-role' | 'delete-user' | 'reset-user-password' | 'list';
  org_id?: string;
  cluster_id?: string;
  target_user_id?: string;
  target_role?: DbRole | ClusterRole;
  new_password?: string;
  access_token?: string;
};

type ManagedAccount = {
  user_id: string;
  login_id: string | null;
  org_id: string | null;
  cluster_id: string | null;
  role: DbRole | ClusterRole;
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

const normalizeId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Missing Supabase function environment variables.' }, origin);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let payload: ManageOrganizationsPayload;
  try {
    payload = await request.json() as ManageOrganizationsPayload;
  } catch {
    return json(400, { error: 'Invalid JSON payload.' }, origin);
  }

  const headerBearerToken = parseBearerToken(request.headers.get('Authorization'));
  const payloadBearerToken = (payload.access_token ?? '').trim() || null;
  const bearerToken = headerBearerToken || payloadBearerToken;
  if (!bearerToken) {
    return json(401, { error: 'Missing authentication token. Please sign in.' }, origin);
  }

  const { data: authUserData, error: authUserError } = await adminClient.auth.getUser(bearerToken);
  if (authUserError || !authUserData.user) {
    return json(401, { error: 'Invalid or expired user session. Please sign in again.' }, origin);
  }

  const callerUserId = authUserData.user.id;

  // Action: bootstrap-cluster-admin (Publicly available to signed-in users with no cluster)
  if (payload.action === 'bootstrap-cluster-admin') {
    const { data: existingMemberships, error: membershipError } = await adminClient
      .from('cluster_memberships')
      .select('id, cluster_id')
      .eq('user_id', callerUserId);

    // Cross-validate: membership must reference a real cluster row to count as bootstrapped
    if (!membershipError && existingMemberships && existingMemberships.length > 0) {
      const clusterIds = existingMemberships.map((m: any) => m.cluster_id).filter(Boolean);
      if (clusterIds.length > 0) {
        const { data: realClusters } = await adminClient
          .from('clusters')
          .select('id')
          .in('id', clusterIds);
        if (realClusters && realClusters.length > 0) {
          return json(200, { ok: true, message: 'Cluster already bootstrapped.' }, origin);
        }
      }
      // Orphaned membership rows — allow re-bootstrap by falling through
    }

    const clusterId = crypto.randomUUID();
    const orgId = crypto.randomUUID();

    // 1. Create Cluster
    const { error: clusterError } = await adminClient
      .from('clusters')
      .insert({ id: clusterId, name: 'Default Cluster', created_by: callerUserId });

    if (clusterError) return json(400, { error: `Cluster creation failed: ${clusterError.message}` }, origin);

    // 2. Create Organization
    const { error: orgError } = await adminClient
      .from('organizations')
      .insert({ id: orgId, cluster_id: clusterId, name: 'Default Org' });

    if (orgError) return json(400, { error: `Organization creation failed: ${orgError.message}` }, origin);

    // 3. Create memberships
    await adminClient.from('cluster_memberships').insert({
      user_id: callerUserId,
      cluster_id: clusterId,
      role: 'cluster_admin'
    });

    await ensureOrgMembership(adminClient, callerUserId, orgId, 'admin', { isDefaultOrg: true });

    // 4. Update Profile
    await adminClient.from('profiles').update({
      active_cluster_id: clusterId,
      active_org_id: orgId
    }).eq('id', callerUserId);

    return json(200, { ok: true, cluster_id: clusterId, org_id: orgId }, origin);
  }

  // Load Authority Context
  let authority;
  try {
    authority = await getCallerAuthorityContext(adminClient, callerUserId, {
      requestedOrgId: normalizeId(payload.org_id),
    });
  } catch (error) {
    return json(403, { error: error instanceof Error ? error.message : 'Unable to resolve authority.' }, origin);
  }

  if (!authority.isAdmin && !authority.isPlatformAdmin) {
    return json(403, { error: 'Administrative privileges required.' }, origin);
  }

  // Action: provision-organization
  if (payload.action === 'provision-organization') {
    const clusterId = normalizeId(payload.cluster_id) ?? authority.clusterId;
    if (!clusterId) return json(400, { error: 'cluster_id is required for provisioning.' }, origin);

    // Verify caller has access to target cluster
    if (!authority.isPlatformAdmin && clusterId !== authority.clusterId) {
      const { data: isClusterAdmin } = await adminClient
        .from('cluster_memberships')
        .select('id')
        .eq('user_id', callerUserId)
        .eq('cluster_id', clusterId)
        .eq('role', 'cluster_admin')
        .maybeSingle();
      
      if (!isClusterAdmin) return json(403, { error: 'Access denied to target cluster.' }, origin);
    }

    const orgId = crypto.randomUUID();
    const { error: orgError } = await adminClient
      .from('organizations')
      .insert({ id: orgId, cluster_id: clusterId, name: 'New Workspace' });

    if (orgError) return json(400, { error: `Provisioning failed: ${orgError.message}` }, origin);

    // Automatically make the caller an admin of the new org
    await ensureOrgMembership(adminClient, callerUserId, orgId, 'admin');

    return json(200, { ok: true, org_id: orgId }, origin);
  }

  // Action: switch-active-org
  if (payload.action === 'switch-active-org') {
    const requestedOrgId = normalizeId(payload.org_id);
    if (!requestedOrgId) return json(400, { error: 'org_id is required.' }, origin);

    // Verify access
    if (!authority.managedOrgIds.includes(requestedOrgId) && !authority.isPlatformAdmin) {
      return json(403, { error: 'No access to target organization.' }, origin);
    }

    const { data: orgData } = await adminClient
      .from('organizations')
      .select('cluster_id')
      .eq('id', requestedOrgId)
      .maybeSingle();

    await adminClient.from('profiles').update({
      active_org_id: requestedOrgId,
      active_cluster_id: orgData?.cluster_id ?? null
    }).eq('id', callerUserId);

    return json(200, { ok: true, org_id: requestedOrgId, cluster_id: orgData?.cluster_id }, origin);
  }

  // Action: list-cluster-admins
  if (payload.action === 'list-cluster-admins') {
    const clusterId = normalizeId(payload.cluster_id) ?? authority.clusterId;
    if (!clusterId) return json(400, { error: 'cluster_id is required.' }, origin);

    const { data: admins, error: adminError } = await adminClient
      .from('cluster_memberships')
      .select('user_id, role, created_at, profiles(id, active_org_id)')
      .eq('cluster_id', clusterId);

    if (adminError) return json(400, { error: adminError.message }, origin);

    const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers();
    const emailMap = new Map(authUsers.map((u: any) => [u.id, u.email]));
    const result = (admins ?? []).map((a: any) => ({
      user_id: a.user_id,
      email: emailMap.get(a.user_id) ?? null,
      role: a.role,
      active_org_id: (a.profiles as any)?.active_org_id || null,
      created_at: a.created_at
    }));

    return json(200, { ok: true, admins: result }, origin);
  }

    // Action: set-cluster-role
    if (payload.action === 'set-cluster-role') {
      const clusterId = normalizeId(payload.cluster_id) ?? authority.clusterId;
      const targetUserId = normalizeId(payload.target_user_id);
      const role = payload.target_role as ClusterRole;

      if (!clusterId || !targetUserId || !role) return json(400, { error: 'Missing parameters.' }, origin);

      // Guard 1: Prevent self-demotion
      if (targetUserId === callerUserId && role !== 'cluster_admin') {
        return json(403, { error: 'You cannot downgrade your own primary administrative access.' }, origin);
      }

      // Guard 2: Prevent demoting the last admin
      if (role !== 'cluster_admin') {
        const { data: admins } = await adminClient
          .from('cluster_memberships')
          .select('user_id')
          .eq('cluster_id', clusterId)
          .eq('role', 'cluster_admin');
        
        if (admins && admins.length <= 1 && admins.some((a: any) => a.user_id === targetUserId)) {
          return json(403, { error: 'Cannot downgrade the last remaining cluster admin.' }, origin);
        }
      }

      const { error: upsertError } = await adminClient
        .from('cluster_memberships')
        .upsert({
          user_id: targetUserId,
          cluster_id: clusterId,
          role: role
        }, { onConflict: 'user_id,cluster_id' });

      if (upsertError) return json(400, { error: upsertError.message }, origin);

      return json(200, { ok: true }, origin);
    }

    // Action: delete-user (Shared implementation)
    if (payload.action === 'delete-user') {
      const targetUserId = normalizeId(payload.target_user_id);
      const clusterId = normalizeId(payload.cluster_id) ?? authority.clusterId;

      if (!targetUserId) return json(400, { error: 'Invalid target_user_id.' }, origin);
      if (targetUserId === callerUserId) {
        return json(403, { error: 'You cannot remove your own administrative access.' }, origin);
      }

      // Guard: Prevent deleting the last admin
      if (clusterId) {
        const { data: admins } = await adminClient
          .from('cluster_memberships')
          .select('user_id')
          .eq('cluster_id', clusterId)
          .eq('role', 'cluster_admin');
        
        if (admins && admins.length <= 1 && admins.some((a: any) => a.user_id === targetUserId)) {
          return json(403, { error: 'Cannot remove the last remaining cluster admin.' }, origin);
        }
      }

      // Basic scope check for now - improve if needed
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (deleteError) return json(400, { error: deleteError.message }, origin);

      return json(200, { ok: true }, origin);
    }

    // Action: reset-user-password
    if (payload.action === 'reset-user-password') {
      const targetUserId = normalizeId(payload.target_user_id);
      const newPassword = payload.new_password; 
      
      if (!targetUserId) {
        return json(400, { error: 'target_user_id is required.' }, origin);
      }

      if (targetUserId === callerUserId) {
        return json(400, { error: 'Use personal settings for self-service password updates.' }, origin);
      }

      if (!authority.isPlatformAdmin) {
        const { data: membership } = await adminClient
          .from('cluster_memberships')
          .select('cluster_id')
          .eq('user_id', targetUserId)
          .eq('cluster_id', authority.clusterId)
          .maybeSingle();

        if (!membership) {
          return json(403, { error: 'Target user is outside of your administrative scope.' }, origin);
        }
      }

      if (newPassword) {
        const { error: resetError } = await adminClient.auth.admin.updateUserById(
          targetUserId,
          { password: newPassword }
        );
        if (resetError) return json(400, { error: resetError.message }, origin);
        return json(200, { ok: true, message: 'Password updated.' }, origin);
      }

      // Default to sending reset email via admin API context
      const { data: targetUser } = await adminClient.auth.admin.getUserById(targetUserId);
      if (!targetUser?.user?.email) return json(404, { error: 'User email not found.' }, origin);

      const { error: sendError } = await adminClient.auth.resetPasswordForEmail(targetUser.user.email);
      if (sendError) return json(400, { error: sendError.message }, origin);

      return json(200, { ok: true, message: 'Reset email sent.' }, origin);
    }

  // Default Action: list (all organizations and users in scope)
  const { data: profiles, error: profileError } = await adminClient
    .from('profiles')
    .select('id, active_org_id, active_cluster_id, created_at')
    .in('active_org_id', authority.managedOrgIds);

  if (profileError) return json(400, { error: profileError.message }, origin);

  const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers();
  const emailMap = new Map(authUsers.map((u: any) => [u.id, u.email]));

  const accounts = (profiles ?? []).map((p: any) => ({
    user_id: p.id,
    login_id: emailMap.get(p.id) ?? null,
    org_id: p.active_org_id,
    cluster_id: p.active_cluster_id,
    role: 'unknown', // Map from memberships if needed
    created_at: p.created_at
  }));

  return json(200, {
    ok: true,
    cluster_id: authority.clusterId,
    managed_org_ids: authority.managedOrgIds,
    accounts,
  }, origin);
});