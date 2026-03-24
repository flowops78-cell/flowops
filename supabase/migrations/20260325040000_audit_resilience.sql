-- -------------------------------------------------------------
-- 20260325040000_audit_resilience.sql
-- Enforce administrative self-demotion guards and last-admin 
-- persistence in the cluster_memberships table.
-- -------------------------------------------------------------

BEGIN;

-- 1. Function to validate cluster administrator presence
CREATE OR REPLACE FUNCTION public.check_cluster_admin_persistence()
RETURNS TRIGGER AS $$
DECLARE
  admin_count INTEGER;
BEGIN
  -- If we are changing a role FROM cluster_admin TO something else,
  -- or we are DELETING a cluster_admin, ensure they aren't the last one.
  IF (TG_OP = 'DELETE' AND OLD.role = 'cluster_admin') OR 
     (TG_OP = 'UPDATE' AND OLD.role = 'cluster_admin' AND NEW.role != 'cluster_admin') THEN
    
    SELECT count(*) INTO admin_count
    FROM public.cluster_memberships
    WHERE cluster_id = OLD.cluster_id 
      AND role = 'cluster_admin';
    
    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove or downgrade the last remaining cluster admin.';
    END IF;
  END IF;

  -- 2. Prevent self-demotion for the current session user
  -- Note: We check against auth.uid()
  IF (TG_OP = 'UPDATE' AND OLD.user_id = auth.uid() AND NEW.role != 'cluster_admin') THEN
    RAISE EXCEPTION 'You cannot downgrade your own primary administrative access.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Apply trigger to cluster_memberships
DROP TRIGGER IF EXISTS tr_cluster_admin_persistence ON public.cluster_memberships;
CREATE TRIGGER tr_cluster_admin_persistence
BEFORE UPDATE OR DELETE ON public.cluster_memberships
FOR EACH ROW EXECUTE FUNCTION public.check_cluster_admin_persistence();

COMMIT;
