/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, resolveClientIp, rateLimitResponse } from '../_shared/rate-limiter.ts';
import {
  callerCanManageOrganization,
  ensureOrgMembership,
  getCallerAuthorityContext,
  syncOrgGraph,
} from '../_shared/auth-model.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

const RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };

type DbRole = 'admin' | 'operator' | 'viewer';

type AccessRequestRow = {
  id: string;
  org_id: string;
  login_id: string;
  requested_role: DbRole;
  status: 'pending' | 'approved' | 'rejected';
};

type ProvisionPayload = {
  access_request_id: string;
  team_member_name?: string;
  password?: string;
  approved_role?: DbRole;
  access_token?: string;
};

const json = (status: number, body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  });

const resolveTargetClusterId = async (
  adminClient: any,
  targetOrgId: string,
  callerClusterId: string | null,
) => {
  const { data: existingOrgRow, error: orgError } = await adminClient
    .from('organizations')
    .select('cluster_id')
    .eq('id', targetOrgId)
    .maybeSingle();

  if (orgError) {
    throw new Error(`Unable to resolve organization cluster: ${orgError.message}`);
  }

  if (existingOrgRow?.cluster_id) {
    return existingOrgRow.cluster_id;
  }

  if (callerClusterId) return callerClusterId;

  // Final fallback: check profiles who are already in this org
  const { data: existingProfileInOrg, error: profileError } = await adminClient
    .from('profiles')
    .select('active_cluster_id')
    .eq('active_org_id', targetOrgId)
    .not('active_cluster_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!profileError && existingProfileInOrg?.active_cluster_id) {
    return existingProfileInOrg.active_cluster_id;
  }

  return null;
};

const parseBearerToken = (headerValue: string | null): string | null => {
  if (!headerValue) return null;
  const lower = headerValue.toLowerCase();
  if (!lower.startsWith('bearer ')) return null;
  return headerValue.slice(7).trim();
};

const normalizeRole = (value: unknown): DbRole => {
  if (typeof value !== 'string') return 'viewer';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'admin' || normalized === 'operator' || normalized === 'viewer') {
    return normalized as DbRole;
  }
  return 'viewer';
};

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(origin) });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' }, origin);

  const clientIp = resolveClientIp(request);
  const rl = checkRateLimit(clientIp, RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs ?? 1000, origin, getCorsHeaders(origin));

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SB_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: 'Missing environment variables.' }, origin);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let payload: ProvisionPayload;
  try {
    payload = await request.json() as ProvisionPayload;
  } catch {
    return json(400, { error: 'Invalid JSON payload.' }, origin);
  }

  if (!payload.access_request_id) return json(400, { error: 'access_request_id is required.' }, origin);

  const bearerToken = parseBearerToken(request.headers.get('Authorization')) || (payload.access_token ?? '').trim();

  if (!bearerToken) return json(401, { error: 'Missing bearer token.' }, origin);

  const { data: authUserData, error: authUserError } = await adminClient.auth.getUser(bearerToken);
  if (authUserError || !authUserData.user) return json(401, { error: 'Unauthorized.' }, origin);

  const callerUserId = authUserData.user.id;
  let callerAuthority;
  try {
    callerAuthority = await getCallerAuthorityContext(adminClient, callerUserId);
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : 'Authority resolution failed.' }, origin);
  }

  if (!callerAuthority.isAdmin) return json(403, { error: 'Admin only.' }, origin);

  const { data: requestRowData, error: requestRowError } = await adminClient
    .from('access_requests')
    .select('id, org_id, login_id, requested_role, status')
    .eq('id', payload.access_request_id)
    .single();

  if (requestRowError || !requestRowData) return json(404, { error: 'Request not found.' }, origin);
  const requestRow = requestRowData as AccessRequestRow;

  if (requestRow.status === 'rejected') return json(409, { error: 'Request rejected.' }, origin);
  const canManageRequestOrg = await callerCanManageOrganization(
    adminClient,
    requestRow.org_id,
    callerAuthority,
  );
  if (!canManageRequestOrg) {
    return json(403, { error: 'Out of scope.' }, origin);
  }

  const resolvedLoginId = requestRow.login_id.toLowerCase().trim();
  const resolvedRole = normalizeRole(payload.approved_role ?? requestRow.requested_role);
  const targetOrgId = requestRow.org_id;

  const targetClusterId = await resolveTargetClusterId(adminClient, targetOrgId, callerAuthority.clusterId);
  if (!targetClusterId) {
    return json(400, { error: 'Organization has no group (cluster); assign a cluster before approving access.' }, origin);
  }

  const resolvedPassword = (payload.password ?? '').trim();
  if (resolvedPassword.length < 8) return json(400, { error: 'Password too short.' }, origin);

  // 1. Auth Creation / Update
  const createResult = await adminClient.auth.admin.createUser({
    email: resolvedLoginId,
    password: resolvedPassword,
    email_confirm: true,
    user_metadata: { app_role: resolvedRole },
  });

  let provisionedUserId: string | null = createResult.data.user?.id ?? null;

  if (createResult.error) {
    const users = await adminClient.auth.admin.listUsers();
    const existing = (users.data.users as any[]).find(u => u.email?.toLowerCase() === resolvedLoginId);
    if (!existing) return json(400, { error: createResult.error.message }, origin);
    provisionedUserId = existing.id;
    await adminClient.auth.admin.updateUserById(existing.id, {
      password: resolvedPassword,
      user_metadata: { ...existing.user_metadata, app_role: resolvedRole },
    });
  }

  if (!provisionedUserId) return json(500, { error: 'User resolution failed.' }, origin);

  // 2. Database Sync
  await adminClient.from('profiles').upsert({ 
    id: provisionedUserId, 
    active_org_id: targetOrgId,
    active_cluster_id: targetClusterId 
  });

  await syncOrgGraph(adminClient, targetOrgId, targetClusterId);
  await ensureOrgMembership(adminClient, provisionedUserId, targetOrgId, resolvedRole, {
    isDefaultOrg: true,
    status: 'active',
  });

  // 3. Team member record
  if (payload.team_member_name) {
    await adminClient.from('team_members').upsert({
      org_id: targetOrgId,
      user_id: provisionedUserId,
      name: payload.team_member_name.trim() || resolvedLoginId.split('@')[0],
      staff_role: resolvedRole,
    }, { onConflict: 'org_id,user_id' });
  }

  // 4. Resolve Request
  await adminClient.from('access_requests').update({
    status: 'approved',
    reviewed_by: callerUserId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', requestRow.id);

  return json(200, { ok: true, provisioned_user_id: provisionedUserId }, origin);
});
