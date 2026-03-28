#!/usr/bin/env node
/**
 * Probe PostgREST for relations the app uses. Anon key + Bearer anon:
 * - 200 (maybe empty) → exposed + RLS allows or returns []
 * - 404 + PGRST205 → not in schema cache / missing in DB
 * - 401/403 → auth/RLS blocked
 */
import { loadEnv } from './load-env.mjs';

loadEnv();

const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !anon) {
  console.error('❌ debug:api — missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}

const headers = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
  Accept: 'application/json',
};

/** @type {{ name: string, critical?: boolean }[]} */
const resources = [
  { name: 'entities', critical: true },
  { name: 'activities', critical: true },
  { name: 'records', critical: true },
  { name: 'profiles', critical: true },
  { name: 'organization_memberships', critical: true },
  { name: 'organizations' },
  { name: 'channels' },
  { name: 'collaborations' },
  { name: 'team_members' },
  { name: 'audit_events' },
  { name: 'operator_activities' },
  { name: 'entity_balances' },
  { name: 'audit_activity_integrity' },
  { name: 'audit_entity_health' },
  { name: 'audit_org_integrity' },
  { name: 'audit_channel_integrity' },
  { name: 'audit_record_anomalies' },
];

let criticalFail = false;
let anyPgrst205 = false;

async function probe(name) {
  const u = `${url}/rest/v1/${name}?select=*&limit=0`;
  try {
    const res = await fetch(u, { headers });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    const code = body?.code;
    const hint = body?.hint ? ` hint=${body.hint}` : '';
    if (res.status === 200) {
      return { ok: true, line: `✅ ${name} — HTTP 200` };
    }
    if (res.status === 404 && code === 'PGRST205') {
      anyPgrst205 = true;
      return {
        ok: false,
        line: `❌ ${name} — PGRST205 (not in PostgREST schema cache / missing relation)${hint}`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: true,
        line: `⚠ ${name} — HTTP ${res.status} (expected with anon-only probe; use a user JWT to test RLS)`,
      };
    }
    return {
      ok: false,
      line: `❌ ${name} — HTTP ${res.status} ${code || ''} ${body?.message || text.slice(0, 120)}`,
    };
  } catch (e) {
    return { ok: false, line: `❌ ${name} — network error: ${e?.message || e}` };
  }
}

console.log('🔍 debug:api — PostgREST probes (anon, select=id&limit=1)…\n');

for (const { name, critical } of resources) {
  const r = await probe(name);
  console.log(r.line);
  if (!r.ok && critical) criticalFail = true;
}

console.log('');
if (criticalFail) {
  console.error('❌ debug:api — one or more critical relations failed (see PGRST205 / errors). Apply migrations and reload API schema in Supabase.');
  process.exit(1);
}

if (anyPgrst205) {
  console.warn('⚠ debug:api — optional views missing (app may still run). Apply ledger/audit migrations.');
}

console.log('✅ debug:api — critical relations reachable at HTTP layer (or RLS-blocked with 401/403).');
process.exit(0);
