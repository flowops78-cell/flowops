const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkStatus() {
  console.log('Checking profiles and roles...');

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*');

  if (profileError) {
    console.error('Error fetching profiles:', profileError.message);
  } else {
    console.log('Profiles found:', profiles.length);
    console.log(JSON.stringify(profiles, null, 2));
  }

  const { data: roles, error: roleError } = await supabase
    .from('user_roles')
    .select('*');

  if (roleError) {
    console.error('Error fetching roles:', roleError.message);
  } else {
    console.log('User roles found:', roles.length);
    console.log(JSON.stringify(roles, null, 2));
  }
}

checkStatus().catch(console.error);
