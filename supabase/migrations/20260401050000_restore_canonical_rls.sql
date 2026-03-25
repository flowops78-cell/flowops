-- -------------------------------------------------------------
-- 20260401050000_restore_canonical_rls.sql
-- Restore Row Level Security policies for all tables after backend reset.
-- -------------------------------------------------------------

BEGIN;

-- 1. Ensure RLS is enabled on all tables (idempotent)
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop all current policies to start from a clean state
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, policy_record.tablename);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3. Bootstrap Cluster & Org level read policies
CREATE POLICY clusters_read ON public.clusters
  FOR SELECT USING (public.user_has_cluster_access(id));

CREATE POLICY organizations_read ON public.organizations
  FOR SELECT USING (public.user_has_org_access(id) OR public.is_org_in_my_cluster(id));

CREATE POLICY cluster_memberships_read ON public.cluster_memberships
  FOR SELECT USING (user_id = auth.uid() OR public.user_has_cluster_access(cluster_id));

CREATE POLICY organization_memberships_read ON public.organization_memberships
  FOR SELECT USING (user_id = auth.uid() OR public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id));

CREATE POLICY profiles_read ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.user_has_cluster_access(active_cluster_id));

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY platform_roles_read ON public.platform_roles
  FOR SELECT USING (user_id = auth.uid() OR public.is_platform_admin());

-- 4. Dynamic Generation for all tables with org_id
-- This covers: collaborations, entities, activities, records, team_members, channels, channel_records, audit_events, access_requests, etc.
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT t.table_name
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON c.table_schema = t.table_schema
     AND c.table_name = t.table_name
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name = 'org_id'
      AND t.table_name NOT IN (
        'organizations',
        'organization_memberships',
        'cluster_memberships',
        'profiles',
        'platform_roles'
      )
    GROUP BY t.table_name
  LOOP
    -- Read Access
    EXECUTE format(
      'CREATE POLICY %I_read ON public.%I FOR SELECT USING (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id))',
      table_name,
      table_name
    );

    -- Full Mutation Access (Admin/Operator scope handled by function)
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL USING (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id)) WITH CHECK (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id))',
      table_name,
      table_name
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMIT;
