/**
 * Put an existing Auth user on the same workspace (and group) as an anchor user,
 * with a workspace role only (no cluster_admin unless role is cluster use case).
 *
 * Usage:
 *   npx tsx scripts/assign_to_admin_workspace.ts <target-email> <admin|operator|viewer> [anchor-email]
 *
 * Default anchor: admin@ops.os
 *
 * Env: VITE_SUPABASE_URL, SB_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

type OrgRole = 'admin' | 'operator' | 'viewer';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetEmail = (process.argv[2] || '').trim().toLowerCase();
const orgRoleRaw = (process.argv[3] || 'operator').trim().toLowerCase();
const anchorEmail = (process.argv[4] || 'admin@ops.os').trim().toLowerCase();

const orgRole: OrgRole =
  orgRoleRaw === 'admin' || orgRoleRaw === 'operator' || orgRoleRaw === 'viewer' ? orgRoleRaw : 'operator';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SB_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
  console.error('Usage: npx tsx scripts/assign_to_admin_workspace.ts <target-email> <admin|operator|viewer> [anchor-email]');
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
  const anchorId = await findUserIdByEmail(anchorEmail);
  if (!anchorId) {
    console.error(`No Auth user for anchor ${anchorEmail}`);
    process.exit(1);
  }

  const { data: anchorProfile, error: profErr } = await supabase
    .from('profiles')
    .select('active_org_id, active_cluster_id')
    .eq('id', anchorId)
    .maybeSingle();

  if (profErr) throw new Error(profErr.message);
  const orgId = anchorProfile?.active_org_id as string | null | undefined;
  const clusterId = anchorProfile?.active_cluster_id as string | null | undefined;

  if (!orgId || !clusterId) {
    console.error(
      `Anchor ${anchorEmail} has no active_org_id/active_cluster_id on profile. Run attach_workspace_by_email for them first.`,
    );
    process.exit(1);
  }

  const targetId = await findUserIdByEmail(targetEmail);
  if (!targetId) {
    console.error(`No Auth user for ${targetEmail}`);
    process.exit(1);
  }

  if (targetId === anchorId) {
    console.error('Target and anchor must be different users.');
    process.exit(1);
  }

  console.log(`Workspace ${orgId}, group ${clusterId} (from ${anchorEmail})`);

  const { error: pErr } = await supabase.from('profiles').upsert({
    id: targetId,
    active_org_id: orgId,
    active_cluster_id: clusterId,
  });
  if (pErr) throw new Error(`profiles: ${pErr.message}`);

  const { error: omErr } = await supabase.from('organization_memberships').upsert(
    {
      user_id: targetId,
      org_id: orgId,
      role: orgRole,
      status: 'active',
      is_default_org: true,
    },
    { onConflict: 'user_id,org_id' },
  );
  if (omErr) throw new Error(`organization_memberships: ${omErr.message}`);

  // Clear other default-org flags for this user (mirror assign-org-admin behavior)
  await supabase
    .from('organization_memberships')
    .update({ is_default_org: false })
    .eq('user_id', targetId)
    .neq('org_id', orgId);

  await supabase
    .from('organization_memberships')
    .update({ is_default_org: true, status: 'active' })
    .eq('user_id', targetId)
    .eq('org_id', orgId);

  console.log(`OK — ${targetEmail} is workspace member as ${orgRole}. Sign in or tap Check status.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
