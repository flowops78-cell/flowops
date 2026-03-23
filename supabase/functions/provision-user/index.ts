/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, resolveClientIp, rateLimitResponse } from '../_shared/rate-limiter.ts';
import { ensureOrgMembership, getCallerAuthorityContext, syncOrgGraph } from '../_shared/auth-model.ts';
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
  member_id?: string;
  password?: string;
  approved_role?: DbRole;
  access_token?: string;
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

const resolveTargetMetaOrgId = async (
  adminClient: ReturnType<typeof createClient>,
  targetOrgId: string,
  callerMetaOrgId: string | null,
  isGlobalAdmin: boolean,
  resolvedRole: DbRole,
) => {
  const { data: existingOrgRow, error: orgError } = await adminClient
    .from('orgs')
    .select('cluster_id')
    .eq('id', targetOrgId)
    .maybeSingle();

  if (orgError) {
    throw new Error(`Unable to resolve org cluster: ${orgError.message}`);
  }

  if (existingOrgRow?.cluster_id) {
    return existingOrgRow.cluster_id;
  }

  if (callerMetaOrgId) return callerMetaOrgId;

  const { data: existingOrgMapping, error: mappingError } = await adminClient
    .from('org_meta_mapping')
    .select('meta_org_id')
    .eq('org_id', targetOrgId)
    .maybeSingle();

  if (mappingError) {
    throw new Error(`Unable to resolve org mapping: ${mappingError.message}`);
  }

  if (existingOrgMapping?.meta_org_id) {
    return existingOrgMapping.meta_org_id;
  }

  const { data: existingProfileInOrg, error: profileError } = await adminClient
    .from('profiles')
    .select('meta_org_id')
    .eq('org_id', targetOrgId)
    .not('meta_org_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to resolve profile cluster: ${profileError.message}`);
  }

  if (existingProfileInOrg?.meta_org_id) {
    return existingProfileInOrg.meta_org_id;
  }

  if (isGlobalAdmin && resolvedRole === 'admin') {
    return crypto.randomUUID();
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
    return normalized;
  }
  if (normalized === 'vwr') return 'viewer';
  return 'viewer';
};

