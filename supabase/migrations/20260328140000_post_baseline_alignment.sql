-- Idempotent alignment for databases that already applied an older 00000 init
-- (before starting_total + genesis-aware views + platform cleanup were folded in).
-- New projects: 00000000000000_init_canonical_schema.sql already includes this; this migration is mostly a no-op.

DROP TABLE IF EXISTS public.platform_roles CASCADE;
DROP FUNCTION IF EXISTS public.get_my_platform_role();
DROP FUNCTION IF EXISTS public.is_platform_admin();

ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS starting_total numeric(12, 2) NOT NULL DEFAULT 0;

CREATE OR REPLACE VIEW public.entity_balances
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.org_id,
  e.name,
  (COALESCE(e.starting_total, 0) + COALESCE(SUM(l.applied_signed_amount), 0))::numeric(12, 2) AS net,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_inflow,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS record_count,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied' AND l.applied_signed_amount > 0)::integer AS surplus_count,
  MAX(l.created_at) AS last_active,
  0::numeric(12, 2) AS avg_duration_hours
FROM public.entities e
LEFT JOIN public.audit_record_ledger l ON l.entity_id = e.id
GROUP BY e.id, e.org_id, e.name, e.starting_total;

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
  (COALESCE(e.starting_total, 0) + COALESCE(SUM(l.applied_signed_amount), 0))::numeric(12, 2) AS net_amount,
  CASE
    WHEN (COALESCE(e.starting_total, 0) + COALESCE(SUM(l.applied_signed_amount), 0)) < 0 THEN 'watch'
    ELSE 'ok'
  END AS status,
  MAX(l.created_at) AS last_record_at
FROM public.entities e
LEFT JOIN public.audit_record_ledger l ON l.entity_id = e.id
GROUP BY e.org_id, e.id, e.name, e.starting_total;

CREATE OR REPLACE VIEW public.audit_org_integrity
WITH (security_invoker = true) AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  COUNT(l.record_id)::integer AS total_records,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS applied_record_count,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_increase,
  COALESCE(SUM(l.applied_decrease_amount), 0)::numeric(12, 2) AS total_decrease,
  (COALESCE(SUM(l.applied_signed_amount), 0) + (SELECT COALESCE(SUM(starting_total), 0) FROM public.entities e WHERE e.org_id = o.id))::numeric(12, 2) AS net_amount,
  COUNT(a.activity_id) FILTER (WHERE a.status = 'broken')::integer AS broken_activity_count,
  CASE
    WHEN ABS(COALESCE(SUM(l.applied_signed_amount), 0) + (SELECT COALESCE(SUM(starting_total), 0) FROM public.entities e WHERE e.org_id = o.id)) < 0.01
      AND COUNT(a.activity_id) FILTER (WHERE a.status = 'broken') = 0 THEN 'ok'
    ELSE 'broken'
  END AS status
FROM public.organizations o
LEFT JOIN public.audit_record_ledger l ON l.org_id = o.id
LEFT JOIN public.audit_activity_integrity a ON a.org_id = o.id
GROUP BY o.id, o.name;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  membership_role app_role;
  inherited_role text;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN 'viewer'::app_role;
  END IF;

  SELECT role
  INTO membership_role
  FROM public.organization_memberships
  WHERE user_id = auth.uid()
    AND org_id = v_org_id
    AND status = 'active'
  LIMIT 1;

  IF membership_role IS NOT NULL THEN
    RETURN membership_role;
  END IF;

  SELECT CASE
    WHEN cm.role = 'cluster_admin' THEN 'admin'
    WHEN cm.role = 'cluster_operator' THEN 'operator'
    ELSE 'viewer'
  END
  INTO inherited_role
  FROM public.cluster_memberships cm
  JOIN public.organizations o ON o.cluster_id = cm.cluster_id
  WHERE cm.user_id = auth.uid()
    AND o.id = v_org_id
  LIMIT 1;

  RETURN COALESCE(inherited_role, 'viewer')::app_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_org_access(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE user_id = auth.uid()
      AND org_id = target_org
      AND status = 'active'
  )
  OR EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.cluster_memberships cm ON cm.cluster_id = o.cluster_id
    WHERE o.id = target_org
      AND cm.user_id = auth.uid()
      AND cm.role IN ('cluster_admin', 'cluster_operator')
  );
$$;

INSERT INTO public._flow_ops_schema_patch_runs (label)
VALUES ('20260328140000_post_baseline_alignment');

NOTIFY pgrst, 'reload schema';
