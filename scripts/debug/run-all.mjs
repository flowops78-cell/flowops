#!/usr/bin/env node
/**
 * Full automated debug pass (local + remote probes that need .env).
 *
 * DEBUG_SKIP_REMOTE=1 — skip PostgREST, Edge, and DB CLI steps (CI / offline).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from './load-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

loadEnv();

const skipRemote = process.argv.includes('--local') || process.env.DEBUG_SKIP_REMOTE === '1';

function runStep(label, args) {
  console.log(`\n────────── ${label} ──────────\n`);
  const r = spawnSync('node', args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n❌ debug:all stopped at: ${label} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

console.log('═══════════════════════════════════════════════════════');
console.log('  Flow Ops — automated debug (debug:all)');
console.log('═══════════════════════════════════════════════════════');

runStep('1/6 Environment', [resolve(__dirname, 'check-env.mjs')]);
runStep('2/6 Migration files on disk', [resolve(__dirname, 'check-migrations.mjs')]);
runStep('3/6 Typecheck + tests', [resolve(__dirname, 'check-app.mjs')]);

if (skipRemote) {
  console.log('\n────────── 4–6/6 Skipped (--local / DEBUG_SKIP_REMOTE=1) ──────────\n');
} else {
  runStep('4/6 PostgREST (anon probes)', [resolve(__dirname, 'check-postgrest.mjs')]);
  runStep('5/6 Edge function smoke', [resolve(__dirname, 'check-edge-function.mjs')]);
  runStep('6/6 DB SQL via CLI (optional)', [resolve(__dirname, 'check-db-cli.mjs')]);
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  ✅ debug:all completed');
console.log('═══════════════════════════════════════════════════════\n');
process.exit(0);
