-- Run in Supabase Dashboard → SQL Editor (or psql). Shows result rows at the end.
-- Drift repair / view alignment; safe to re-run against a DB that used an older init or manual edits.

-- -----------------------------------------------------------------------------
-- (Historical) restoration_live_schema_audit_views — logic kept here for SQL editor use.
-- Idempotent restoration for databases that existed before the single baseline
-- (00000000000000_init_canonical_schema.sql) or drifted after migration squash.
--
-- Covers:
--   • organizations/clusters slug + tag (PostgREST selects no longer 400)
--   • collaborations.status + activities.start_time / activity_mode contract
--   • public.log_audit_event — PL/pgSQL vars must not use name "current_role"
--     (reserved / conflicts with CURRENT_ROLE in newer Postgres)
--   • Ledger + audit views recreated + GRANTs (fixes stale total_units / column drift)
--   • PostgREST schema cache hint (Supabase)
--
-- Safe to re-run: IF NOT EXISTS / OR REPLACE where applicable.
-- Does not: insert platform_roles, touch auth.users, or change RLS policies.
-- Supabase runs each migration in a transaction — do not wrap this file in BEGIN/COMMIT.
--
-- If `supabase db push` skips this (already in schema_migrations), re-apply manually:
--   supabase/scripts/restoration_run_in_sql_editor.sql  (paste in Dashboard → SQL)
-- -----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Metadata columns (frontend + authority queries)
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE public.clusters ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.clusters ADD COLUMN IF NOT EXISTS tag text;

-- ---------------------------------------------------------------------------
-- 2. collaborations.status (required by app + types)
-- ---------------------------------------------------------------------------
ALTER TABLE public.collaborations ADD COLUMN IF NOT EXISTS status text;

UPDATE public.collaborations
SET status = 'active'
WHERE status IS NULL
   OR status NOT IN ('active', 'inactive', 'archived');

ALTER TABLE public.collaborations ALTER COLUMN status SET DEFAULT 'active';

