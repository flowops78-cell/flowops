-- OPTIONAL — not run by migrations. Repair user admin@admin.os → cluster_admin + workspace admin.
-- Requires clusters/orgs with IDs below (same defaults as scripts/provision_admin.ts).

DO $$
DECLARE
    v_id uuid;
    v_cluster_id uuid := '9aa66524-7831-411c-b5f0-6218e3a247db';
    v_org_id uuid := '50d41461-d715-46c0-988a-131a6cf711f0';
BEGIN
    FOR v_id IN SELECT id FROM auth.users WHERE email = 'admin@admin.os' LOOP
        INSERT INTO public.profiles (id, active_org_id, active_cluster_id, created_at, updated_at)
        VALUES (v_id, v_org_id, v_cluster_id, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          active_org_id = EXCLUDED.active_org_id,
          active_cluster_id = EXCLUDED.active_cluster_id,
          updated_at = NOW();

        INSERT INTO public.cluster_memberships (user_id, cluster_id, role, created_at)
        VALUES (v_id, v_cluster_id, 'cluster_admin', NOW())
        ON CONFLICT (user_id, cluster_id) DO UPDATE SET role = 'cluster_admin';

        INSERT INTO public.organization_memberships (user_id, org_id, role, status, is_default_org, created_at, updated_at)
        VALUES (v_id, v_org_id, 'admin', 'active', true, NOW(), NOW())
        ON CONFLICT (user_id, org_id) DO UPDATE SET
          role = 'admin',
          status = 'active',
          is_default_org = true,
          updated_at = NOW();

        RAISE NOTICE 'Restored cluster_admin + workspace admin for %', v_id;
    END LOOP;
END $$;
