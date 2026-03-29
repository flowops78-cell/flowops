/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ensureOrgMembership, getCallerAuthorityContext, syncOrgGraph } from '../_shared/auth-model.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimit, resolveClientIp, rateLimitResponse } from '../_shared/rate-limiter.ts';

const RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 };

type SupabaseAdmin = ReturnType<typeof createClient>;

/** Emails for specific auth user IDs only (avoids `listUsers` full-project scans). */
async function buildEmailMapForUserIds(
  adminClient: SupabaseAdmin,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string | null>();
  const batchSize = 15;
  for (let i = 0; i < unique.length; i += batchSize) {
    const slice = unique.slice(i, i + batchSize);
    const results = await Promise.all(slice.map((id) => adminClient.auth.admin.getUserById(id)));
    for (let j = 0; j < slice.length; j++) {
      map.set(slice[j], results[j].data?.user?.email ?? null);
    }
  }
  return map;
}

/**
 * Auth admin has no get-by-email; paginate until match (bounded) instead of loading all users into memory.
 */
async function findAuthUserIdByEmail(
  adminClient: SupabaseAdmin,
  email: string,
  maxPages = 100,
): Promise<string | null> {
  const target = email.toLowerCase().trim();
  let page = 1;
  for (let n = 0; n < maxPages; n++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u: { email?: string | null; id?: string }) =>
      u.email?.toLowerCase() === target,
    );
    if (hit?.id) return hit.id;
    if (data.nextPage != null && data.nextPage > page) {
      page = data.nextPage;
      continue;
    }
    break;
  }
  return null;
}

type DbRole = 'admin' | 'operator' | 'viewer';
type ClusterRole = 'cluster_admin' | 'cluster_operator' | 'viewer';

