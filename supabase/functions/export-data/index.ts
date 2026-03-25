import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type ExportScope = 'cluster' | 'org';
type ExportDataset = 'entities' | 'activities' | 'records' | 'team_members' | 'collaborations' | 'channels' | 'audit_events' | 'all';

interface ExportPayload {
  scope: ExportScope;
  org_id?: string;
  cluster_id?: string;
  dataset: ExportDataset;
}

// Fields that must never appear in any export output
const REDACTED_FIELDS = new Set([
  'password', 'password_hash', 'token_hash', 'raw_token', 'secret',
  'service_role_key', 'anon_key', 'access_token', 'refresh_token',
]);

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_FIELDS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function redactArray(rows: unknown[]): unknown[] {
  return rows.map(row =>
    row && typeof row === 'object' ? redactObject(row as Record<string, unknown>) : row
  );
}

async function fetchDataset(
  supabase: ReturnType<typeof createClient>,
  dataset: ExportDataset,
  orgId: string | null,
  clusterScope: boolean,
  clusterOrgIds: string[],
): Promise<Record<string, { rows: unknown[]; count: number }>> {
  const tables = dataset === 'all'
    ? ['entities', 'activities', 'records', 'team_members', 'collaborations', 'channels', 'audit_events']
    : [dataset];

  const result: Record<string, { rows: unknown[]; count: number }> = {};

  for (const table of tables) {
    let query = supabase.from(table).select('*');

    if (table === 'audit_events') {
      // audit_events don't have org_id — skip org scoping, always allowed for cluster admins
      if (!clusterScope && orgId) {
        // For org admins — only their own org's events via actor_org_id if available
        query = query.eq('actor_org_id', orgId);
      }
    } else if (clusterScope && clusterOrgIds.length > 0) {
      query = query.in('org_id', clusterOrgIds);
    } else if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data, error } = await query.limit(10000);
    if (error) {
      result[table] = { rows: [], count: 0 };
    } else {
      const redacted = redactArray(data ?? []);
      result[table] = { rows: redacted, count: redacted.length };
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // 1. Auth: verify caller JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerToken = authHeader.slice(7);
    const callerClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify and get caller
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(callerToken);
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = callerClient;

    // 2. Resolve caller authority
    const { data: clusterMemberships } = await serviceClient
      .from('cluster_memberships')
      .select('cluster_id, role')
      .eq('user_id', caller.id);

    const { data: orgMemberships } = await serviceClient
      .from('organization_memberships')
      .select('org_id, role, status')
      .eq('user_id', caller.id)
      .in('status', ['active']);

    const isClusterAdmin = (clusterMemberships ?? []).some((m: { role: string }) => m.role === 'cluster_admin');
    const isOrgAdmin = !isClusterAdmin && (orgMemberships ?? []).some((m: { role: string }) => m.role === 'admin');
    const callerOrgIds = (orgMemberships ?? []).map((m: { org_id: string }) => m.org_id);
    const callerClusterIds = (clusterMemberships ?? [])
      .filter((m: { role: string; cluster_id: string }) => m.role === 'cluster_admin')
      .map((m: { role: string; cluster_id: string }) => m.cluster_id);

    if (!isClusterAdmin && !isOrgAdmin) {
      return new Response(JSON.stringify({ error: 'Export access denied. Operator and viewer accounts cannot export data.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Parse and validate payload
    const body: ExportPayload = await req.json();
    const { scope, org_id, cluster_id, dataset } = body;

    if (!scope || !dataset) {
      return new Response(JSON.stringify({ error: 'scope and dataset are required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Permission check: scope enforcement
    let resolvedOrgId: string | null = org_id ?? null;
    let resolvedClusterScope = false;
    let clusterOrgIds: string[] = [];

    if (scope === 'cluster') {
      if (!isClusterAdmin) {
        return new Response(JSON.stringify({ error: 'Cluster-scoped export requires cluster admin role.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const targetClusterId = cluster_id ?? callerClusterIds[0];
      if (!targetClusterId || !callerClusterIds.includes(targetClusterId)) {
        return new Response(JSON.stringify({ error: 'Cluster not in your administrative scope.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Fetch all org IDs in this cluster
      const { data: orgs } = await serviceClient
        .from('organizations')
        .select('id')
        .eq('cluster_id', targetClusterId);
      clusterOrgIds = (orgs ?? []).map((o: { id: string }) => o.id);
      resolvedClusterScope = true;
      resolvedOrgId = null;
    } else if (scope === 'org') {
      if (!resolvedOrgId) {
        return new Response(JSON.stringify({ error: 'org_id is required for org-scoped export.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Cluster admin can export any org. Org admin only their own.
      if (!isClusterAdmin && !callerOrgIds.includes(resolvedOrgId)) {
        return new Response(JSON.stringify({ error: 'You do not have access to export this organization.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 5. Collect data
    const exportedAt = new Date().toISOString();
    const exportData = await fetchDataset(serviceClient, dataset, resolvedOrgId, resolvedClusterScope, clusterOrgIds);

    const totalRows = Object.values(exportData).reduce((sum, d) => sum + d.count, 0);

    // 6. Audit log entry — always written, even if export is empty
    await serviceClient.from('audit_events').insert({
      actor_user_id: caller.id,
      actor_label: caller.email ?? caller.id,
      actor_role: isClusterAdmin ? 'cluster_admin' : 'admin',
      action: 'bulk_export',
      entity: scope === 'cluster' ? 'cluster' : 'organization',
      entity_id: scope === 'cluster' ? (cluster_id ?? callerClusterIds[0] ?? null) : resolvedOrgId,
      amount: totalRows,
      details: {
        scope,
        dataset,
        org_id: resolvedOrgId,
        cluster_id: scope === 'cluster' ? (cluster_id ?? callerClusterIds[0]) : null,
        row_count: totalRows,
        tables: Object.fromEntries(Object.entries(exportData).map(([t, d]) => [t, d.count])),
        exported_at: exportedAt,
      },
    });

    // 7. Return export package
    return new Response(JSON.stringify({
      exported_at: exportedAt,
      actor: caller.email ?? caller.id,
      scope,
      dataset,
      org_id: resolvedOrgId,
      cluster_id: scope === 'cluster' ? (cluster_id ?? callerClusterIds[0]) : null,
      total_rows: totalRows,
      data: exportData,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('export-data error:', err);
    return new Response(JSON.stringify({ error: 'Internal export error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
