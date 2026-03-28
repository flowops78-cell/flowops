#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './load-env.mjs';

const migrationsDir = resolve(REPO_ROOT, 'supabase/migrations');

if (!existsSync(migrationsDir)) {
  console.error('❌ debug:migrations — supabase/migrations missing.');
  process.exit(1);
}

const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) {
  console.error('❌ debug:migrations — no .sql migrations found.');
  process.exit(1);
}

const hasInit = files.some((f) => f.includes('init_canonical') || f.startsWith('00000000000000'));
if (!hasInit) {
  console.warn('⚠ debug:migrations — no canonical init migration detected by filename.');
}

console.log(`✅ debug:migrations — ${files.length} migration file(s).`);
for (const f of files) console.log(`   · ${f}`);
process.exit(0);
