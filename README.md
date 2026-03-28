# Flow Ops

Operations dashboard for activity, contact, reserve, and entry tracking with Supabase sync and CSV export.

Built with React 19, TypeScript, Vite, and Supabase.

## Docs

| File | Purpose |
|------|---------|
| [docs/app_user_manual.md](docs/app_user_manual.md) | End-user manual |
| [docs/glossary.md](docs/glossary.md) | Activity vs record vs channel vs network profile |
| [supabase/migrations/00000000000000_init_canonical_schema.sql](supabase/migrations/00000000000000_init_canonical_schema.sql) | Single baseline: schema, roles, RLS, ledger/audit views |
| [docs/rls_verification.sql](docs/rls_verification.sql) | Post-migration verification queries |
| [docs/verification.md](docs/verification.md) | Step-by-step verification runbook |

**SQL run order:**
- All environments (CLI): `supabase db push` or `supabase db reset` applies `00000000000000_init_canonical_schema.sql`.
- Manual / hosted SQL editor: run that file once per database; then verify with `docs/rls_verification.sql`.

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
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — the Supabase **anon** (public) key for the browser client. The app reads this variable (see `src/lib/supabase.ts`). Older docs may call it `VITE_SUPABASE_ANON_KEY`; use the publishable key name to match `.env.example`.
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

1. Run [supabase/migrations/00000000000000_init_canonical_schema.sql](supabase/migrations/00000000000000_init_canonical_schema.sql) (via Supabase CLI migrations or SQL editor). Drifted legacy databases may need manual `ALTER TABLE` / view fixes before aligning to this baseline.
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
- Run from project root:  
  `supabase functions deploy submit-access-request provision-user manage-organizations export-data revoke-other-sessions`
- Set secrets (names vary by function; at minimum service role as `SB_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` per function code):  
  `supabase secrets set SB_SERVICE_ROLE_KEY=your-service-role-key FLOW_OPS_ALLOWED_ORIGINS=https://your-app.example.com`
- Verify functions in Supabase Dashboard → Edge Functions.
- `FLOW_OPS_ALLOWED_ORIGINS` must be a comma-separated list of exact browser origins allowed to call the edge functions. Wildcard preview domains are not trusted.
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

Cloudflare response headers:
- The app ships a static header file at [public/_headers](public/_headers) so hosts that support Pages-style header manifests can enforce CSP and anti-framing headers at the HTTP layer.
- `frame-ancestors` must be delivered as a response header. Browsers ignore it inside a `<meta http-equiv="Content-Security-Policy">` tag.
- The CSP in [index.html](index.html) is limited to directives that still work from a meta tag. The stronger anti-framing policy is defined in [public/_headers](public/_headers).
- If your Cloudflare deployment path does not consume `_headers`, set the same `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, and `X-Content-Type-Options` values in Cloudflare response-header rules or your Worker config.

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
