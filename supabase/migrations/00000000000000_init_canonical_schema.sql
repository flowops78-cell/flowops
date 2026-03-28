-- -------------------------------------------------------------
-- 00000000000000_init_canonical_schema.sql
-- Streamlined single baseline: schema, RLS (no platform_roles), ledger/audit
-- views, internal patch log. Access = cluster_memberships + organization_memberships.
-- New project: supabase db push / db reset.
-- If remote lists migration versions you deleted locally, run:
--   supabase migration repair --status reverted <version>
-- then push, or align schema_migrations in the Dashboard SQL editor.
-- -------------------------------------------------------------

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CUSTOM TYPES
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

-- 3. TABLES (Canonical Flow Ops Schema)

CREATE TABLE IF NOT EXISTS public.clusters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text,
  tag         text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id  uuid REFERENCES public.clusters(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text,
  tag         text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
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
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
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
  activity_mode      text DEFAULT 'value' CHECK (activity_mode IN ('value', 'high_intensity')),
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
  channel_label      text,
  target_entity_id   uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  position_id        integer,
  sort_order         integer,
  left_at            timestamptz,
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
  activity_id       uuid REFERENCES public.activities(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS public._flow_ops_schema_patch_runs (
  id bigserial PRIMARY KEY,
  label text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- 4. TRIGGER FUNCTIONS
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. APPLY TRIGGERS
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT t.table_name
    FROM information_schema.tables t
    JOIN information_schema.columns c 
      ON c.table_name = t.table_name 
     AND c.table_schema = t.table_schema
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
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

-- 6. UTILITY FUNCTIONS
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
  v_org_id uuid;
  membership_role app_role;
  inherited_role text;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RETURN 'viewer'::app_role;
  END IF;

  SELECT role
  INTO membership_role
  FROM public.organization_memberships
  WHERE user_id = auth.uid()
    AND org_id = v_org_id
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
    AND o.id = v_org_id
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
  v_org_id uuid;
  v_current_role app_role;
  inserted_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  v_org_id := public.get_my_org_id();
  v_current_role := public.get_my_role();

  IF v_org_id IS NULL THEN
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
    v_org_id,
    p_entity_id,
    auth.uid(),
    NULLIF(trim(COALESCE(p_actor_label, '')), ''),
    v_current_role,
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

-- 7. INDEXES
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
CREATE INDEX IF NOT EXISTS idx_records_activity_position ON public.records(activity_id, position_id);
CREATE INDEX IF NOT EXISTS idx_records_entity_left_at ON public.records(entity_id, left_at);
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

-- 8. SECURITY (RLS)
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

DROP POLICY IF EXISTS clusters_read ON public.clusters;
CREATE POLICY clusters_read ON public.clusters
  FOR SELECT USING (public.user_has_cluster_access(id));

DROP POLICY IF EXISTS organizations_read ON public.organizations;
CREATE POLICY organizations_read ON public.organizations
  FOR SELECT USING (public.user_has_org_access(id) OR public.is_org_in_my_cluster(id));

DROP POLICY IF EXISTS cluster_memberships_read ON public.cluster_memberships;
CREATE POLICY cluster_memberships_read ON public.cluster_memberships
  FOR SELECT USING (user_id = auth.uid() OR public.user_has_cluster_access(cluster_id));

DROP POLICY IF EXISTS organization_memberships_read ON public.organization_memberships;
CREATE POLICY organization_memberships_read ON public.organization_memberships
  FOR SELECT USING (user_id = auth.uid() OR public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id));

DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.user_has_cluster_access(active_cluster_id));

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Dynamic Read/Write for Org-Bound Tables
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
        '_flow_ops_schema_patch_runs'
      )
    GROUP BY t.table_name
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_read ON public.%I FOR SELECT USING (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id))',
      table_name,
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL USING (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id)) WITH CHECK (public.user_has_org_access(org_id) OR public.is_org_in_my_cluster(org_id))',
      table_name,
      table_name
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 8A. LEDGER AND AUDIT VIEWS
CREATE OR REPLACE VIEW public.audit_record_ledger
WITH (security_invoker = true) AS
SELECT
  r.id AS record_id,
  r.org_id,
  r.activity_id,
  a.label AS activity_label,
  a.date AS activity_date,
  r.entity_id,
  e.name AS entity_name,
  COALESCE(NULLIF(r.channel_label, ''), 'Unassigned') AS channel_label,
  r.direction,
  r.status,
  r.unit_amount,
  CASE
    WHEN r.direction = 'increase' THEN r.unit_amount
    WHEN r.direction = 'decrease' THEN -r.unit_amount
    ELSE 0::numeric
  END AS signed_amount,
  CASE
    WHEN r.status = 'applied' AND r.direction = 'increase' THEN r.unit_amount
    WHEN r.status = 'applied' AND r.direction = 'decrease' THEN -r.unit_amount
    ELSE 0::numeric
  END AS applied_signed_amount,
  CASE
    WHEN r.status = 'applied' AND r.direction = 'increase' THEN r.unit_amount
    ELSE 0::numeric
  END AS applied_increase_amount,
  CASE
    WHEN r.status = 'applied' AND r.direction = 'decrease' THEN r.unit_amount
    ELSE 0::numeric
  END AS applied_decrease_amount,
  r.transfer_group_id,
  r.target_entity_id,
  r.left_at,
  r.created_at,
  r.updated_at
