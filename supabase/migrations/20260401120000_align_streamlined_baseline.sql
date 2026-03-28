-- Idempotent alignment for databases that already applied an older 00000 baseline.
-- Safe when platform_roles was removed from init or drifted. New projects: mostly no-ops.

DROP TABLE IF EXISTS public.platform_roles CASCADE;
DROP FUNCTION IF EXISTS public.get_my_platform_role();
DROP FUNCTION IF EXISTS public.is_platform_admin();

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
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_cluster_access(target_cluster uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cluster_memberships
    WHERE user_id = auth.uid()
      AND cluster_id = target_cluster
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_in_my_cluster(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.cluster_memberships cm ON cm.cluster_id = o.cluster_id
    WHERE o.id = target_org
      AND cm.user_id = auth.uid()
      AND cm.role IN ('cluster_admin', 'cluster_operator')
  );
$$;

CREATE TABLE IF NOT EXISTS public._flow_ops_schema_patch_runs (
  id bigserial PRIMARY KEY,
  label text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public._flow_ops_schema_patch_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._flow_ops_schema_patch_runs FROM PUBLIC;
GRANT ALL ON public._flow_ops_schema_patch_runs TO postgres;

INSERT INTO public._flow_ops_schema_patch_runs (label)
VALUES ('20260401120000_align_streamlined_baseline');

NOTIFY pgrst, 'reload schema';
