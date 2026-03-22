import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ManageOrgContextPayload = {
  action: 'list-available-orgs' | 'switch-org';
  org_id?: string | null;
};

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

const resolveCorsHeaders = (origin: string | null) => {
  const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value: string) => value.trim())
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

const normalizeOrgId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const loadClusterContext = async (
  adminClient: ReturnType<typeof createClient>,
  callerUserId: string,
  requestedOrgId?: string | null,
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
    throw new Error('Only admin accounts can manage organization context.');
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
      .map((row: { org_id: string | null }) => row.org_id)
      .filter((value: string | null): value is string => typeof value === 'string' && value.length > 0);
  }

  if (callerOrgId && !managedOrgIds.includes(callerOrgId)) {
    managedOrgIds.unshift(callerOrgId);
  }

  return {
    callerOrgId,
    metaOrgId,
    managedOrgIds: Array.from(new Set(managedOrgIds)),
    isGlobalAdmin: callerRoleData.role === 'admin' && metaOrgId === null,
  };
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: resolveCorsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' }, origin);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      return json(500, { error: 'Server configuration is incomplete.' }, origin);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const accessToken = parseBearerToken(req.headers.get('Authorization'));
    if (!accessToken) {
      return json(401, { error: 'Unauthorized' }, origin);
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(accessToken);

    if (authError || !user) {
      return json(401, { error: 'Unauthorized' }, origin);
    }

    const payload = await req.json() as ManageOrgContextPayload;
    const action = payload?.action;
    if (action !== 'list-available-orgs' && action !== 'switch-org') {
      return json(400, { error: 'Invalid action' }, origin);
    }

    const requestedOrgId = normalizeOrgId(payload.org_id);
    const clusterContext = await loadClusterContext(supabaseClient, user.id, requestedOrgId);

    if (action === 'list-available-orgs') {
      if (clusterContext.isGlobalAdmin) {
        const { data: orgRows, error: orgRowsError } = await supabaseClient
          .from('workspaces')
          .select('org_id')
          .not('org_id', 'is', null);

        if (orgRowsError) throw orgRowsError;

        const orgs = Array.from(new Set(
          (orgRows ?? [])
            .map((row: { org_id: string | null }) => row.org_id)
            .filter((value: string | null): value is string => typeof value === 'string' && value.length > 0),
        ));

        return json(200, { orgs }, origin);
      }

      return json(200, { orgs: clusterContext.managedOrgIds }, origin);
    }

    if (requestedOrgId !== null && !clusterContext.isGlobalAdmin && !clusterContext.managedOrgIds.includes(requestedOrgId)) {
      return json(403, { error: 'Forbidden: target organization is outside your managed scope.' }, origin);
    }

    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({ org_id: requestedOrgId })
      .eq('id', user.id);

    if (updateError) throw updateError;

    return json(200, { success: true, org_id: requestedOrgId }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: message }, origin);
  }
});