const toMemberRole = (role: DbRole): 'admin' | 'operator' | 'viewer' => {
  if (role === 'admin') return 'admin';
  if (role === 'operator') return 'operator';
  return 'viewer';
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

  let payload: ProvisionPayload;
  try {
    payload = await request.json() as ProvisionPayload;
  } catch {
    return json(400, { error: 'Invalid JSON payload.' }, origin);
  }

  if (!payload.access_request_id) {
    return json(400, { error: 'access_request_id is required.' }, origin);
  }

  const headerBearerToken = parseBearerToken(request.headers.get('Authorization'));
  const payloadBearerToken = (payload.access_token ?? '').trim() || null;
  const bearerToken = headerBearerToken || payloadBearerToken;
  if (!bearerToken) {
    return json(401, { error: 'Missing bearer token.' }, origin);
  }

  const { data: authUserData, error: authUserError } = await adminClient.auth.getUser(bearerToken);
  if (authUserError || !authUserData.user) {
    return json(401, { error: 'Unable to resolve authenticated user.' }, origin);
  }

  const callerUserId = authUserData.user.id;
  let callerAuthority;
  try {
    callerAuthority = await getCallerAuthorityContext(adminClient, callerUserId);
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : 'Unable to resolve caller authority.' }, origin);
  }

  if (!callerAuthority.isAdmin) {
    return json(403, { error: 'Only admin accounts can provision users.' }, origin);
  }

  const callerOrgId = callerAuthority.currentOrgId;
  const callerMetaId = callerAuthority.metaOrgId;
  const isGlobalAdmin = callerAuthority.isPlatformAdmin || (callerAuthority.source === 'legacy' && callerAuthority.role === 'admin' && !callerMetaId);

  if (!isGlobalAdmin && !callerOrgId && callerAuthority.managedOrgIds.length === 0) {
    return json(400, { error: 'Caller has no organization authority.' }, origin);
  }

  const { data: requestRowData, error: requestRowError } = await adminClient
    .from('access_requests')
    .select('id, org_id, login_id, requested_role, status')
    .eq('id', payload.access_request_id)
    .single();

  const requestRow = requestRowData as AccessRequestRow | null;

  if (requestRowError || !requestRow) {
    return json(404, { error: 'Access request not found.' }, origin);
  }

  if (requestRow.status === 'rejected') {
    return json(409, { error: 'Cannot provision a rejected access request.' }, origin);
  }

  if (!isGlobalAdmin && !callerAuthority.managedOrgIds.includes(requestRow.org_id) && requestRow.org_id !== callerOrgId) {
    return json(403, { error: 'Access request is outside the caller org scope.' }, origin);
  }

  const resolvedLoginId = requestRow.login_id.toLowerCase().trim();
  const resolvedRole = normalizeRole(payload.approved_role ?? requestRow.requested_role);
  const targetOrgId = requestRow.org_id;

  let targetMetaOrgId: string | null;
  try {
    targetMetaOrgId = await resolveTargetMetaOrgId(adminClient, targetOrgId, callerMetaId, isGlobalAdmin, resolvedRole);
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : 'Unable to resolve target meta-org.' }, origin);
  }

  const payloadPassword = (payload.password ?? '').trim();
  const resolvedPassword = payloadPassword;

  if (resolvedPassword.length < 8) {
    return json(400, { error: 'Initial password is required and must be at least 8 characters.' }, origin);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedLoginId)) {
    return json(400, { error: `Login ID "${resolvedLoginId}" is invalid` }, origin);
  }

  const roleData = {
    app_role: resolvedRole,
  };

  const resolvedMemberId = payload.member_id?.trim() || undefined;
  const loginAlias = resolvedLoginId.split('@')[0]?.trim() || 'member';
  const memberLabel = resolvedMemberId || loginAlias;

  const createResult = await adminClient.auth.admin.createUser({
    email: resolvedLoginId,
    password: resolvedPassword,
    email_confirm: true,
    user_metadata: roleData,
  });

  let provisionedUserId: string | null = createResult.data.user?.id ?? null;

  if (createResult.error) {
    const message = createResult.error.message.toLowerCase();
    const alreadyExists = message.includes('already') || message.includes('registered') || message.includes('exists');

    if (!alreadyExists) {
      return json(400, { error: createResult.error.message }, origin);
    }

    const users = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = users?.data?.users?.find((u: AuthUserSummary) => (u.email ?? '').toLowerCase() === resolvedLoginId);
    if (!existing) {
      return json(400, { error: 'User exists but could not be resolved from auth.users.' }, origin);
    }

    provisionedUserId = existing.id;

    await adminClient.auth.admin.updateUserById(existing.id, {
      password: resolvedPassword,
      user_metadata: { ...existing.user_metadata, app_role: resolvedRole },
    });
  }

  if (!provisionedUserId) {
    return json(500, { error: 'Provisioning succeeded but no user id was returned.' }, origin);
  }

  // Insert into flow_ops_migration expected tables
  const { error: roleUpsertError } = await adminClient
    .from('user_roles')
    .upsert({ user_id: provisionedUserId, role: resolvedRole }); // we removed ON CONFLICT constraint parameter to be cleaner

  if (roleUpsertError) {
    return json(400, { error: `user_roles upsert error: ${roleUpsertError.message}` }, origin);
  }

  const { error: profileUpsertError } = await adminClient
    .from('profiles')
    .upsert({ 
      id: provisionedUserId, 
      org_id: targetOrgId,
      meta_org_id: targetMetaOrgId 
    });

  if (profileUpsertError) {
    return json(400, { error: `profiles upsert error: ${profileUpsertError.message}` }, origin);
  }

  try {
    await syncOrgGraph(adminClient, targetOrgId, targetMetaOrgId);
    await ensureOrgMembership(adminClient, provisionedUserId, targetOrgId, resolvedRole, {
      isDefaultOrg: true,
      status: 'active',
    });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : 'Unable to sync membership auth model.' }, origin);
  }

  // Ensure org -> meta mapping exists if we have a cluster context
  if (targetOrgId && targetMetaOrgId) {
    const { error: mappingError } = await adminClient
      .from('org_meta_mapping')
      .upsert({ 
        org_id: targetOrgId, 
        meta_org_id: targetMetaOrgId 
      });
    
    if (mappingError) {
       console.error('Mapping error (non-fatal):', mappingError.message);
    }
  }
  
  if (resolvedMemberId) {
    const memberPayload = {
      org_id: targetOrgId,
      user_id: provisionedUserId,
      member_id: resolvedMemberId,
      name: memberLabel,
      role: toMemberRole(resolvedRole),
      status: 'active',
    };

    const { data: existingMemberRow, error: existingMemberError } = await adminClient
      .from('members')
      .select('id')
      .eq('org_id', targetOrgId)
      .eq('user_id', provisionedUserId)
      .maybeSingle();

    if (existingMemberError) {
      return json(400, { error: `member lookup error: ${existingMemberError.message}` }, origin);
    }

    if (existingMemberRow?.id) {
      const { error: memberUpdateError } = await adminClient
        .from('members')
        .update(memberPayload)
        .eq('id', existingMemberRow.id);

      if (memberUpdateError) {
        return json(400, { error: `member update error: ${memberUpdateError.message}` }, origin);
      }
    } else {
      const { error: memberInsertError } = await adminClient
        .from('members')
        .insert(memberPayload);

      if (memberInsertError) {
        return json(400, { error: `member insert error: ${memberInsertError.message}` }, origin);
      }
    }
  }

  const { error: requestUpdateError } = await adminClient
    .from('access_requests')
    .update({
      requested_role: resolvedRole,
      status: 'approved',
      reviewed_by: callerUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestRow.id);

  if (requestUpdateError) {
    return json(400, { error: requestUpdateError.message }, origin);
  }

  return json(200, {
    ok: true,
    provisioned_user_id: provisionedUserId,
    login_id: resolvedLoginId,
    app_role: resolvedRole,
    password_applied: true,
    user_already_exists: Boolean(createResult.error),
  }, origin);
});
