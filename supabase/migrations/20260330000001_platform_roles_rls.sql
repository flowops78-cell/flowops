-- -------------------------------------------------------------
-- 20260330000001_platform_roles_rls.sql
-- Enable RLS visibility for platform_roles so is_platform_admin() works.
-- -------------------------------------------------------------

BEGIN;

-- 1. Ensure RLS is enabled (should already be from baseline loop, but defensive)
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

-- 2. Allow users to see their own platform roles
DROP POLICY IF EXISTS platform_roles_read ON public.platform_roles;
CREATE POLICY platform_roles_read ON public.platform_roles
  FOR SELECT USING (user_id = auth.uid());

-- 3. Allow platform admins to see ALL platform roles (for management)
DROP POLICY IF EXISTS platform_roles_admin_all ON public.platform_roles;
CREATE POLICY platform_roles_admin_all ON public.platform_roles
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- 4. Update the helper to be more resilient
-- We want to make sure it can always read the table even if policies are weird,
-- so we keep it as SECURITY DEFINER.
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

COMMIT;
