#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { REPO_ROOT } from './load-env.mjs';

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (r.status !== 0) {
    console.error(`❌ debug:app — ${label} failed:\n`, r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  console.log(`✅ debug:app — ${label}`);
}

console.log('🔍 debug:app — typecheck + unit tests…\n');
run('npm', ['run', 'typecheck', '--silent'], 'typecheck');
run('npm', ['run', 'test', '--silent'], 'vitest');
console.log('\n✅ debug:app — all passed.');
process.exit(0);
