#!/usr/bin/env node
/**
 * Smoke-test Edge Function deployment: without a user JWT we expect 401 from our handler,
 * not connection errors or 404 missing function.
 */
import { loadEnv } from './load-env.mjs';

loadEnv();

const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anon =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('❌ debug:functions — missing VITE env.');
  process.exit(1);
}

const endpoint = `${url}/functions/v1/revoke-other-sessions`;

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  const text = await res.text();
  if (res.status === 404) {
    console.error('❌ debug:functions — 404 (deploy: supabase functions deploy revoke-other-sessions)');
    process.exit(1);
  }

  if (res.status === 401) {
    const j = text.includes('Missing') || text.includes('Invalid') || text.includes('JWT');
    if (j || text.length < 300) {
      console.log('✅ debug:functions — revoke-other-sessions responds (401 expected without Bearer user token).');
      process.exit(0);
    }
  }

  console.log(`⚠ debug:functions — HTTP ${res.status}: ${text.slice(0, 200)}`);
  process.exit(0);
} catch (e) {
  console.error('❌ debug:functions —', e?.message || e);
  process.exit(1);
}
