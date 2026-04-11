-- Backlog: query performance, transfer integrity (new rows), documented audit-view behavior.
-- Apply after baseline init. If VALIDATE fails due to legacy bad rows, fix data then run:
--   ALTER TABLE public.records VALIDATE CONSTRAINT records_transfer_requires_target;

-- Composite index for common filters (entity drill-downs + status)
CREATE INDEX IF NOT EXISTS idx_records_entity_id_status
  ON public.records (entity_id, status)
  WHERE entity_id IS NOT NULL;

-- Operator session lists by org + active flag
CREATE INDEX IF NOT EXISTS idx_operator_activities_org_id_is_active
  ON public.operator_activities (org_id, is_active);

-- Enforce transfer rows have a counterparty entity (existing invalid rows allowed until VALIDATE)
ALTER TABLE public.records DROP CONSTRAINT IF EXISTS records_transfer_requires_target;
ALTER TABLE public.records
  ADD CONSTRAINT records_transfer_requires_target
  CHECK (direction IS DISTINCT FROM 'transfer'::public.record_direction OR target_entity_id IS NOT NULL)
  NOT VALID;

COMMENT ON VIEW public.audit_record_ledger IS
  'Invoker security (security_invoker): access is evaluated with the querying user''s privileges; underlying table RLS on records/activities/entities applies.';

COMMENT ON VIEW public.entity_balances IS
  'Invoker security (security_invoker): underlying entities + ledger access follows table RLS.';

COMMENT ON VIEW public.audit_activity_integrity IS
  'Invoker security (security_invoker): derived from activities and ledger rows under RLS.';

COMMENT ON VIEW public.audit_entity_health IS
  'Invoker security (security_invoker): derived from entities and ledger rows under RLS.';

COMMENT ON VIEW public.audit_channel_integrity IS
  'Invoker security (security_invoker): derived from ledger rows under RLS.';

COMMENT ON VIEW public.audit_org_integrity IS
  'Invoker security (security_invoker): derived from organizations and ledger rows under RLS.';

COMMENT ON VIEW public.audit_record_anomalies IS
  'Invoker security (security_invoker): derived from integrity views and records under RLS.';

NOTIFY pgrst, 'reload schema';
