import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, resolveClientIp, rateLimitResponse } from '../_shared/rate-limiter.ts';

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

  const { data: callerRoleData, error: callerRoleError } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', callerUserId)
    .single();

  if (callerRoleError || !callerRoleData) {
    return json(403, { error: 'Caller role not found in user_roles.' }, origin);
  }

  if (callerRoleData.role !== 'admin') {
    return json(403, { error: 'Only admin accounts can provision users.' }, origin);
  }

  const { data: callerProfileData, error: callerProfileError } = await adminClient
    .from('profiles')
    .select('org_id, meta_org_id')
    .eq('id', callerUserId)
    .maybeSingle();

  if (callerProfileError) {
    return json(400, { error: `Unable to resolve caller org: ${callerProfileError.message}` }, origin);
  }

  const callerOrgId = callerProfileData?.org_id ?? null;
  const callerMetaId = callerProfileData?.meta_org_id ?? null;
  const isGlobalAdmin = callerRoleData.role === 'admin' && !callerMetaId;

  if (!isGlobalAdmin && !callerOrgId) {
    return json(400, { error: 'Caller has no org_id in profiles.' }, origin);
  }

  const { data: requestRow, error: requestRowError } = await adminClient
    .from('access_requests')
    .select('id, org_id, login_id, requested_role, status')
    .eq('id', payload.access_request_id)
    .single<AccessRequestRow>();

  if (requestRowError || !requestRow) {
    return json(404, { error: 'Access request not found.' }, origin);
  }

  if (requestRow.status === 'rejected') {
    return json(409, { error: 'Cannot provision a rejected access request.' }, origin);
  }

  if (!isGlobalAdmin && requestRow.org_id !== callerOrgId) {
    return json(403, { error: 'Access request is outside the caller org scope.' }, origin);
  }

  const resolvedLoginId = requestRow.login_id.toLowerCase().trim();
  const resolvedRole = normalizeRole(payload.approved_role ?? requestRow.requested_role);
  const targetOrgId = requestRow.org_id;
  
  // Hierarchical logic: Inheritance
  let targetMetaOrgId = callerMetaId;

  if (resolvedRole === 'admin') {
    if (callerMetaId) {
      targetMetaOrgId = callerMetaId;
    } else {
      const { data: existingOrgMapping } = await adminClient
        .from('org_meta_mapping')
        .select('meta_org_id')
        .eq('org_id', requestRow.org_id)
        .maybeSingle();

      if (existingOrgMapping?.meta_org_id) {
        targetMetaOrgId = existingOrgMapping.meta_org_id;
      } else {
        const { data: existingProfileInOrg } = await adminClient
          .from('profiles')
          .select('meta_org_id')
          .eq('org_id', requestRow.org_id)
          .not('meta_org_id', 'is', null)
          .limit(1)
          .maybeSingle();

        if (existingProfileInOrg?.meta_org_id) {
          targetMetaOrgId = existingProfileInOrg.meta_org_id;
        } else if (isGlobalAdmin) {
          targetMetaOrgId = crypto.randomUUID();
        }
      }
    }
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
    const existing = users?.data?.users?.find((u) => (u.email ?? '').toLowerCase() === resolvedLoginId);
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
