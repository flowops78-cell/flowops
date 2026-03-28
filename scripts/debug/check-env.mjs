#!/usr/bin/env node
import { loadEnv, REPO_ROOT } from './load-env.mjs';

loadEnv();

const url = process.env.VITE_SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const failures = [];

if (!url || !key) {
  failures.push(
    'Missing VITE_SUPABASE_URL and a public key: set VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY in .env / .env.local.',
  );
} else {
  if (
    url.includes('your-project') ||
    url.includes('placeholder') ||
    url.includes('YOUR_PROJECT_REF')
  ) {
    failures.push('VITE_SUPABASE_URL looks like a placeholder.');
  }
  if (
    key === 'your-anon-key' ||
    key.includes('your_supabase') ||
    key.includes('publishable_or_anon') ||
    key.length < 20
  ) {
    failures.push('VITE public Supabase key looks invalid or placeholder.');
  }
}

const sr = process.env.SB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!sr) {
  console.warn('⚠ Optional: SB_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY not set (debug:db CLI step may be unavailable).');
}

console.log('📁 Repo root:', REPO_ROOT);

if (failures.length) {
  console.error('❌ debug:env failed:\n', failures.join('\n'));
  process.exit(1);
}

console.log('✅ debug:env — Supabase client env looks configured.');
process.exit(0);
