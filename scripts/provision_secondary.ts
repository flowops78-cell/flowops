import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function provision(email, password, role, scopeId, isMetaOrg) {
  console.log(`Provisioning ${role} account: ${email}...`);

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { app_role: role }
  });

  const userId = userError?.message.includes('already registered')
    ? (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === email)?.id
    : userData.user.id;

  if (!userId) throw new Error(`Unable to resolve user ID for ${email}`);

  let orgId = !isMetaOrg ? scopeId : "50d41461-d715-46c0-988a-131a6cf711f0";
  let metaOrgId = isMetaOrg ? scopeId : "9aa66524-7831-411c-b5f0-6218e3a247db";

  if (isMetaOrg) {
    await supabase.from('org_clusters').upsert({ id: metaOrgId, name: 'Secondary Cluster' });
    await supabase.from('orgs').upsert({ id: orgId, name: 'Linked Organization', cluster_id: metaOrgId });
    await supabase.from('org_meta_mapping').upsert({ org_id: orgId, meta_org_id: metaOrgId });
  } else {
    await supabase.from('orgs').upsert({ id: orgId, name: 'Target Organization', cluster_id: metaOrgId });
  }

  await supabase.from('user_roles').upsert({ user_id: userId, role });
  await supabase.from('profiles').upsert({ id: userId, org_id: orgId, meta_org_id: metaOrgId });
  await supabase.from('org_memberships').upsert({
    user_id: userId,
    org_id: orgId,
    role,
    status: 'active',
    is_default_org: true
  });
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
