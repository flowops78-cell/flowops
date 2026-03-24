-- ─────────────────────────────────────────────────────────────────────────────
-- 20260327000000_baseline_schema.sql
-- Consolidated Baseline for Flow Ops Cluster-Organization Model
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS & TYPES
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE app_role AS ENUM ('admin', 'operator', 'viewer');
    END IF;
END $$;

-- 3. CORE HIERARCHY
CREATE TABLE IF NOT EXISTS public.clusters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id   uuid REFERENCES public.clusters(id) ON DELETE CASCADE,
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 4. MEMBERSHIPS & ROLES
CREATE TABLE IF NOT EXISTS public.platform_roles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('platform_admin')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cluster_memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cluster_id   uuid NOT NULL REFERENCES public.clusters(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('cluster_admin', 'cluster_operator', 'viewer')),
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, cluster_id)
);

CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            app_role NOT NULL DEFAULT 'viewer',
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled', 'revoked')),
  is_default_org  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        app_role NOT NULL DEFAULT 'viewer',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- 5. USER PROFILES (State & Context)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_cluster_id   uuid REFERENCES public.clusters(id) ON DELETE SET NULL,
  active_org_id       uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  -- Legacy fields (deprecated)
  org_id              uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  meta_org_id         uuid REFERENCES public.clusters(id) ON DELETE SET NULL,
  current_session_id  uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 6. OPERATIONAL TABLES
CREATE TABLE IF NOT EXISTS public.workspaces (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                 text,
  channel              text,
  org_code             text,
  activity_category    text NOT NULL DEFAULT 'standard',
  workspace_mode       text NOT NULL DEFAULT 'cash',
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  assigned_operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  location             text,
  start_time           timestamptz,
  end_time             timestamptz,
  system_contribution  numeric(12, 2),
  channel_value        numeric(12, 2),
  activity_frequency   numeric(10, 2),
  date                 timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  tags                    text[],
  attributed_associate_id uuid,
  referred_by_partner_id  uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  unit_id         uuid REFERENCES public.units(id) ON DELETE SET NULL,
  unit_name       text,
  input_amount      numeric(12, 2) NOT NULL DEFAULT 0,
  output_amount     numeric(12, 2) NOT NULL DEFAULT 0,
  total_input       numeric(12, 2) NOT NULL DEFAULT 0,
  joined_at         timestamptz,
  left_at           timestamptz,
  position_id       integer,
  activity_units    integer,
  sort_order        integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  member_id   text,
  name        text NOT NULL,
  role        app_role NOT NULL DEFAULT 'viewer',
  incentive_type text NOT NULL DEFAULT 'hourly' CHECK (incentive_type IN ('hourly', 'monthly', 'none')),
  overhead_weight numeric(12, 2),
  service_rate    numeric(12, 2), -- Legacy
  retainer_rate   numeric(12, 2),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  tags        text[],
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id       uuid REFERENCES public.members(id) ON DELETE SET NULL,
  workspace_id    uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  start_time      timestamptz NOT NULL DEFAULT now(),
  end_time        timestamptz,
  duration_hours  numeric(10, 2),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  date            timestamptz NOT NULL DEFAULT now(),
  total_value     numeric(12, 2),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.channel_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('increment', 'adjustment', 'decrement')),
  amount      numeric(12, 2) NOT NULL,
  method      text NOT NULL,
  operation_type text NOT NULL DEFAULT 'manual' CHECK (operation_type IN ('manual', 'transfer')),
  transfer_id uuid,
  counterparty_method text,
  date        timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.associates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  role        text NOT NULL DEFAULT 'channel' CHECK (role IN ('associate', 'channel', 'hybrid')),
  contact_method text NOT NULL DEFAULT 'none' CHECK (contact_method IN ('none', 'internal', 'email', 'telegram', 'signal', 'whatsapp')),
  contact_value  text,
  allocation_factor numeric(12, 2) NOT NULL DEFAULT 0,
  overhead_weight numeric(12, 2) NOT NULL DEFAULT 0,
  total_number numeric(12, 2) NOT NULL DEFAULT 0,
  -- Legacy fields
  partner_arrangement_rate numeric(12, 2) DEFAULT 0,
  system_allocation_percent numeric(12, 2) DEFAULT 0,
  total       numeric(12, 2) DEFAULT 0,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.associate_allocations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  attributed_associate_id uuid REFERENCES public.associates(id) ON DELETE CASCADE,
  -- Legacy
  associate_id  uuid REFERENCES public.associates(id) ON DELETE CASCADE,
  partner_id    uuid REFERENCES public.associates(id) ON DELETE CASCADE,
  amount        numeric(12, 2) NOT NULL,
  type          text NOT NULL CHECK (type IN ('input', 'alignment', 'output', 'adjustment')),
  date          timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.allocations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id     uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount      numeric(12, 2) NOT NULL,
  type        text NOT NULL CHECK (type IN ('allocation', 'return')),
  date        timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adjustments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id     uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount      numeric(12, 2) NOT NULL,
  type        text NOT NULL CHECK (type IN ('input', 'output')),
  date        timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.unit_account_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id     uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('increment', 'adjustment', 'decrement')),
  amount      numeric(12, 2) NOT NULL,
  date        timestamptz NOT NULL DEFAULT now(),
  request_id  uuid,
  source_method text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adjustment_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id       uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount        numeric(12, 2) NOT NULL,
  type          text NOT NULL CHECK (type IN ('input', 'output')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.output_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id       uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount        numeric(12, 2) NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operator_activities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_role        app_role NOT NULL DEFAULT 'viewer',
  actor_label       text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  last_active_at      timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  duration_seconds  integer,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  amount        numeric(12, 2) NOT NULL,
  category      text,
  date          timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transfer_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id       uuid,
  actor_user_id uuid,
  actor_label   text,
  actor_role    app_role,
  action        text NOT NULL,
  entity        text,
  operator_activity_id uuid REFERENCES public.operator_activities(id) ON DELETE SET NULL,
  amount        numeric(12, 2),
  details       text CHECK (details IS NULL OR char_length(details) <= 120),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  login_id           text NOT NULL,
  requested_role     app_role NOT NULL DEFAULT 'viewer',
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_invites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_hash         text NOT NULL UNIQUE,
  label              text,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,
  revoked_at         timestamptz,
  last_used_at       timestamptz,
  use_count          integer NOT NULL DEFAULT 0,
  max_uses           integer NOT NULL DEFAULT 1 CHECK (max_uses > 0)
);

