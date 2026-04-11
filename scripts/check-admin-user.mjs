/**
 * Lists auth users with service role and prints the user with email admin@admin.os if present.
 *
 * Run from repo root (loads .env when using Node 20+):
 *   node --env-file=.env scripts/check-admin-user.mjs
 *
 * Required env: VITE_SUPABASE_URL, SB_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SB_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: { users }, error } = await supabase.auth.admin.listUsers();
if (error) {
  console.error('Error listing users:', error);
  process.exit(1);
}

const admin = users.find((u) => u.email === 'admin@admin.os');
console.log('Admin User:', JSON.stringify(admin, null, 2));
