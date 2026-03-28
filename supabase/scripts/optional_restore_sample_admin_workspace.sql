-- -----------------------------------------------------------------------------
-- OPTIONAL — not run by migrations.
-- Use only in a known dev/staging database where you want to force one login
-- onto a workspace and grant group admin (cluster_admin) for that org's cluster.
-- Edit email before running.
--
-- Do NOT run on production without reviewing: it overwrites profiles and memberships.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_cluster_id uuid;
  v_target_email text := 'admin@admin.os';  -- change me
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_target_email) LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row for email: %', v_target_email;
  END IF;

  SELECT id, cluster_id INTO v_org_id, v_cluster_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;

  IF v_org_id IS NULL OR v_cluster_id IS NULL THEN
    RAISE EXCEPTION 'No organization with cluster — create a cluster/org first.';
  END IF;

  INSERT INTO public.profiles (id, active_org_id, active_cluster_id, created_at, updated_at)
  VALUES (v_user_id, v_org_id, v_cluster_id, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    active_org_id = EXCLUDED.active_org_id,
    active_cluster_id = EXCLUDED.active_cluster_id,
    updated_at = now();

  INSERT INTO public.cluster_memberships (user_id, cluster_id, role, created_at)
  VALUES (v_user_id, v_cluster_id, 'cluster_admin', now())
  ON CONFLICT (user_id, cluster_id) DO UPDATE SET role = 'cluster_admin';

  INSERT INTO public.organization_memberships (user_id, org_id, role, status, is_default_org, created_at, updated_at)
  VALUES (v_user_id, v_org_id, 'admin', 'active', true, now(), now())
  ON CONFLICT (user_id, org_id) DO UPDATE SET
    role = 'admin',
    status = 'active',
    is_default_org = true,
    updated_at = now();

  RAISE NOTICE 'Patched profile + cluster_admin + workspace admin for % → org %', v_target_email, v_org_id;
END $$;
