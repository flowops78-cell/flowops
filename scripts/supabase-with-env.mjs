#!/usr/bin/env node
/**
 * Run Supabase CLI with env from .env / .env.local so SUPABASE_ACCESS_TOKEN is set.
 *
 * Usage:
 *   npm run supabase:cli -- db push --linked
 *   npm run supabase:cli -- functions deploy provision-user
 */
import { spawnSync } from 'node:child_process';
import { loadEnv, REPO_ROOT } from './debug/load-env.mjs';

loadEnv(REPO_ROOT);
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN. Add it to .env (Dashboard → Account → Access Tokens).');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npm run supabase:cli -- <supabase args...>');
  process.exit(1);
}

const r = spawnSync('supabase', args, {
  stdio: 'inherit',
  cwd: REPO_ROOT,
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
});
process.exit(r.status ?? 1);
