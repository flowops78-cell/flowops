-- -------------------------------------------------------------
-- 20260327000000_baseline_schema.sql
-- Flow Ops canonical baseline schema for hard-reset environments
-- -------------------------------------------------------------

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  start_time        timestamptz NOT NULL DEFAULT now(),
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

CREATE TABLE IF NOT EXISTS public.operator_activities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_role        app_role NOT NULL DEFAULT 'viewer',
  actor_label       text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  last_active_at    timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  duration_seconds  integer,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
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
  operator_activity_id  uuid REFERENCES public.operator_activities(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS public.access_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  label        text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  use_count    integer NOT NULL DEFAULT 0,
  max_uses     integer NOT NULL DEFAULT 1 CHECK (max_uses > 0)
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      table_name
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_my_platform_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.platform_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT active_org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    (
      SELECT org_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid()
        AND status = 'active'
      ORDER BY is_default_org DESC, created_at ASC
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS app_role
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_org_id uuid;
  membership_role app_role;
  inherited_role text;
BEGIN
  current_org_id := public.get_my_org_id();
  IF current_org_id IS NULL THEN
    RETURN 'viewer'::app_role;
  END IF;

  SELECT role
  INTO membership_role
  FROM public.organization_memberships
  WHERE user_id = auth.uid()
    AND org_id = current_org_id
    AND status = 'active'
  LIMIT 1;

  IF membership_role IS NOT NULL THEN
    RETURN membership_role;
  END IF;

  SELECT CASE
    WHEN cm.role = 'cluster_admin' THEN 'admin'
    WHEN cm.role = 'cluster_operator' THEN 'operator'
    ELSE 'viewer'
  END
  INTO inherited_role
  FROM public.cluster_memberships cm
  JOIN public.organizations o ON o.cluster_id = cm.cluster_id
  WHERE cm.user_id = auth.uid()
    AND o.id = current_org_id
  LIMIT 1;

  RETURN COALESCE(inherited_role, 'viewer')::app_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_org_access(target_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE user_id = auth.uid()
      AND org_id = target_org
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_cluster_access(target_cluster uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cluster_memberships
    WHERE user_id = auth.uid()
      AND cluster_id = target_cluster
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_in_my_cluster(target_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.cluster_memberships cm ON cm.cluster_id = o.cluster_id
    WHERE o.id = target_org
      AND cm.user_id = auth.uid()
      AND cm.role IN ('cluster_admin', 'cluster_operator')
  );
$$;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
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
  current_org_id uuid;
  current_role app_role;
  inserted_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  current_org_id := public.get_my_org_id();
  current_role := public.get_my_role();

  IF current_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.audit_events (
    org_id,
    entity_id,
    actor_user_id,
    actor_label,
    actor_role,
    action,
    entity,
    operator_activity_id,
    amount,
    details
  )
  VALUES (
    current_org_id,
    p_entity_id,
    auth.uid(),
    NULLIF(trim(COALESCE(p_actor_label, '')), ''),
    current_role,
    p_action,
    p_entity,
    p_operator_activity_id,
    p_amount,
    NULLIF(trim(COALESCE(p_details, '')), '')
  )
  RETURNING id INTO inserted_event_id;

  RETURN inserted_event_id;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_organizations_cluster_id ON public.organizations(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_memberships_user_id ON public.cluster_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_cluster_memberships_cluster_id ON public.cluster_memberships(cluster_id);
CREATE INDEX IF NOT EXISTS idx_organization_memberships_user_id ON public.organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_memberships_org_id ON public.organization_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active_org_id ON public.profiles(active_org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active_cluster_id ON public.profiles(active_cluster_id);
CREATE INDEX IF NOT EXISTS idx_collaborations_org_id ON public.collaborations(org_id);
CREATE INDEX IF NOT EXISTS idx_entities_org_id ON public.entities(org_id);
CREATE INDEX IF NOT EXISTS idx_entities_collaboration_id ON public.entities(collaboration_id);
CREATE INDEX IF NOT EXISTS idx_entities_referred_by_entity_id ON public.entities(referred_by_entity_id);
CREATE INDEX IF NOT EXISTS idx_entities_referring_collaboration_id ON public.entities(referring_collaboration_id);
CREATE INDEX IF NOT EXISTS idx_activities_org_id ON public.activities(org_id);
CREATE INDEX IF NOT EXISTS idx_activities_assigned_user_id ON public.activities(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_records_org_id ON public.records(org_id);
CREATE INDEX IF NOT EXISTS idx_records_activity_id ON public.records(activity_id);
CREATE INDEX IF NOT EXISTS idx_records_entity_id ON public.records(entity_id);
CREATE INDEX IF NOT EXISTS idx_records_transfer_group_id ON public.records(transfer_group_id);
CREATE INDEX IF NOT EXISTS idx_team_members_org_id ON public.team_members(org_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_org_user_id ON public.team_members(org_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channels_org_id ON public.channels(org_id);
CREATE INDEX IF NOT EXISTS idx_channel_records_org_id ON public.channel_records(org_id);
CREATE INDEX IF NOT EXISTS idx_channel_records_activity_id ON public.channel_records(activity_id);
CREATE INDEX IF NOT EXISTS idx_channel_records_channel_id ON public.channel_records(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_records_record_id ON public.channel_records(record_id);
CREATE INDEX IF NOT EXISTS idx_operator_activities_org_id ON public.operator_activities(org_id);
CREATE INDEX IF NOT EXISTS idx_operator_activities_actor_user_id ON public.operator_activities(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_org_id ON public.audit_events(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity_id ON public.audit_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_org_id ON public.access_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_access_invites_org_id ON public.access_invites(org_id);

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
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END;
$$;

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
    EXECUTE format(
      'CREATE POLICY %I_read ON public.%I FOR SELECT USING (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id))',
      table_name,
      table_name
    );

    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL USING (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id)) WITH CHECK (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id))',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;

INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

COMMIT;
