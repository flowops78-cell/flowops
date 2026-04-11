-- -------------------------------------------------------------
-- 00000000000001_audit_fixes.sql
-- Adds: transfer CHECK constraint, composite indexes, audit view
-- RLS verification.
-- -------------------------------------------------------------

BEGIN;

-- ============================================================
-- 1. CHECK CONSTRAINT: transfers must have a target entity
-- ============================================================
-- Enforces at the database level that any record with
-- direction = 'transfer' must specify a target_entity_id.
-- The audit_record_anomalies view already flags violations as
-- 'transfer_missing_target' warnings; this constraint prevents
-- new violations from being inserted.

ALTER TABLE public.records
  ADD CONSTRAINT check_transfer_has_target
    CHECK ((direction != 'transfer') OR (target_entity_id IS NOT NULL));

-- ============================================================
-- 2. COMPOSITE INDEXES for common query patterns
-- ============================================================

-- Speeds up queries that filter operator_activities by org and
-- active status (e.g. "show active sessions for this org").
-- Partial index keeps it small by only indexing active rows.
CREATE INDEX IF NOT EXISTS idx_operator_activities_org_active
  ON public.operator_activities(org_id, is_active)
  WHERE is_active IS TRUE;

-- Speeds up queries that filter records by entity + status
-- (e.g. entity balance calculations, record status breakdowns).
CREATE INDEX IF NOT EXISTS idx_records_entity_status
  ON public.records(entity_id, status);

-- ============================================================
-- 3. AUDIT VIEW RLS VERIFICATION
-- ============================================================
-- All audit/ledger views in the schema are defined with
-- `security_invoker = true`:
--
--   - audit_record_ledger       (security_invoker = true)
--   - entity_balances           (security_invoker = true)
--   - audit_activity_integrity  (security_invoker = true)
--   - audit_entity_health       (security_invoker = true)
--   - audit_channel_integrity   (security_invoker = true)
--   - audit_org_integrity       (security_invoker = true)
--   - audit_record_anomalies    (security_invoker = true)
--
-- With security_invoker = true, Postgres executes the view's
-- underlying queries using the calling user's permissions rather
-- than the view owner's. This means the RLS policies on the
-- base tables (records, activities, entities, organizations,
-- etc.) are enforced automatically for every view query.
--
-- Therefore NO additional RLS policies or wrapper queries are
-- needed on these views. The existing table-level policies
-- (user_has_org_access / is_org_in_my_cluster checks on org_id)
-- already restrict each user to only their authorized data when
-- querying through any of these views.
--
-- Note: Postgres views do not support ALTER TABLE ... ENABLE ROW
-- LEVEL SECURITY directly; security_invoker is the correct
-- mechanism for delegating access control to the base tables.

COMMIT;