FROM public.records r
LEFT JOIN public.activities a ON a.id = r.activity_id
LEFT JOIN public.entities e ON e.id = r.entity_id;

CREATE OR REPLACE VIEW public.entity_balances
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.org_id,
  e.name,
  COALESCE(SUM(l.applied_signed_amount), 0)::numeric(12, 2) AS net,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_inflow,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS record_count,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied' AND l.applied_signed_amount > 0)::integer AS surplus_count,
  MAX(l.created_at) AS last_active,
  0::numeric(12, 2) AS avg_duration_hours
FROM public.entities e
LEFT JOIN public.audit_record_ledger l ON l.entity_id = e.id
GROUP BY e.id, e.org_id, e.name;

CREATE OR REPLACE VIEW public.audit_activity_integrity
WITH (security_invoker = true) AS
SELECT
  a.org_id,
  a.id AS activity_id,
  a.label AS activity_label,
  a.date AS activity_date,
  COUNT(l.record_id)::integer AS total_records,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS applied_record_count,
  COUNT(l.record_id) FILTER (WHERE l.status IN ('pending', 'deferred'))::integer AS open_record_count,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_increase,
  COALESCE(SUM(l.applied_decrease_amount), 0)::numeric(12, 2) AS total_decrease,
  COALESCE(SUM(l.applied_signed_amount), 0)::numeric(12, 2) AS net_amount,
  CASE
    WHEN ABS(COALESCE(SUM(l.applied_signed_amount), 0)) < 0.01 THEN 'ok'
    ELSE 'broken'
  END AS status,
  MAX(l.created_at) AS last_record_at
FROM public.activities a
LEFT JOIN public.audit_record_ledger l ON l.activity_id = a.id
GROUP BY a.org_id, a.id, a.label, a.date;

CREATE OR REPLACE VIEW public.audit_entity_health
WITH (security_invoker = true) AS
SELECT
  e.org_id,
  e.id AS entity_id,
  e.name AS entity_name,
  COUNT(l.record_id)::integer AS total_records,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS applied_record_count,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_increase,
  COALESCE(SUM(l.applied_decrease_amount), 0)::numeric(12, 2) AS total_decrease,
  COALESCE(SUM(l.applied_signed_amount), 0)::numeric(12, 2) AS net_amount,
  CASE
    WHEN COALESCE(SUM(l.applied_signed_amount), 0) < 0 THEN 'watch'
    ELSE 'ok'
  END AS status,
  MAX(l.created_at) AS last_record_at
FROM public.entities e
LEFT JOIN public.audit_record_ledger l ON l.entity_id = e.id
GROUP BY e.org_id, e.id, e.name;

CREATE OR REPLACE VIEW public.audit_channel_integrity
WITH (security_invoker = true) AS
SELECT
  l.org_id,
  l.channel_label,
  COUNT(l.record_id)::integer AS total_records,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS applied_record_count,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_increase,
  COALESCE(SUM(l.applied_decrease_amount), 0)::numeric(12, 2) AS total_decrease,
  COALESCE(SUM(l.applied_signed_amount), 0)::numeric(12, 2) AS net_amount,
  CASE
    WHEN ABS(COALESCE(SUM(l.applied_signed_amount), 0)) < 0.01 THEN 'ok'
    ELSE 'broken'
  END AS status
FROM public.audit_record_ledger l
GROUP BY l.org_id, l.channel_label;

CREATE OR REPLACE VIEW public.audit_org_integrity
WITH (security_invoker = true) AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  COUNT(l.record_id)::integer AS total_records,
  COUNT(l.record_id) FILTER (WHERE l.status = 'applied')::integer AS applied_record_count,
  COALESCE(SUM(l.applied_increase_amount), 0)::numeric(12, 2) AS total_increase,
  COALESCE(SUM(l.applied_decrease_amount), 0)::numeric(12, 2) AS total_decrease,
  COALESCE(SUM(l.applied_signed_amount), 0)::numeric(12, 2) AS net_amount,
  COUNT(a.activity_id) FILTER (WHERE a.status = 'broken')::integer AS broken_activity_count,
  CASE
    WHEN ABS(COALESCE(SUM(l.applied_signed_amount), 0)) < 0.01
      AND COUNT(a.activity_id) FILTER (WHERE a.status = 'broken') = 0 THEN 'ok'
    ELSE 'broken'
  END AS status
