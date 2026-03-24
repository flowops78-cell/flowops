import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkStatus() {
  console.log('Checking profiles and roles in:', supabaseUrl);

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*');

  if (profileError) {
    console.error('Error fetching profiles:', profileError.message);
  } else {
    console.log('Profiles:', JSON.stringify(profiles, null, 2));
  }

  const { data: roles, error: roleError } = await supabase
    .from('user_roles')
    .select('*');

  if (roleError) {
    console.error('Error fetching roles:', roleError.message);
  } else {
    console.log('User roles:', JSON.stringify(roles, null, 2));
  }
  
  const { data: memberships, error: membershipError } = await supabase
    .from('org_memberships')
    .select('*');

  if (membershipError) {
    console.error('Error fetching memberships:', membershipError.message);
  } else {
    console.log('Org memberships:', JSON.stringify(memberships, null, 2));
  }
}

checkStatus().catch(console.error);
