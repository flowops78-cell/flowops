# Flow Ops

Operations dashboard for activity, contact, reserve, and entry tracking with Supabase sync and CSV export.

Built with React 19, TypeScript, Vite, and Supabase.

## Docs

| File | Purpose |
|------|---------|
| [docs/app_user_manual.md](docs/app_user_manual.md) | End-user manual |
| [supabase/migrations/20260322230000_flow_ops_schema.sql](supabase/migrations/20260322230000_flow_ops_schema.sql) | Base schema, roles, RLS |
| [docs/rls_verification.sql](docs/rls_verification.sql) | Post-migration verification queries |
| [docs/verification.md](docs/verification.md) | Step-by-step verification runbook |

**SQL run order:**
- `20260322230000_flow_ops_schema.sql` → verify with `rls_verification.sql`

## Prerequisites

- Node.js 20+
- npm 10+

## Quick Install (Local)

1. Install dependencies
   `npm install`
2. Copy `.env.example` to `.env` for local use only
   `cp .env.example .env`
3. Set env vars in `.env`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Run app
   `npm run dev`

`.env` is gitignored and should stay local. Commit only non-secret template changes in `.env.example`.


App runs on `http://localhost:3000`.

## Pre-Deploy Validation

Run one command before every deploy:

`npm run deploy:check`

This performs:
- Type checks
- Production build

## Auth Setup

When Supabase env vars are configured, the app now requires sign-in.

1. Run [supabase/migrations/20260322230000_flow_ops_schema.sql](supabase/migrations/20260322230000_flow_ops_schema.sql). It is the single authoritative schema migration and already includes the current auth, invite, audit, and meta-org hardening.
2. Create Supabase Auth accounts for each real person (shared accounts are not allowed).
   - You can have multiple users with the same `app_role` (for example multiple operators and viewers).
   - Use one unique login ID per person.
   - Keep internal member IDs separate from login IDs.
3. Use a unique strong password for each account (do not reuse admin password).
4. For each user, set metadata keys:
   - `app_role`: `admin` | `operator` | `viewer`
   - `app_role` controls permissions regardless of login ID format.
5. Ensure profile row has an organization scope id.

Access request signup workflow (optional):
- Admin/operator creates an invite token in Settings → Invite Tokens.
- On the login page, users submit **Request access** with a target role, username tag, and the invite token.
- The `submit-access-request` edge function validates the invite token server-side and creates the org-scoped pending request.
- Admin/operator reviews pending requests in Settings → Account Requests.
- Approving a request calls Supabase Edge Function `provision-user` to create/update the account and sync profile role and scope using the initial password entered during approval.

Deploy edge functions:
- Install and login to Supabase CLI.
- Run from project root: `supabase functions deploy submit-access-request provision-user`.
- Set secret once: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`.
- Verify both functions exist in Supabase Dashboard → Edge Functions.
- If the functions are not deployed, create/invite the account manually in Supabase Auth and set `app_role` plus organization scope id.

Role-account checklist (recommended):
- Each account maps to exactly one `app_role`.
- Multiple accounts can share the same `app_role`.
- Assign all profiles for the same organization scope to the same scope id.
- Keep one unique login ID and one unique strong password per person.

Session management and audit logs:
- Every signed-in account is managed separately with username, started time, last active time, and session duration.
- Attributed events in Settings include account attribution and timestamp.
- Access in the app follows the signed-in account's role; each user only sees/actions what their role permits.

If Supabase is not configured, app runs in demo mode using local data.

## Deploy

This is a static Vite app. Deploy the `dist/` output from `npm run build`.

### Vercel

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### Any Static Host (S3/Cloudflare Pages/etc.)

1. `npm run build`
2. Upload `dist/`
3. Configure env vars at build time

## Script Reference

- `npm run dev` — local development server on port 3000
- `npm run typecheck` — TypeScript check
- `npm run build` — production build to `dist/`
- `npm run preview` — preview built app on port 4173
- `npm run deploy:check` — clean + typecheck + build

## Keyboard Shortcuts (Highlights)

- Global navigation (`G` then...): `D` (Dashboard), `A` (Activity), `V` (Reserve), `O` (Operations), `S` (Setup)
- Global creation (`C` then...): `A` (Activity), `O` (Team Member), `E` (Entry), `V` (Reserve Account)

---

## Legal Notice

Copyright © 2026 Flow Ops. All Rights Reserved.

This software is proprietary and is not licensed under any open-source license. Use, modification, and redistribution are restricted. For the full legal disclaimer and proprietary notice, please refer to the [NOTICE](./NOTICE) file in the root of this repository.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. SEE [NOTICE](./NOTICE) FOR DETAILS.
