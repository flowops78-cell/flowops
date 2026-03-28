import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function provision(
  email: string | undefined,
  password: string | undefined,
  role: string,
  scopeId: string | undefined,
  isMetaOrg: boolean
) {
  if (!email || !password) {
    throw new Error('Email and password must be provided for provisioning.');
  }

  console.log(`Provisioning ${role} account: ${email}...`);

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { app_role: role }
  });

  const userId = userError?.message.includes('already registered')
    ? (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === email)?.id
    : userData?.user?.id;

  if (!userId) throw new Error(`Unable to resolve user ID for ${email}`);

  let orgId = !isMetaOrg ? scopeId : "50d41461-d715-46c0-988a-131a6cf711f0";
  let metaOrgId = isMetaOrg ? scopeId : "9aa66524-7831-411c-b5f0-6218e3a247db";

  if (isMetaOrg) {
    await supabase.from('clusters').upsert({ id: metaOrgId, name: 'Secondary Cluster', created_by: userId });
    await supabase.from('organizations').upsert({ id: orgId, name: 'Linked Organization', cluster_id: metaOrgId });
    await supabase.from('cluster_memberships').upsert({
      user_id: userId,
      cluster_id: metaOrgId,
      role: 'cluster_admin'
    }, { onConflict: 'user_id,cluster_id' });
  } else {
    await supabase.from('organizations').upsert({ id: orgId, name: 'Target Organization', cluster_id: metaOrgId });
  }

  await supabase.from('profiles').upsert({ id: userId, active_org_id: orgId, active_cluster_id: metaOrgId });
  await supabase.from('organization_memberships').upsert({
    user_id: userId,
    org_id: orgId,
    role,
    status: 'active',
    is_default_org: true
  }, { onConflict: 'user_id,org_id' });
}

async function main() {
  // Admin 2
  await provision(
    process.env.FLOW_OPS_ADMIN_2_EMAIL,
    process.env.FLOW_OPS_ADMIN_2_PASSWORD,
    'admin',
    process.env.FLOW_OPS_ADMIN_2_META_ORG_ID,
    true
  );
  // Operator
  await provision(
    process.env.FLOW_OPS_OPERATOR_EMAIL,
    process.env.FLOW_OPS_OPERATOR_PASSWORD,
    'operator',
    process.env.FLOW_OPS_OPERATOR_ORG_ID,
    false
  );
  console.log('Secondary accounts provisioned successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
