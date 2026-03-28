-- Cluster admins/operators inherit org access (same scope as is_org_in_my_cluster).
-- Idempotent for DBs that already ran align without this body.

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

NOTIFY pgrst, 'reload schema';
