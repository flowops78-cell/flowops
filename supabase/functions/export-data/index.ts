/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callerCanManageOrganization, getCallerAuthorityContext } from '../_shared/auth-model.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE_ROLE_KEY =
  Deno.env.get('SB_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

type ExportScope = 'cluster' | 'org';
type ExportDataset =
  | 'entities'
  | 'activities'
  | 'records'
  | 'organization_memberships'
  | 'collaborations'
  | 'channels'
  | 'audit_events'
  | 'all';

interface ExportPayload {
  scope: ExportScope;
  org_id?: string;
  cluster_id?: string;
  dataset: ExportDataset;
}

const EXPORT_SCOPES: readonly ExportScope[] = ['cluster', 'org'];
const EXPORT_DATASETS: readonly ExportDataset[] = [
  'entities',
  'activities',
  'records',
  'organization_memberships',
  'collaborations',
  'channels',
  'audit_events',
  'all',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function parseExportPayload(raw: unknown): { ok: true; payload: ExportPayload } | { ok: false; message: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }
  const o = raw as Record<string, unknown>;
  const scope = o.scope;
  const dataset = o.dataset;
  if (typeof scope !== 'string' || !EXPORT_SCOPES.includes(scope as ExportScope)) {
    return { ok: false, message: 'Invalid or missing scope (expected cluster | org).' };
  }
  if (typeof dataset !== 'string' || !EXPORT_DATASETS.includes(dataset as ExportDataset)) {
    return { ok: false, message: 'Invalid or missing dataset.' };
  }
  const org_id = o.org_id;
  const cluster_id = o.cluster_id;
  if (org_id !== undefined && org_id !== null && org_id !== '' && !isUuid(org_id)) {
    return { ok: false, message: 'Invalid org_id (expected UUID).' };
  }
  if (cluster_id !== undefined && cluster_id !== null && cluster_id !== '' && !isUuid(cluster_id)) {
    return { ok: false, message: 'Invalid cluster_id (expected UUID).' };
  }
  return {
    ok: true,
    payload: {
      scope: scope as ExportScope,
      dataset: dataset as ExportDataset,
      org_id: typeof org_id === 'string' && org_id ? org_id : undefined,
      cluster_id: typeof cluster_id === 'string' && cluster_id ? cluster_id : undefined,
    },
  };
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
    ? [
      'entities',
      'activities',
      'records',
      'organization_memberships',
      'collaborations',
      'channels',
      'audit_events',
    ]
    : [dataset];

  const result: Record<string, { rows: unknown[]; count: number }> = {};

  for (const table of tables) {
    let query = supabase.from(table).select('*');

    if (table === 'audit_events') {
      if (clusterScope && clusterOrgIds.length > 0) {
        query = query.in('org_id', clusterOrgIds);
      } else if (orgId) {
        query = query.eq('org_id', orgId);
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

  if (!SUPABASE_URL || !SB_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerToken = authHeader.slice(7);
    const serviceClient = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: callerError } = await serviceClient.auth.getUser(callerToken);
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let authority;
    try {
      authority = await getCallerAuthorityContext(serviceClient, caller.id);
    } catch (err) {
      console.error('export-data authority:', err);
      return new Response(JSON.stringify({ error: 'Unable to resolve caller authority.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isClusterAdmin = authority.administeredClusterIds.length > 0;
    const canWorkspaceExport = authority.workspaceAdminOrgIds.length > 0;
    if (!isClusterAdmin && !canWorkspaceExport) {
      return new Response(JSON.stringify({ error: 'Export access denied. Group or workspace admin role required.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = parseExportPayload(rawBody);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { scope, org_id, cluster_id, dataset } = parsed.payload;

    let resolvedOrgId: string | null = org_id ?? null;
    let resolvedClusterScope = false;
    let clusterOrgIds: string[] = [];

    if (scope === 'cluster') {
      if (!isClusterAdmin) {
        return new Response(JSON.stringify({ error: 'Cluster-scoped export requires cluster admin role.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const targetClusterId = cluster_id ?? authority.administeredClusterIds[0];
      if (!targetClusterId || !authority.administeredClusterIds.includes(targetClusterId)) {
        return new Response(JSON.stringify({ error: 'Cluster not in your administrative scope.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
      const allowed = await callerCanManageOrganization(serviceClient, resolvedOrgId, authority);
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'You do not have access to export this organization.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const exportedAt = new Date().toISOString();
    const exportData = await fetchDataset(serviceClient, dataset, resolvedOrgId, resolvedClusterScope, clusterOrgIds);

    const totalRows = Object.values(exportData).reduce((sum, d) => sum + d.count, 0);

    const auditOrgId =
      resolvedOrgId ??
      (clusterOrgIds.length > 0 ? clusterOrgIds[0] : null) ??
      authority.workspaceAdminOrgIds[0] ??
      null;
    const exportDetails = {
      scope,
      dataset,
      org_id: resolvedOrgId,
      cluster_id: scope === 'cluster' ? (cluster_id ?? authority.administeredClusterIds[0]) : null,
      row_count: totalRows,
      tables: Object.fromEntries(Object.entries(exportData).map(([t, d]) => [t, d.count])),
      exported_at: exportedAt,
      cluster_admin_export: isClusterAdmin,
    };
    const detailsJson = JSON.stringify(exportDetails);
    const detailsStr =
      detailsJson.length > 120 ? `${detailsJson.slice(0, 117)}...` : detailsJson;

    if (auditOrgId) {
      await serviceClient.from('audit_events').insert({
        org_id: auditOrgId,
        actor_user_id: caller.id,
        actor_label: caller.email ?? caller.id,
        actor_role: 'admin',
        action: 'bulk_export',
        entity: scope === 'cluster' ? 'cluster' : 'organization',
        entity_id: null,
        amount: totalRows,
        details: detailsStr,
      });
    }

    return new Response(JSON.stringify({
      exported_at: exportedAt,
      actor: caller.email ?? caller.id,
      scope,
      dataset,
      org_id: resolvedOrgId,
      cluster_id: scope === 'cluster' ? (cluster_id ?? authority.administeredClusterIds[0]) : null,
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
