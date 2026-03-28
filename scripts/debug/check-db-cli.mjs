#!/usr/bin/env node
/**
 * If Supabase CLI is linked, run verify_public_schema.sql against the remote DB.
 * Skips gracefully when `supabase` is missing or not linked.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv, REPO_ROOT } from './load-env.mjs';

loadEnv();

const sqlPath = resolve(REPO_ROOT, 'supabase/scripts/verify_public_schema.sql');
if (!existsSync(sqlPath)) {
  console.warn('⚠ debug:db — verify_public_schema.sql missing, skip.');
  process.exit(0);
}

const which = spawnSync('which', ['supabase'], { encoding: 'utf8' });
if (which.status !== 0) {
  console.warn('⚠ debug:db — Supabase CLI not in PATH. Install: https://supabase.com/docs/guides/cli');
  process.exit(0);
}

const r = spawnSync('supabase', ['db', 'execute', '--file', sqlPath], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  stdio: ['inherit', 'pipe', 'pipe'],
});

if (r.status !== 0) {
  console.warn('⚠ debug:db — supabase db execute failed (run `supabase link` if remote):');
  console.warn(r.stderr || r.stdout || '(no output)');
  process.exit(0);
}

if (r.stdout) console.log(r.stdout);
console.log('✅ debug:db — SQL verification completed.');
process.exit(0);