FROM public.organizations o
LEFT JOIN public.audit_record_ledger l ON l.org_id = o.id
LEFT JOIN public.audit_activity_integrity a ON a.org_id = o.id
GROUP BY o.id, o.name;

CREATE OR REPLACE VIEW public.audit_record_anomalies
WITH (security_invoker = true) AS
SELECT
  CONCAT('activity-imbalance:', a.activity_id) AS anomaly_id,
  a.org_id,
  'activity_imbalance'::text AS anomaly_type,
  'error'::text AS severity,
  a.activity_id,
  NULL::uuid AS entity_id,
  NULL::text AS channel_label,
  1::integer AS affected_count,
  CONCAT('Activity net is ', a.net_amount::text) AS detail
FROM public.audit_activity_integrity a
WHERE a.status = 'broken'

UNION ALL

SELECT
  CONCAT('org-imbalance:', o.org_id) AS anomaly_id,
  o.org_id,
  'org_imbalance'::text AS anomaly_type,
  'error'::text AS severity,
  NULL::uuid AS activity_id,
  NULL::uuid AS entity_id,
  NULL::text AS channel_label,
  1::integer AS affected_count,
  CONCAT('Organization net is ', o.net_amount::text) AS detail
FROM public.audit_org_integrity o
WHERE o.status = 'broken'

UNION ALL

SELECT
  CONCAT('channel-imbalance:', c.org_id, ':', c.channel_label) AS anomaly_id,
  c.org_id,
  'channel_imbalance'::text AS anomaly_type,
  'warning'::text AS severity,
  NULL::uuid AS activity_id,
  NULL::uuid AS entity_id,
  c.channel_label,
  1::integer AS affected_count,
  CONCAT('Channel net is ', c.net_amount::text) AS detail
FROM public.audit_channel_integrity c
WHERE c.status = 'broken'

UNION ALL

SELECT
  CONCAT('transfer-pair:', r.org_id, ':', r.transfer_group_id::text) AS anomaly_id,
  r.org_id,
  'missing_transfer_pair'::text AS anomaly_type,
  'warning'::text AS severity,
  NULL::uuid AS activity_id,
  NULL::uuid AS entity_id,
  NULL::text AS channel_label,
  COUNT(*)::integer AS affected_count,
  'Transfer group does not contain an even number of records.' AS detail
FROM public.records r
WHERE r.transfer_group_id IS NOT NULL
GROUP BY r.org_id, r.transfer_group_id
HAVING MOD(COUNT(*), 2) <> 0

UNION ALL

SELECT
  CONCAT('transfer-target:', r.id::text) AS anomaly_id,
  r.org_id,
  'transfer_missing_target'::text AS anomaly_type,
  'warning'::text AS severity,
  r.activity_id,
  r.entity_id,
  COALESCE(NULLIF(r.channel_label, ''), 'Unassigned') AS channel_label,
  1::integer AS affected_count,
  'Transfer record is missing a target entity.' AS detail
FROM public.records r
WHERE r.direction = 'transfer'
  AND r.target_entity_id IS NULL

UNION ALL

SELECT
  CONCAT('time-anomaly:', r.id::text) AS anomaly_id,
  r.org_id,
  'invalid_exit_time'::text AS anomaly_type,
  'error'::text AS severity,
  r.activity_id,
  r.entity_id,
  COALESCE(NULLIF(r.channel_label, ''), 'Unassigned') AS channel_label,
  1::integer AS affected_count,
  'Record left_at precedes created_at.' AS detail
FROM public.records r
WHERE r.left_at IS NOT NULL
  AND r.left_at < r.created_at;

GRANT SELECT ON public.audit_record_ledger TO authenticated, service_role;
GRANT SELECT ON public.entity_balances TO authenticated, service_role;
GRANT SELECT ON public.audit_activity_integrity TO authenticated, service_role;
GRANT SELECT ON public.audit_entity_health TO authenticated, service_role;
GRANT SELECT ON public.audit_channel_integrity TO authenticated, service_role;
GRANT SELECT ON public.audit_org_integrity TO authenticated, service_role;
GRANT SELECT ON public.audit_record_anomalies TO authenticated, service_role;

REVOKE ALL ON public._flow_ops_schema_patch_runs FROM PUBLIC;
GRANT ALL ON public._flow_ops_schema_patch_runs TO postgres;

NOTIFY pgrst, 'reload schema';

-- 9. GLOBAL PERMISSIONS (ensure API access)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- 10. BOOTSTRAP
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

INSERT INTO public._flow_ops_schema_patch_runs (label)
VALUES ('00000000000000_init_canonical_schema');

COMMIT;