type ManageOrganizationsPayload = {
  action: 'bootstrap-cluster-admin' | 'list-cluster-admins' | 'provision-organization' | 'switch-active-org' | 'set-cluster-role' | 'delete-user' | 'reset-user-password' | 'update-organization-identity' | 'assign-org-admin' | 'list-all-accounts' | 'list';
  org_id?: string;
  cluster_id?: string;
  target_user_id?: string;
  target_email?: string;
  target_role?: DbRole | ClusterRole;
  new_password?: string;
  access_token?: string;
  name?: string;
  tag?: string;
  slug?: string;
  /** Required when Supabase secret `BOOTSTRAP_CLUSTER_INVITE_CODE` is set. */
  bootstrap_invite_code?: string;
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

function secureStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

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
  const serviceRoleKey = Deno.env.get('SB_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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

  // Hybrid Bypass for bootstrap-cluster-admin (Option C)
  // This allows the request to proceed if no token is present, but ONLY for bootstrapping.
  // Note: bootstrap-cluster-admin still requires callerUserId which usually needs a token.
  if (!bearerToken && payload.action !== 'bootstrap-cluster-admin') {
    return json(401, { error: 'Missing authentication token. Please sign in.' }, origin);
  }

  // If no bearerToken but bootstrapping, we'll try to find a user another way or return a specific error
  if (!bearerToken && payload.action === 'bootstrap-cluster-admin') {
    return json(401, { error: 'Bootstrap requires an authenticated session but no token was provided.' }, origin);
  }

  const { data: { user }, error: authError } = await adminClient.auth.getUser(bearerToken);

  if (authError || !user) {
    console.error('Auth Error Details:', authError);
    return json(401, { error: 'Authentication failed', details: authError?.message }, origin);
  }

  const callerUserId = user.id;

  // Action: bootstrap-cluster-admin (Publicly available to signed-in users with no cluster)
  if (payload.action === 'bootstrap-cluster-admin') {
    const requiredInvite = Deno.env.get('BOOTSTRAP_CLUSTER_INVITE_CODE')?.trim();
    if (requiredInvite && requiredInvite.length > 0) {
      const provided = (payload.bootstrap_invite_code ?? '').trim();
      if (!secureStringEqual(provided, requiredInvite)) {
        return json(403, { error: 'Invalid or missing cluster bootstrap code.' }, origin);
      }
    }

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

  if (!authority.isAdmin) {
    return json(403, { error: 'Administrative privileges required.' }, origin);
  }

  // Action: provision-organization
  if (payload.action === 'provision-organization') {
    const clusterId = normalizeId(payload.cluster_id) ?? authority.clusterId;
    if (!clusterId) return json(400, { error: 'cluster_id is required for provisioning.' }, origin);

    // Verify caller has access to target cluster
    if (clusterId !== authority.clusterId) {
      const { data: isClusterAdminRow } = await adminClient
        .from('cluster_memberships')
        .select('id')
        .eq('user_id', callerUserId)
        .eq('cluster_id', clusterId)
        .eq('role', 'cluster_admin')
        .maybeSingle();

      if (!isClusterAdminRow) return json(403, { error: 'Access denied to target cluster.' }, origin);
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
    if (!authority.managedOrgIds.includes(requestedOrgId)) {
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
    let clusterId = normalizeId(payload.cluster_id);
    const orgId = normalizeId(payload.org_id);

    if (!clusterId && orgId && authority.managedOrgIds.includes(orgId)) {
      const { data: orgData } = await adminClient
        .from('organizations')
        .select('cluster_id')
        .eq('id', orgId)
        .maybeSingle();
      if (orgData?.cluster_id) {
        clusterId = orgData.cluster_id;
      }
    }

    clusterId = clusterId ?? authority.clusterId;
    if (!clusterId) return json(400, { error: 'cluster_id is required.' }, origin);

    const { data: admins, error: adminError } = await adminClient
      .from('cluster_memberships')
      .select('user_id, role, created_at')
      .eq('cluster_id', clusterId);

    if (adminError) return json(400, { error: adminError.message }, origin);

    const profilesMap = new Map();
    if (admins && admins.length > 0) {
      const userIds = admins.map((a: any) => a.user_id);
      const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, active_org_id')
        .in('id', userIds);
      
      if (profiles) {
        profiles.forEach((p: any) => profilesMap.set(p.id, p));
      }
    }

    // Also fetch Organization-level administrators if orgId is provided
    let orgAdmins: any[] = [];
    if (orgId) {
      const { data: orgMems, error: orgMemError } = await adminClient
        .from('organization_memberships')
        .select('user_id, role, created_at')
        .eq('org_id', orgId)
        .in('role', ['admin', 'operator']);
      if (!orgMemError && orgMems) {
        orgAdmins = orgMems;
      }
    }

    const idsForEmail = new Set<string>();
    (admins ?? []).forEach((a: { user_id: string }) => idsForEmail.add(a.user_id));
    orgAdmins.forEach((o: { user_id: string }) => idsForEmail.add(o.user_id));
    const emailMap = await buildEmailMapForUserIds(adminClient, [...idsForEmail]);

    // Combine and normalize
    const combined = new Map<string, any>();

    // Add cluster members first
    (admins ?? []).forEach((a: any) => {
      combined.set(a.user_id, {
        user_id: a.user_id,
        email: emailMap.get(a.user_id) ?? null,
        role: a.role, // cluster_admin, etc.
        type: 'cluster',
        active_org_id: profilesMap.get(a.user_id)?.active_org_id || null,
        created_at: a.created_at
      });
    });

    // Add/Merge organization members
    orgAdmins.forEach((o: any) => {
      const existing = combined.get(o.user_id);
      if (existing) {
        // If they already have a cluster role, maybe keep it or note both
        existing.org_role = o.role;
      } else {
        combined.set(o.user_id, {
          user_id: o.user_id,
          email: emailMap.get(o.user_id) ?? null,
          role: o.role, // admin, operator
          type: 'organization',
          created_at: o.created_at
        });
      }
    });

    return json(200, { ok: true, admins: Array.from(combined.values()), cluster_id: clusterId }, origin);
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

      const { data: callerAdminClusters } = await adminClient
        .from('cluster_memberships')
        .select('cluster_id')
        .eq('user_id', callerUserId)
        .eq('role', 'cluster_admin');
      const adminClusterSet = new Set((callerAdminClusters ?? []).map((r: { cluster_id: string }) => r.cluster_id));
      const { data: targetClusterRows } = await adminClient
        .from('cluster_memberships')
        .select('cluster_id')
        .eq('user_id', targetUserId);
      const sharesAdminCluster = (targetClusterRows ?? []).some((r: { cluster_id: string }) =>
        adminClusterSet.has(r.cluster_id)
      );
      const { data: targetOrgRows } = await adminClient
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', targetUserId);
      const sharesManagedOrg = (targetOrgRows ?? []).some((r: { org_id: string }) =>
        authority.managedOrgIds.includes(r.org_id)
      );
      if (!sharesAdminCluster && !sharesManagedOrg) {
        return json(403, { error: 'Target user is outside of your administrative scope.' }, origin);
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

    // Action: update-organization-identity
    if (payload.action === 'update-organization-identity') {
      const orgId = normalizeId(payload.org_id);
      const name = normalizeId(payload.name);
      const tag = normalizeId(payload.tag);
      const slug = normalizeId(payload.slug);

      if (!orgId) return json(400, { error: 'org_id is required.' }, origin);

      // Verify access to the organization
      const { data: targetOrg } = await adminClient
        .from('organizations')
        .select('cluster_id')
        .eq('id', orgId)
        .maybeSingle();
      
      if (!targetOrg) return json(404, { error: 'Organization not found.' }, origin);

      const { data: clusterMembership } = await adminClient
        .from('cluster_memberships')
        .select('id')
        .eq('user_id', callerUserId)
        .eq('cluster_id', targetOrg.cluster_id)
        .eq('role', 'cluster_admin')
        .maybeSingle();

      if (!clusterMembership) {
        return json(403, { error: 'You do not have administrative authority over this organization.' }, origin);
      }

      const updates: Record<string, string | null> = {};
      if (name !== null) updates.name = name;
      if (tag !== null) updates.tag = tag;
      if (slug !== null) updates.slug = slug;

      if (Object.keys(updates).length === 0) {
        return json(400, { error: 'No valid identity fields provided for update.' }, origin);
      }

      const { error: updateError } = await adminClient
        .from('organizations')
        .update(updates)
        .eq('id', orgId);

      if (updateError) return json(400, { error: updateError.message }, origin);

      return json(200, { ok: true, message: 'Organization identity updated.' }, origin);
    }

    // Action: assign-org-admin
    if (payload.action === 'assign-org-admin') {
      const orgId = normalizeId(payload.org_id);
      let targetUserId = normalizeId(payload.target_user_id);
      const targetEmail = normalizeId(payload.target_email);
      const rawRole = payload.target_role;
      const role: DbRole =
        rawRole === 'operator' || rawRole === 'viewer' || rawRole === 'admin' ? rawRole : 'admin';

      if (!orgId) return json(400, { error: 'org_id is required.' }, origin);
      if (!targetUserId && !targetEmail) return json(400, { error: 'target_user_id or target_email is required.' }, origin);

      // Verify access to the organization
      if (!authority.managedOrgIds.includes(orgId)) {
        return json(403, { error: 'No administrative access to target organization.' }, origin);
      }

      // Resolve user ID if email provided
      if (!targetUserId && targetEmail) {
        const foundId = await findAuthUserIdByEmail(adminClient, targetEmail);
        if (!foundId) return json(404, { error: `User with email ${targetEmail} not found.` }, origin);
        targetUserId = foundId;
      }

      if (!targetUserId) return json(400, { error: 'Unable to resolve target user.' }, origin);

      if (targetUserId === callerUserId) {
        return json(400, { error: 'Use workspace switching for your own account.' }, origin);
      }

      await ensureOrgMembership(adminClient, targetUserId, orgId, role, {
        isDefaultOrg: true,
        status: 'active',
      });

      const { data: orgRow, error: orgLookupErr } = await adminClient
        .from('organizations')
        .select('cluster_id')
        .eq('id', orgId)
        .maybeSingle();

      if (orgLookupErr) {
        return json(400, { error: orgLookupErr.message }, origin);
      }

      if (orgRow?.cluster_id) {
        const { error: profileErr } = await adminClient.from('profiles').upsert({
          id: targetUserId,
          active_org_id: orgId,
          active_cluster_id: orgRow.cluster_id as string,
        });
        if (profileErr) return json(400, { error: profileErr.message }, origin);
      }

      return json(200, { ok: true, message: `User assigned as ${role} to organization.` }, origin);
    }

    // Action: list-all-accounts — group (cluster) admins only; users tied to those clusters
    if (payload.action === 'list-all-accounts') {
      const { data: myAdminClusters } = await adminClient
        .from('cluster_memberships')
        .select('cluster_id')
        .eq('user_id', callerUserId)
        .eq('role', 'cluster_admin');
      const adminClusterIds = (myAdminClusters ?? []).map((r: { cluster_id: string }) => r.cluster_id);
      if (adminClusterIds.length === 0) {
        return json(403, { error: 'Group admin access required for directory.' }, origin);
      }

      const userIdSet = new Set<string>();

      const { data: cmRows } = await adminClient
        .from('cluster_memberships')
        .select('user_id')
        .in('cluster_id', adminClusterIds);
      (cmRows ?? []).forEach((r: { user_id: string }) => userIdSet.add(r.user_id));

      const { data: orgsInClusters } = await adminClient
        .from('organizations')
        .select('id')
        .in('cluster_id', adminClusterIds);
      const orgIds = (orgsInClusters ?? []).map((o: { id: string }) => o.id);
      if (orgIds.length > 0) {
        const { data: omRows } = await adminClient
          .from('organization_memberships')
          .select('user_id')
          .in('org_id', orgIds);
        (omRows ?? []).forEach((r: { user_id: string }) => userIdSet.add(r.user_id));
      }

      const { data: profByCluster } = await adminClient
        .from('profiles')
        .select('id')
        .in('active_cluster_id', adminClusterIds);
      (profByCluster ?? []).forEach((p: { id: string }) => userIdSet.add(p.id));

      const userIds = Array.from(userIdSet);
      if (userIds.length === 0) {
        return json(200, { ok: true, accounts: [] }, origin);
      }

      const [
        { data: profiles, error: profileError },
        { data: clusterMems, error: clusterError },
        { data: orgMems, error: orgError },
      ] = await Promise.all([
        adminClient.from('profiles').select('id, active_org_id, active_cluster_id, created_at').in('id', userIds),
        adminClient.from('cluster_memberships').select('user_id, cluster_id, role').in('user_id', userIds),
        adminClient.from('organization_memberships').select('user_id, org_id, role, status').in('user_id', userIds),
      ]);

      if (profileError || clusterError || orgError) {
        return json(400, { error: 'Aggregated directory fetch failed.' }, origin);
      }

      const emailMap = await buildEmailMapForUserIds(adminClient, userIds);
      const accounts = (profiles ?? []).map((p: any) => {
        const userClusterMems = (clusterMems ?? []).filter((cm: any) => cm.user_id === p.id);
        const userOrgMems = (orgMems ?? []).filter((om: any) => om.user_id === p.id);

        return {
          user_id: p.id,
          email: emailMap.get(p.id) ?? null,
          active_org_id: p.active_org_id,
          active_cluster_id: p.active_cluster_id,
          cluster_roles: userClusterMems.map((cm: any) => ({ cluster_id: cm.cluster_id, role: cm.role })),
          org_roles: userOrgMems.map((om: any) => ({ org_id: om.org_id, role: om.role, status: om.status })),
          created_at: p.created_at
        };
      });

      return json(200, { ok: true, accounts }, origin);
    }

  // Default Action: list (all organizations and users in scope)
  const { data: profiles, error: profileError } = await adminClient
    .from('profiles')
    .select('id, active_org_id, active_cluster_id, created_at')
    .in('active_org_id', authority.managedOrgIds);

  if (profileError) return json(400, { error: profileError.message }, origin);

  const profileRows = profiles ?? [];
  const emailMap = await buildEmailMapForUserIds(
    adminClient,
    profileRows.map((p: { id: string }) => p.id),
  );

  const accounts = profileRows.map((p: any) => ({
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