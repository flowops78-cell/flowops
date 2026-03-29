-- Intra-accounts: workspace people = organization_memberships only (no ghost roster rows).
-- Adds display_name on memberships, backfills from team_members, drops team_members,
-- tightens operator_activities RLS so only self or workspace/cluster admins can attribute logs.

ALTER TABLE public.organization_memberships
  ADD COLUMN IF NOT EXISTS display_name text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'team_members'
  ) THEN
    UPDATE public.organization_memberships om
    SET display_name = COALESCE(NULLIF(trim(tm.name), ''), om.display_name)
    FROM public.team_members tm
    WHERE tm.user_id = om.user_id
      AND tm.org_id = om.org_id
      AND tm.name IS NOT NULL
      AND trim(tm.name) <> '';
    DROP TABLE public.team_members;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_manage_operator_sessions_for_org(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships om
    WHERE om.org_id = target_org
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role = 'admin'
  )
  OR EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.cluster_memberships cm ON cm.cluster_id = o.cluster_id
    WHERE o.id = target_org
      AND cm.user_id = auth.uid()
      AND cm.role = 'cluster_admin'
  );
$$;

DROP POLICY IF EXISTS operator_activities_read ON public.operator_activities;
DROP POLICY IF EXISTS operator_activities_write ON public.operator_activities;

CREATE POLICY operator_activities_select ON public.operator_activities
  FOR SELECT
  USING (
    public.user_has_org_access(org_id)
    OR public.is_org_in_my_cluster(org_id)
  );

CREATE POLICY operator_activities_insert ON public.operator_activities
  FOR INSERT
  WITH CHECK (
    (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id))
    AND (
      actor_user_id = auth.uid()
      OR public.can_manage_operator_sessions_for_org(org_id)
    )
  );

CREATE POLICY operator_activities_update ON public.operator_activities
  FOR UPDATE
  USING (
    (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id))
    AND (
      actor_user_id = auth.uid()
      OR public.can_manage_operator_sessions_for_org(org_id)
    )
  )
  WITH CHECK (
    (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id))
    AND (
      actor_user_id = auth.uid()
      OR public.can_manage_operator_sessions_for_org(org_id)
    )
  );

CREATE POLICY operator_activities_delete ON public.operator_activities
  FOR DELETE
  USING (
    (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id))
    AND (
      actor_user_id = auth.uid()
      OR public.can_manage_operator_sessions_for_org(org_id)
    )
  );
