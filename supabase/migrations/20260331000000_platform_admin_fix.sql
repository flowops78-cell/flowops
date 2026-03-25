-- -------------------------------------------------------------
-- 20260331000000_platform_admin_fix.sql
-- Force-grant platform_admin to the primary operator account.
-- -------------------------------------------------------------

BEGIN;

-- 1. Ensure the platform_roles table can be read by the user themselves
-- (This prevents the catch-22 where you can't see your role to be authorized to see your role)
DROP POLICY IF EXISTS platform_roles_read ON public.platform_roles;
CREATE POLICY platform_roles_read ON public.platform_roles
  FOR SELECT USING (user_id = auth.uid() OR public.is_platform_admin());

-- 2. Bootstrap primary platform admin
-- We target the user who is currently signed in or the earliest admin
DO $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Try to find the primary operator by email if possible
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = 'alex@operator.os' 
  LIMIT 1;

  -- Fallback to the first admin in organization_memberships
  IF target_user_id IS NULL THEN
    SELECT user_id INTO target_user_id 
    FROM public.organization_memberships 
    WHERE role = 'admin' 
    ORDER BY created_at ASC 
    LIMIT 1;
  END IF;

  -- Final fallback: just the first user
  IF target_user_id IS NULL THEN
    SELECT id INTO target_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF target_user_id IS NOT NULL THEN
    INSERT INTO public.platform_roles (user_id, role)
    VALUES (target_user_id, 'platform_admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'platform_admin';
    
    RAISE NOTICE 'Platform Admin granted to user: %', target_user_id;
  END IF;
END $$;

COMMIT;
