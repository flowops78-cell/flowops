/**
 * Attach an existing Auth user to a workspace: cluster_admin + org admin + profile.
 * Uses first org with a cluster if one exists; otherwise creates group + workspace.
 *
 * Usage: npx tsx scripts/attach_workspace_by_email.ts [email]
 * Env: VITE_SUPABASE_URL, SB_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY (from .env)
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetEmail = (process.argv[2] || 'admin@ops.os').trim().toLowerCase();

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SB_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  for (let n = 0; n < 100; n++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    if (users.length === 0) return null;
    const hit = users.find((u) => u.email?.toLowerCase() === email);
    if (hit?.id) return hit.id;
    if (data?.nextPage != null && data.nextPage > page) {
      page = data.nextPage;
      continue;
    }
    break;
  }
  return null;
}

async function main() {
  console.log(`Looking up Auth user: ${targetEmail}`);
  const userId = await findUserIdByEmail(targetEmail);
  if (!userId) {
    console.error(`No auth.users row for ${targetEmail}. Create the user in Supabase Auth first.`);
    process.exit(1);
  }

  const { data: existingOrgs, error: orgErr } = await supabase
    .from('organizations')
    .select('id, cluster_id')
    .not('cluster_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1);

  if (orgErr) throw new Error(orgErr.message);

  let orgId: string;
  let clusterId: string;

  if (existingOrgs?.[0]?.id && existingOrgs[0].cluster_id) {
    orgId = existingOrgs[0].id;
    clusterId = existingOrgs[0].cluster_id as string;
    console.log(`Using existing workspace ${orgId} (group ${clusterId}).`);
  } else {
    clusterId = randomUUID();
    orgId = randomUUID();
    const { error: cErr } = await supabase
      .from('clusters')
      .insert({ id: clusterId, name: 'Main group', created_by: userId });
    if (cErr) throw new Error(`clusters: ${cErr.message}`);
    const { error: oErr } = await supabase
      .from('organizations')
      .insert({ id: orgId, cluster_id: clusterId, name: 'Main workspace' });
    if (oErr) throw new Error(`organizations: ${oErr.message}`);
    console.log(`Created group ${clusterId} and workspace ${orgId}.`);
  }

  const { error: pErr } = await supabase.from('profiles').upsert({
    id: userId,
    active_org_id: orgId,
    active_cluster_id: clusterId,
  });
  if (pErr) throw new Error(`profiles: ${pErr.message}`);

  const { error: cmErr } = await supabase.from('cluster_memberships').upsert(
    { user_id: userId, cluster_id: clusterId, role: 'cluster_admin' },
    { onConflict: 'user_id,cluster_id' },
  );
  if (cmErr) throw new Error(`cluster_memberships: ${cmErr.message}`);

  const { error: omErr } = await supabase.from('organization_memberships').upsert(
    {
      user_id: userId,
      org_id: orgId,
      role: 'admin',
      status: 'active',
      is_default_org: true,
    },
    { onConflict: 'user_id,org_id' },
  );
  if (omErr) throw new Error(`organization_memberships: ${omErr.message}`);

  console.log(`OK — ${targetEmail} is group admin + workspace admin. Sign in again or tap Check status.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
