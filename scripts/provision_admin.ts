import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.FLOW_OPS_ADMIN_EMAIL;
const adminPassword = process.env.FLOW_OPS_ADMIN_PASSWORD;

if (!supabaseUrl || !serviceRoleKey || !adminEmail || !adminPassword) {
  console.error('Missing required environment variables (URL, Key, Email, or Password).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function setup() {
  console.log('Provisioning global admin account...');

  // 1. Create the Auth User
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: { app_role: 'admin' }
  });

  if (userError) {
    if (userError.message.includes('already registered')) {
      console.log('User already exists, updating role and meta-org...');
    } else {
      throw new Error(`Auth creation failed: ${userError.message}`);
    }
  }

  const userId = userError?.message.includes('already registered') 
    ? (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === adminEmail)?.id
    : userData.user.id;

  if (!userId) throw new Error('Unable to resolve user ID.');

  // 2. Provision the Cluster and Organization
  console.log('Provisioning cluster and organization...');
  const clusterId = "9aa66524-7831-411c-b5f0-6218e3a247db"; // fixed for initial setup
  const orgId = "50d41461-d715-46c0-988a-131a6cf711f0"; // fixed for initial setup

  await supabase.from('clusters').upsert({ id: clusterId, name: 'Main Cluster', created_by: userId });
  await supabase.from('organizations').upsert({ id: orgId, name: 'Main Organization', cluster_id: clusterId });

  // 3. Assign the Roles
  console.log('Assigning roles and profile...');
  await supabase.from('platform_roles').upsert({ user_id: userId, role: 'platform_admin' });
  await supabase.from('cluster_memberships').upsert({
    user_id: userId,
    cluster_id: clusterId,
    role: 'cluster_admin'
  }, { onConflict: 'user_id,cluster_id' });
  await supabase.from('profiles').upsert({ 
    id: userId, 
    active_org_id: orgId,
    active_cluster_id: clusterId
  });

  // 4. Ensure Org Membership
  await supabase.from('organization_memberships').upsert({
    user_id: userId,
    org_id: orgId,
    role: 'admin',
    status: 'active',
    is_default_org: true
  }, { onConflict: 'user_id,org_id' });

  console.log('Global admin provisioned successfully!');
}

setup().catch(err => {
  console.error(err);
  process.exit(1);
});
