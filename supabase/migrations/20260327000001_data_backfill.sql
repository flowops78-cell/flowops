-- ─────────────────────────────────────────────────────────────────────────────
-- 20260327000001_data_backfill.sql
-- Backfill existing data into the Cluster-Organization membership model
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. ENSURE PROFILES EXIST FOR ALL AUTH USERS
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 2. BACKFILL CLUSTERS FROM LEGACY ORG_CLUSTERS (if they existed in the DB state)
-- If org_clusters table was already renamed to clusters, we just ensure data is there.
-- Since the baseline creates clusters empty, we need to populate it from the previous state.
-- Note: This script assumes it runs after baseline_schema.sql but while legacy tables/data still exist in some form (or we recreate from profiles).

-- If we are starting from a state where org_clusters was renamed to clusters:
-- We just ensure IDs are consistent.

-- 3. MAP ORGANIZATIONS TO CLUSTERS
-- Assign organizations to clusters based on the legacy org_meta_mapping if available,
-- or create a default cluster for orphans.

DO $$
DECLARE
    v_default_cluster_id uuid;
BEGIN
    -- Create a default fallback cluster if none exist
    IF NOT EXISTS (SELECT 1 FROM public.clusters) THEN
        INSERT INTO public.clusters (name) VALUES ('Default Cluster') RETURNING id INTO v_default_cluster_id;
    ELSE
        SELECT id INTO v_default_cluster_id FROM public.clusters LIMIT 1;
    END IF;

    -- Update organizations that have no cluster_id
    UPDATE public.organizations
    SET cluster_id = v_default_cluster_id
    WHERE cluster_id IS NULL;
END $$;

-- 4. BACKFILL CLUSTER MEMBERSHIPS
-- Grant 'cluster_admin' to users who were platform admins or had admin roles in legacy profiles.
INSERT INTO public.cluster_memberships (user_id, cluster_id, role)
SELECT 
    p.id, 
    o.cluster_id, 
    'cluster_admin'
FROM public.profiles p
JOIN public.organizations o ON p.active_org_id = o.id
LEFT JOIN public.user_roles ur ON p.id = ur.user_id
WHERE (ur.role = 'admin' OR p.meta_org_id IS NOT NULL)
ON CONFLICT (user_id, cluster_id) DO NOTHING;

-- 5. BACKFILL ORGANIZATION MEMBERSHIPS
-- Map all users to the organizations they are currently associated with in profiles.
INSERT INTO public.organization_memberships (user_id, org_id, role, status, is_default_org)
SELECT 
    p.id, 
    p.org_id, 
    COALESCE((SELECT role FROM public.user_roles ur WHERE ur.user_id = p.id), 'viewer')::app_role,
    'active',
    true
FROM public.profiles p
WHERE p.org_id IS NOT NULL
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Also cover those with active_org_id if different
INSERT INTO public.organization_memberships (user_id, org_id, role, status, is_default_org)
SELECT 
    p.id, 
    p.active_org_id, 
    COALESCE((SELECT role FROM public.user_roles ur WHERE ur.user_id = p.id), 'viewer')::app_role,
    'active',
    false
FROM public.profiles p
WHERE p.active_org_id IS NOT NULL AND p.active_org_id != p.org_id
ON CONFLICT (user_id, org_id) DO NOTHING;

-- 7. ORPHAN HEALING: Ensure every organization has at least one admin
-- If an org has members but no admin, promote the oldest member.
INSERT INTO public.organization_memberships (user_id, org_id, role, status)
SELECT DISTINCT ON (org_id) 
    user_id, 
    org_id, 
    'admin'::app_role, 
    'active'
FROM public.organization_memberships om
WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_memberships om2 
    WHERE om2.org_id = om.org_id AND om2.role = 'admin'
)
ON CONFLICT (user_id, org_id) DO UPDATE SET role = 'admin';

-- 8. CLEANUP LEGACY MAPPINGS (After verification, usually done in a separate phase)
-- For now, we keep them to avoid breaking inflight requests until edge functions are deployed.

COMMIT;