-- SET NOT NULL only when no nulls remain (otherwise whole migration would roll back).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'status'
  )
  AND NOT EXISTS (SELECT 1 FROM public.collaborations WHERE status IS NULL) THEN
    ALTER TABLE public.collaborations ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collaborations_status_check'
      AND conrelid = 'public.collaborations'::regclass
  ) THEN
    ALTER TABLE public.collaborations
      ADD CONSTRAINT collaborations_status_check
      CHECK (status IN ('active', 'inactive', 'archived'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. activities.start_time + activity_mode
-- ---------------------------------------------------------------------------
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS start_time timestamptz;

UPDATE public.activities
SET start_time = COALESCE(start_time, date, created_at, now())
WHERE start_time IS NULL;

ALTER TABLE public.activities ALTER COLUMN start_time SET DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'start_time'
  )
  AND NOT EXISTS (SELECT 1 FROM public.activities WHERE start_time IS NULL) THEN
    ALTER TABLE public.activities ALTER COLUMN start_time SET NOT NULL;
  END IF;
END $$;

ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS activity_mode text;

UPDATE public.activities
SET activity_mode = 'value'
WHERE activity_mode IS NULL
   OR activity_mode NOT IN ('value');

ALTER TABLE public.activities ALTER COLUMN activity_mode SET DEFAULT 'value';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activities_activity_mode_check'
      AND conrelid = 'public.activities'::regclass
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_activity_mode_check
      CHECK (activity_mode IN ('value'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. log_audit_event — align with baseline (avoid variable name current_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_details text DEFAULT NULL,
  p_actor_label text DEFAULT NULL,
  p_operator_activity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_current_role app_role;
  inserted_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  v_org_id := public.get_my_org_id();
  v_current_role := public.get_my_role();

  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.audit_events (
    org_id,
    entity_id,
    actor_user_id,
    actor_label,
    actor_role,
    action,
    entity,
    operator_activity_id,
    amount,
    details
  )
  VALUES (
    v_org_id,
    p_entity_id,
    auth.uid(),
    NULLIF(trim(COALESCE(p_actor_label, '')), ''),
    v_current_role,
    p_action,
    p_entity,
    p_operator_activity_id,
    p_amount,
    NULLIF(trim(COALESCE(p_details, '')), '')
  )
  RETURNING id INTO inserted_event_id;

  RETURN inserted_event_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ledger + audit views (must match 00000000000000_init_canonical_schema 8A)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.audit_record_ledger
WITH (security_invoker = true) AS
SELECT
  r.id AS record_id,
  r.org_id,
  r.activity_id,
  a.label AS activity_label,
  a.date AS activity_date,
  r.entity_id,
  e.name AS entity_name,
  COALESCE(NULLIF(r.channel_label, ''), 'Unassigned') AS channel_label,
  r.direction,
  r.status,
  r.unit_amount,
  CASE
    WHEN r.direction = 'increase' THEN r.unit_amount
    WHEN r.direction = 'decrease' THEN -r.unit_amount
    ELSE 0::numeric
  END AS signed_amount,
  CASE
    WHEN r.status = 'applied' AND r.direction = 'increase' THEN r.unit_amount
    WHEN r.status = 'applied' AND r.direction = 'decrease' THEN -r.unit_amount
    ELSE 0::numeric
  END AS applied_signed_amount,
  CASE
    WHEN r.status = 'applied' AND r.direction = 'increase' THEN r.unit_amount
    ELSE 0::numeric
  END AS applied_increase_amount,
  CASE
    WHEN r.status = 'applied' AND r.direction = 'decrease' THEN r.unit_amount
    ELSE 0::numeric
  END AS applied_decrease_amount,
  r.transfer_group_id,
  r.target_entity_id,
  r.left_at,
  r.created_at,
  r.updated_at
FROM public.records r
LEFT JOIN public.activities a ON a.id = r.activity_id
LEFT JOIN public.entities e ON e.id = r.entity_id;

CREATE OR REPLACE VIEW public.entity_balances
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.org_id,
  e.name,
  COALESCE(SUM(l.applied_signed_amount), 0)::numeric(12, 2) AS net,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_inflow,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS record_count,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied' AND l.applied_signed_amount > 0)::integer AS surplus_count,
  MAX(l.created_at) AS last_active,
  0::numeric(12, 2) AS avg_duration_hours
FROM public.entities e
LEFT JOIN public.audit_record_ledger l ON l.entity_id = e.id
GROUP BY e.id, e.org_id, e.name;

CREATE OR REPLACE VIEW public.audit_activity_integrity
WITH (security_invoker = true) AS
SELECT
  a.org_id,
  a.id AS activity_id,
  a.label AS activity_label,
  a.date AS activity_date,
  COUNT(l.record_id)::integer AS total_records,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS applied_record_count,
  COUNT(l.record_id) FILTER (WHERE l.status IN ('pending', 'deferred'))::integer AS open_record_count,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_increase,
  COALESCE(SUM(l.applied_decrease_amount), 0)::numeric(12, 2) AS total_decrease,
  COALESCE(SUM(l.applied_signed_amount), 0)::numeric(12, 2) AS net_amount,
  CASE
    WHEN ABS(COALESCE(SUM(l.applied_signed_amount), 0)) < 0.01 THEN 'ok'
    ELSE 'broken'
  END AS status,
  MAX(l.created_at) AS last_record_at
FROM public.activities a
LEFT JOIN public.audit_record_ledger l ON l.activity_id = a.id
GROUP BY a.org_id, a.id, a.label, a.date;

CREATE OR REPLACE VIEW public.audit_entity_health
WITH (security_invoker = true) AS
SELECT
  e.org_id,
  e.id AS entity_id,
  e.name AS entity_name,
  COUNT(l.record_id)::integer AS total_records,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS applied_record_count,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_increase,
  COALESCE(SUM(l.applied_decrease_amount), 0)::numeric(12, 2) AS total_decrease,
  COALESCE(SUM(l.applied_signed_amount), 0)::numeric(12, 2) AS net_amount,
  CASE
    WHEN COALESCE(SUM(l.applied_signed_amount), 0) < 0 THEN 'watch'
    ELSE 'ok'
  END AS status,
  MAX(l.created_at) AS last_record_at
FROM public.entities e
LEFT JOIN public.audit_record_ledger l ON l.entity_id = e.id
GROUP BY e.org_id, e.id, e.name;

CREATE OR REPLACE VIEW public.audit_channel_integrity
WITH (security_invoker = true) AS
SELECT
  l.org_id,
  l.channel_label,
  COUNT(l.record_id)::integer AS total_records,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS applied_record_count,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_increase,
  COALESCE(SUM(l.applied_decrease_amount), 0)::numeric(12, 2) AS total_decrease,
  COALESCE(SUM(l.applied_signed_amount), 0)::numeric(12, 2) AS net_amount,
  CASE
    WHEN ABS(COALESCE(SUM(l.applied_signed_amount), 0)) < 0.01 THEN 'ok'
    ELSE 'broken'
  END AS status
FROM public.audit_record_ledger l
GROUP BY l.org_id, l.channel_label;

CREATE OR REPLACE VIEW public.audit_org_integrity
WITH (security_invoker = true) AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  COUNT(l.record_id)::integer AS total_records,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS applied_record_count,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_increase,
  COALESCE(SUM(l.applied_decrease_amount), 0)::numeric(12, 2) AS total_decrease,
  COALESCE(SUM(l.applied_signed_amount), 0)::numeric(12, 2) AS net_amount,
  COUNT(a.activity_id) FILTER (WHERE a.status = 'broken')::integer AS broken_activity_count,
  CASE
    WHEN ABS(COALESCE(SUM(l.applied_signed_amount), 0)) < 0.01
      AND COUNT(a.activity_id) FILTER (WHERE a.status = 'broken') = 0 THEN 'ok'
    ELSE 'broken'
  END AS status
FROM public.organizations o
LEFT JOIN public.audit_record_ledger l ON l.org_id = o.id
LEFT JOIN public.audit_activity_integrity a ON a.org_id = o.id
GROUP BY o.id, o.name;

CREATE OR REPLACE VIEW public.audit_record_anomalies
WITH (security_invoker = true) AS
SELECT
  CONCAT('activity-imbalance:', a.activity_id) AS anomaly_id,
  a.org_id,
  'activity_imbalance'::text AS anomaly_type,
  'error'::text AS severity,
  a.activity_id,
  NULL::uuid AS entity_id,
  NULL::text AS channel_label,
  1::integer AS affected_count,
  CONCAT('Activity net is ', a.net_amount::text) AS detail
FROM public.audit_activity_integrity a
WHERE a.status = 'broken'

UNION ALL

SELECT
  CONCAT('org-imbalance:', o.org_id) AS anomaly_id,
  o.org_id,
  'org_imbalance'::text AS anomaly_type,
  'error'::text AS severity,
  NULL::uuid AS activity_id,
  NULL::uuid AS entity_id,
  NULL::text AS channel_label,
  1::integer AS affected_count,
  CONCAT('Organization net is ', o.net_amount::text) AS detail
FROM public.audit_org_integrity o
WHERE o.status = 'broken'

UNION ALL

SELECT
  CONCAT('channel-imbalance:', c.org_id, ':', c.channel_label) AS anomaly_id,
  c.org_id,
  'channel_imbalance'::text AS anomaly_type,
  'warning'::text AS severity,
  NULL::uuid AS activity_id,
  NULL::uuid AS entity_id,
  c.channel_label,
  1::integer AS affected_count,
  CONCAT('Channel net is ', c.net_amount::text) AS detail
FROM public.audit_channel_integrity c
WHERE c.status = 'broken'

UNION ALL

SELECT
  CONCAT('transfer-pair:', r.org_id, ':', r.transfer_group_id::text) AS anomaly_id,
  r.org_id,
  'missing_transfer_pair'::text AS anomaly_type,
  'warning'::text AS severity,
  NULL::uuid AS activity_id,
  NULL::uuid AS entity_id,
  NULL::text AS channel_label,
  COUNT(*)::integer AS affected_count,
  'Transfer group does not contain an even number of records.' AS detail
FROM public.records r
WHERE r.transfer_group_id IS NOT NULL
GROUP BY r.org_id, r.transfer_group_id
HAVING MOD(COUNT(*), 2) <> 0

UNION ALL

SELECT
  CONCAT('transfer-target:', r.id::text) AS anomaly_id,
  r.org_id,
  'transfer_missing_target'::text AS anomaly_type,
  'warning'::text AS severity,
  r.activity_id,
  r.entity_id,
  COALESCE(NULLIF(r.channel_label, ''), 'Unassigned') AS channel_label,
  1::integer AS affected_count,
  'Transfer record is missing a target entity.' AS detail
FROM public.records r
WHERE r.direction = 'transfer'
  AND r.target_entity_id IS NULL

UNION ALL

SELECT
  CONCAT('time-anomaly:', r.id::text) AS anomaly_id,
  r.org_id,
  'invalid_exit_time'::text AS anomaly_type,
  'error'::text AS severity,
  r.activity_id,
  r.entity_id,
  COALESCE(NULLIF(r.channel_label, ''), 'Unassigned') AS channel_label,
  1::integer AS affected_count,
  'Record left_at precedes created_at.' AS detail
FROM public.records r
WHERE r.left_at IS NOT NULL
  AND r.left_at < r.created_at;

GRANT SELECT ON public.audit_record_ledger TO authenticated, service_role;
GRANT SELECT ON public.entity_balances TO authenticated, service_role;
GRANT SELECT ON public.audit_activity_integrity TO authenticated, service_role;
GRANT SELECT ON public.audit_entity_health TO authenticated, service_role;
GRANT SELECT ON public.audit_channel_integrity TO authenticated, service_role;
GRANT SELECT ON public.audit_org_integrity TO authenticated, service_role;
GRANT SELECT ON public.audit_record_anomalies TO authenticated, service_role;

-- PostgREST / API schema cache (Supabase). Safe no-op if not listening.
NOTIFY pgrst, 'reload schema';

-- ============ VERIFICATION (you should see these result sets) ============

CREATE TABLE IF NOT EXISTS public._flow_ops_schema_patch_runs (
  id bigserial PRIMARY KEY,
  label text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._flow_ops_schema_patch_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._flow_ops_schema_patch_runs FROM PUBLIC;
GRANT ALL ON public._flow_ops_schema_patch_runs TO postgres;

INSERT INTO public._flow_ops_schema_patch_runs (label)
VALUES ('manual_restoration_run_in_sql_editor');

SELECT 'columns_ok' AS check_id, c.table_name, c.column_name
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (
    (c.table_name = 'organizations' AND c.column_name IN ('slug', 'tag', 'cluster_id'))
    OR (c.table_name = 'clusters' AND c.column_name IN ('slug', 'tag'))
    OR (c.table_name = 'collaborations' AND c.column_name = 'status')
    OR (c.table_name = 'activities' AND c.column_name IN ('start_time', 'activity_mode'))
  )
ORDER BY 2, 3;

SELECT 'views_ok' AS check_id, v.table_name
FROM information_schema.views v
WHERE v.table_schema = 'public'
  AND v.table_name IN (
    'audit_record_ledger',
    'entity_balances',
    'audit_activity_integrity',
    'audit_entity_health',
    'audit_channel_integrity',
    'audit_org_integrity',
    'audit_record_anomalies'
  )
ORDER BY 2;

SELECT 'ledger_readable' AS check_id,
  (SELECT count(*)::bigint FROM public.audit_record_ledger) AS audit_record_ledger_rows,
  (SELECT count(*)::bigint FROM public.entity_balances) AS entity_balances_rows;

SELECT 'patch_log_tail' AS check_id, id, label, applied_at
FROM public._flow_ops_schema_patch_runs
ORDER BY id DESC
LIMIT 5;
