#!/usr/bin/env node
/**
 * Verifies linked remote Postgres connectivity via Supabase CLI (no schema writes).
 *
 * Uses `supabase db push --dry-run` because older CLIs (e.g. v2.75) do not ship
 * `supabase db execute`. For ad-hoc SQL against the remote DB, upgrade the CLI
 * or use psql with the connection string from the Supabase dashboard.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadEnv, REPO_ROOT } from './load-env.mjs';

loadEnv();

const which = spawnSync('which', ['supabase'], { encoding: 'utf8' });
if (which.status !== 0) {
  console.warn('⚠ debug:db — Supabase CLI not in PATH. Install: https://supabase.com/docs/guides/cli');
  process.exit(0);
}

const r = spawnSync(
  'supabase',
  ['db', 'push', '--dry-run'],
  {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  },
);

if (r.status !== 0) {
  console.warn('⚠ debug:db — `supabase db push --dry-run` failed (run `supabase link` if remote):');
  console.warn(r.stderr || r.stdout || '(no output)');
  process.exit(1);
}

if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
console.log('✅ debug:db — linked remote Postgres reachable (dry-run).');
console.log(
  `   Optional: run SQL checks with psql or upgrade CLI; verify script: ${resolve(REPO_ROOT, 'supabase/scripts/verify_public_schema.sql')}`,
);
process.exit(0);
