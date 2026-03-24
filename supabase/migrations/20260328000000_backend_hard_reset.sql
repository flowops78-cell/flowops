-- -------------------------------------------------------------
-- 20260328000000_backend_hard_reset.sql
-- Force purge of legacy Flow Ops schema and reset to canonical baseline.
-- -------------------------------------------------------------

BEGIN;

-- 1. DROP LEGACY TABLES (Destructive)
DROP TABLE IF EXISTS public.workspaces CASCADE;
DROP TABLE IF EXISTS public.units CASCADE;
DROP TABLE IF EXISTS public.entries CASCADE;
DROP TABLE IF EXISTS public.associates CASCADE;
DROP TABLE IF EXISTS public.members CASCADE;
DROP TABLE IF EXISTS public.channel_entries CASCADE;
DROP TABLE IF EXISTS public.unit_account_entries CASCADE;
DROP TABLE IF EXISTS public.adjustment_requests CASCADE;
DROP TABLE IF EXISTS public.associate_allocations CASCADE;
DROP TABLE IF EXISTS public.operator_logs CASCADE;
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.adjustments CASCADE;
DROP TABLE IF EXISTS public.unit_accounts CASCADE;
DROP TABLE IF EXISTS public.transfer_accounts CASCADE;

-- 2. APPLY CANONICAL BASELINE (Idempotent)
-- This section ensures all baseline tables, types, and functions from the 2026-03-27 baseline are present.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('admin', 'operator', 'viewer');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'record_status') THEN
    CREATE TYPE record_status AS ENUM ('pending', 'applied', 'deferred', 'voided');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'record_direction') THEN
    CREATE TYPE record_direction AS ENUM ('increase', 'decrease', 'transfer');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'collaboration_type') THEN
    CREATE TYPE collaboration_type AS ENUM ('channel', 'collaboration', 'hybrid');
  END IF;
END $$;

-- Governance/Auth (Protected)
CREATE TABLE IF NOT EXISTS public.clusters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id  uuid REFERENCES public.clusters(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_roles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('platform_admin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cluster_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cluster_id  uuid NOT NULL REFERENCES public.clusters(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('cluster_admin', 'cluster_operator', 'viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
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

CREATE TABLE IF NOT EXISTS public.profiles (
  id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_cluster_id  uuid REFERENCES public.clusters(id) ON DELETE SET NULL,
  active_org_id      uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  current_session_id uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Domain Components
CREATE TABLE IF NOT EXISTS public.collaborations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  collaboration_type    collaboration_type NOT NULL DEFAULT 'channel',
  participation_factor  numeric(12, 2) NOT NULL DEFAULT 0,
  overhead_weight_pct   numeric(12, 2) NOT NULL DEFAULT 0,
  rules                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entities (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                       text NOT NULL,
  collaboration_id           uuid REFERENCES public.collaborations(id) ON DELETE SET NULL,
  referred_by_entity_id      uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  referring_collaboration_id uuid REFERENCES public.collaborations(id) ON DELETE SET NULL,
  total_units                numeric(12, 2) NOT NULL DEFAULT 0,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label             text NOT NULL,
  date              timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  channel_label     text,
  assigned_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.records (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id        uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  entity_id          uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  direction          record_direction NOT NULL,
  status             record_status NOT NULL DEFAULT 'pending',
  unit_amount        numeric(12, 2) NOT NULL DEFAULT 0,
  transfer_group_id  uuid,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  staff_role  text NOT NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.channel_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  channel_id  uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  record_id   uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_id             uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  actor_user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label           text,
  actor_role            app_role,
  action                text NOT NULL,
  entity                text,
  amount                numeric(12, 2),
  details               text CHECK (details IS NULL OR char_length(details) <= 120),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  login_id        text NOT NULL,
  requested_role  app_role NOT NULL DEFAULT 'viewer',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS & Policies (Strict baseline refresh)
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

-- Final Bootstrap
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

COMMIT;