-- 7. TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT table_name 
           FROM information_schema.columns 
           WHERE column_name = 'updated_at' 
             AND table_schema = 'public'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 8. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.get_my_platform_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM platform_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS app_role
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
BEGIN
  v_org_id := get_my_org_id();
  IF v_org_id IS NULL THEN RETURN 'viewer'::app_role; END IF;

  -- 1. Direct org membership takes precedence
  SELECT role INTO v_role FROM organization_memberships 
  WHERE user_id = auth.uid() AND org_id = v_org_id AND status = 'active';
  
  IF v_role IS NOT NULL THEN RETURN v_role::app_role; END IF;

  -- 2. Cluster-level inheritance
  SELECT 
    CASE 
      WHEN role = 'cluster_admin' THEN 'admin'
      WHEN role = 'cluster_operator' THEN 'operator'
      ELSE 'viewer'
    END INTO v_role
  FROM cluster_memberships cm
  JOIN organizations o ON cm.cluster_id = o.cluster_id
  WHERE cm.user_id = auth.uid() AND o.id = v_org_id;

  RETURN COALESCE(v_role, 'viewer')::app_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Resolved strictly from profile context or default membership
  SELECT COALESCE(
    (SELECT active_org_id FROM profiles WHERE id = auth.uid() LIMIT 1),
    (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid() AND status = 'active' ORDER BY is_default_org DESC, created_at ASC LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_org_access(target_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships 
    WHERE user_id = auth.uid() AND org_id = target_org AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_cluster_access(target_cluster uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM cluster_memberships 
    WHERE user_id = auth.uid() AND cluster_id = target_cluster
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_in_my_cluster(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_cluster_id uuid;
BEGIN
  SELECT cluster_id INTO v_cluster_id FROM organizations WHERE id = p_org_id;
  RETURN EXISTS (
    SELECT 1 FROM cluster_memberships 
    WHERE user_id = auth.uid() 
      AND cluster_id = v_cluster_id 
      AND role IN ('cluster_admin', 'cluster_operator')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity text DEFAULT NULL,
  p_unit_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_details text DEFAULT NULL,
  p_actor_label text DEFAULT NULL,
  p_operator_activity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_actor_role app_role;
  v_event_id uuid;
  v_validated_activity_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  v_org_id := get_my_org_id();
  v_actor_role := get_my_role();
  IF v_org_id IS NULL THEN RETURN NULL; END IF;
  
  IF p_operator_activity_id IS NOT NULL THEN
    SELECT id INTO v_validated_activity_id FROM operator_activities WHERE id = p_operator_activity_id;
  END IF;

  INSERT INTO audit_events (org_id, actor_user_id, actor_label, actor_role, action, entity, unit_id, amount, details, operator_activity_id)
  VALUES (v_org_id, auth.uid(), NULLIF(TRIM(COALESCE(p_actor_label, '')), ''), v_actor_role, p_action, p_entity, p_unit_id, p_amount, NULLIF(TRIM(COALESCE(p_details, '')), ''), v_validated_activity_id)
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$;

-- 9. RLS POLICIES
ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
-- 11. SECURITY & RLS POLICIES (Idempotent)
DO $$ 
DECLARE 
    tbl_name text;
    pol_name text;
BEGIN
    FOR tbl_name, pol_name IN 
        SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol_name, tbl_name);
    END LOOP;
END $$;

-- Enable RLS for all tables
DO $$ 
DECLARE 
    tbl text;
BEGIN
    FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
END $$;

-- Core Access Policies
CREATE POLICY "clusters_read" ON clusters FOR SELECT USING (user_has_cluster_access(id));
CREATE POLICY "organizations_read" ON organizations FOR SELECT USING (user_has_org_access(id) OR is_org_in_my_cluster(id));
CREATE POLICY "org_memberships_read" ON organization_memberships FOR SELECT USING (user_id = auth.uid() OR user_has_org_access(org_id) OR is_org_in_my_cluster(org_id));
CREATE POLICY "cluster_memberships_read" ON cluster_memberships FOR SELECT USING (user_id = auth.uid() OR user_has_cluster_access(cluster_id));

-- Scoped Data Policies (Bulk)
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' 
    AND table_name NOT IN ('clusters', 'organizations', 'organization_memberships', 'cluster_memberships', 'profiles', 'platform_roles', 'user_roles')
  LOOP
    EXECUTE format('CREATE POLICY %I_read ON %I FOR SELECT USING (user_has_org_access(org_id) OR is_org_in_my_cluster(org_id))', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_write ON %I FOR ALL USING (user_has_org_access(org_id) OR is_org_in_my_cluster(org_id)) WITH CHECK (user_has_org_access(org_id) OR is_org_in_my_cluster(org_id))', tbl, tbl);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Profile Special Case
CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (id = auth.uid() OR user_has_cluster_access(active_cluster_id));
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 12. BOOTSTRAP DATA (Essential)
INSERT INTO profiles (id) SELECT id FROM auth.users ON CONFLICT (id) DO NOTHING;

COMMIT;
