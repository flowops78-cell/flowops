-- -------------------------------------------------------------
-- 20260330000000_platform_admin_authority.sql
-- Harmonize RLS and authority checks for platform_admins.
-- -------------------------------------------------------------

BEGIN;

-- 1. Helper to check platform admin status
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_roles
    WHERE user_id = auth.uid()
      AND role = 'platform_admin'
  );
$$;

-- 2. Update cluster access check
CREATE OR REPLACE FUNCTION public.user_has_cluster_access(target_cluster uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.is_platform_admin() OR
    EXISTS (
      SELECT 1
      FROM public.cluster_memberships
      WHERE user_id = auth.uid()
        AND cluster_id = target_cluster
    );
$$;

-- 3. Update org access check
CREATE OR REPLACE FUNCTION public.user_has_org_access(target_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.is_platform_admin() OR
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND org_id = target_org
        AND status = 'active'
    );
$$;

-- 4. Update cross-org cluster check
-- NOTE: Using p_org_id to match existing naming on server and avoid name change error
CREATE OR REPLACE FUNCTION public.is_org_in_my_cluster(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.is_platform_admin() OR
    EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.cluster_memberships cm ON cm.cluster_id = o.cluster_id
      WHERE o.id = p_org_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('cluster_admin', 'cluster_operator')
    );
$$;

COMMIT;
