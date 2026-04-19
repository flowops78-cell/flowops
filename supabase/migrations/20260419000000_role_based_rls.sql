-- Role-based RLS replacement.
--
-- Replaces the blanket "any org member can CRUD anything in their org"
-- policies from the canonical schema with role-aware, activity-scoped
-- policies:
--   viewer   — SELECT only, scoped to activities assigned to them
--   operator — SELECT + UPDATE records/activities assigned to them
--   admin    — full CRUD across the org (incl. audit, access, memberships)
--
-- Also tightens grants: removes `anon` SELECT; removes `TRUNCATE/REFERENCES/TRIGGER`
-- from `authenticated`. Adds a trigger preventing profile.active_org_id from
-- being set to an org the user isn't a member of.

BEGIN;

-- ───────────────────────────────────────────────────────────────
-- 1. HELPERS
-- ───────────────────────────────────────────────────────────────

-- Return the caller's role in a specific org. Cluster-admin inherits
-- 'admin'; cluster-operator inherits 'operator'. Returns NULL if the
-- caller has no access to that org.
CREATE OR REPLACE FUNCTION public.get_my_role(p_org_id uuid)
RETURNS app_role
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_cluster_role text;
BEGIN
  IF auth.uid() IS NULL OR p_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_role
  FROM public.organization_memberships
  WHERE user_id = auth.uid()
    AND org_id = p_org_id
    AND status = 'active'
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  SELECT cm.role INTO v_cluster_role
  FROM public.cluster_memberships cm
  JOIN public.organizations o ON o.cluster_id = cm.cluster_id
  WHERE cm.user_id = auth.uid()
    AND o.id = p_org_id
  LIMIT 1;

  RETURN CASE
    WHEN v_cluster_role = 'cluster_admin'    THEN 'admin'::app_role
    WHEN v_cluster_role = 'cluster_operator' THEN 'operator'::app_role
    ELSE NULL
  END;
END;
$$;

-- Backward-compatible no-arg version keyed off profile.active_org_id.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_my_role(public.get_my_org_id()), 'viewer'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_role(p_org_id) = 'admin'::app_role;
$$;

CREATE OR REPLACE FUNCTION public.is_operator(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_role(p_org_id) IN ('operator'::app_role, 'admin'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_viewer(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_role(p_org_id) IN
    ('viewer'::app_role, 'operator'::app_role, 'admin'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.activities a
    WHERE a.id = p_activity_id
      AND a.assigned_user_id = auth.uid()
  );
$$;

-- ───────────────────────────────────────────────────────────────
-- 2. DROP OLD BLANKET POLICIES
-- ───────────────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  -- The canonical schema created {table}_read and {table}_write on every
  -- org_id-bound table via a DO loop. Drop them for a clean slate.
  FOR t IN
    SELECT c.table_name
    FROM information_schema.tables tab
    JOIN information_schema.columns c
      ON c.table_schema = tab.table_schema
     AND c.table_name = tab.table_name
    WHERE tab.table_schema = 'public'
      AND tab.table_type = 'BASE TABLE'
      AND c.column_name = 'org_id'
    GROUP BY c.table_name
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS operator_activities_select ON public.operator_activities;
DROP POLICY IF EXISTS operator_activities_insert ON public.operator_activities;
DROP POLICY IF EXISTS operator_activities_update ON public.operator_activities;
DROP POLICY IF EXISTS operator_activities_delete ON public.operator_activities;

DROP POLICY IF EXISTS organization_memberships_read ON public.organization_memberships;
DROP POLICY IF EXISTS profiles_read   ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;

-- clusters_read, organizations_read, cluster_memberships_read are kept —
-- they're correctly scoped already (cluster/org-membership-based read).

-- ───────────────────────────────────────────────────────────────
-- 3. ACTIVITIES
-- ───────────────────────────────────────────────────────────────

CREATE POLICY activities_select ON public.activities
FOR SELECT USING (
  public.is_admin(org_id)
  OR (public.is_viewer(org_id) AND assigned_user_id = auth.uid())
);

CREATE POLICY activities_insert ON public.activities
FOR INSERT WITH CHECK (public.is_admin(org_id));

CREATE POLICY activities_update ON public.activities
FOR UPDATE
USING (
  public.is_admin(org_id)
  OR (public.is_operator(org_id) AND assigned_user_id = auth.uid())
)
WITH CHECK (
  public.is_admin(org_id)
  OR (public.is_operator(org_id) AND assigned_user_id = auth.uid())
);

CREATE POLICY activities_delete ON public.activities
FOR DELETE USING (public.is_admin(org_id));

-- ───────────────────────────────────────────────────────────────
-- 4. RECORDS + CHANNEL_RECORDS (inherit activity assignment)
-- ───────────────────────────────────────────────────────────────

CREATE POLICY records_select ON public.records
FOR SELECT USING (
  public.is_admin(org_id)
  OR (public.is_viewer(org_id) AND public.is_assigned_activity(activity_id))
);

CREATE POLICY records_write ON public.records
FOR ALL
USING (
  public.is_admin(org_id)
  OR (public.is_operator(org_id) AND public.is_assigned_activity(activity_id))
)
WITH CHECK (
  public.is_admin(org_id)
  OR (public.is_operator(org_id) AND public.is_assigned_activity(activity_id))
);

CREATE POLICY channel_records_select ON public.channel_records
FOR SELECT USING (
  public.is_admin(org_id)
  OR (public.is_viewer(org_id) AND public.is_assigned_activity(activity_id))
);

CREATE POLICY channel_records_write ON public.channel_records
FOR ALL
USING (
  public.is_admin(org_id)
  OR (public.is_operator(org_id) AND public.is_assigned_activity(activity_id))
)
WITH CHECK (
  public.is_admin(org_id)
  OR (public.is_operator(org_id) AND public.is_assigned_activity(activity_id))
);

-- ───────────────────────────────────────────────────────────────
-- 5. REFERENCE DATA: entities / channels / collaborations
--    All org members read; only admins write.
-- ───────────────────────────────────────────────────────────────

CREATE POLICY entities_select ON public.entities
FOR SELECT USING (public.is_viewer(org_id));
CREATE POLICY entities_admin_write ON public.entities
FOR ALL USING (public.is_admin(org_id)) WITH CHECK (public.is_admin(org_id));

CREATE POLICY channels_select ON public.channels
FOR SELECT USING (public.is_viewer(org_id));
CREATE POLICY channels_admin_write ON public.channels
FOR ALL USING (public.is_admin(org_id)) WITH CHECK (public.is_admin(org_id));

CREATE POLICY collaborations_select ON public.collaborations
FOR SELECT USING (public.is_viewer(org_id));
CREATE POLICY collaborations_admin_write ON public.collaborations
FOR ALL USING (public.is_admin(org_id)) WITH CHECK (public.is_admin(org_id));

-- ───────────────────────────────────────────────────────────────
-- 6. OPERATOR_ACTIVITIES — users manage their own session rows;
--    admins see/manage all in the org.
-- ───────────────────────────────────────────────────────────────

CREATE POLICY operator_activities_select ON public.operator_activities
FOR SELECT USING (
  actor_user_id = auth.uid() OR public.is_admin(org_id)
);

CREATE POLICY operator_activities_own_write ON public.operator_activities
FOR ALL
USING (
  actor_user_id = auth.uid() OR public.is_admin(org_id)
)
WITH CHECK (
  (actor_user_id = auth.uid() AND public.is_viewer(org_id))
  OR public.is_admin(org_id)
);

-- ───────────────────────────────────────────────────────────────
-- 7. SENSITIVE: audit_events / access_requests / access_invites
-- ───────────────────────────────────────────────────────────────

-- Audit: admins read; anyone in org can insert *their own* event
-- (needed for log_audit_event() called by RLS-governed clients).
CREATE POLICY audit_events_admin_read ON public.audit_events
FOR SELECT USING (public.is_admin(org_id));

CREATE POLICY audit_events_self_insert ON public.audit_events
FOR INSERT
WITH CHECK (
  public.is_viewer(org_id)
  AND actor_user_id = auth.uid()
);

CREATE POLICY access_requests_admin_only ON public.access_requests
FOR ALL USING (public.is_admin(org_id)) WITH CHECK (public.is_admin(org_id));

CREATE POLICY access_invites_admin_only ON public.access_invites
FOR ALL USING (public.is_admin(org_id)) WITH CHECK (public.is_admin(org_id));

-- ───────────────────────────────────────────────────────────────
-- 8. MEMBERSHIPS — users see themselves; admins see/manage all in org
-- ───────────────────────────────────────────────────────────────

CREATE POLICY memberships_select ON public.organization_memberships
FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin(org_id)
);

CREATE POLICY memberships_admin_write ON public.organization_memberships
FOR ALL USING (public.is_admin(org_id)) WITH CHECK (public.is_admin(org_id));

-- ───────────────────────────────────────────────────────────────
-- 9. PROFILES — self read/update, with active_org_id guard
-- ───────────────────────────────────────────────────────────────

CREATE POLICY profiles_read ON public.profiles
FOR SELECT USING (id = auth.uid());

CREATE POLICY profiles_update ON public.profiles
FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Block setting active_org_id to an org the user isn't a member of.
CREATE OR REPLACE FUNCTION public.enforce_active_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.active_org_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE user_id = NEW.id
        AND org_id = NEW.active_org_id
        AND status = 'active'
    ) AND NOT EXISTS (
      -- cluster admins/operators may also set active_org_id to an org in their cluster
      SELECT 1 FROM public.organizations o
      JOIN public.cluster_memberships cm ON cm.cluster_id = o.cluster_id
      WHERE o.id = NEW.active_org_id AND cm.user_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'profiles.active_org_id (%) must reference an org the user belongs to', NEW.active_org_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_active_org ON public.profiles;
CREATE TRIGGER trg_enforce_active_org
  BEFORE INSERT OR UPDATE OF active_org_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_org();

-- ───────────────────────────────────────────────────────────────
-- 10. UPDATE log_audit_event TO USE THE NEW get_my_role(p_org_id)
--     (the original called the no-arg version, which still exists
--      for back-compat, but pass the org explicitly for clarity).
-- ───────────────────────────────────────────────────────────────

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
  v_role app_role;
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN RETURN NULL; END IF;

  v_role := public.get_my_role(v_org_id);

  INSERT INTO public.audit_events (
    org_id, entity_id, actor_user_id, actor_label, actor_role,
    action, entity, operator_activity_id, amount, details
  )
  VALUES (
    v_org_id, p_entity_id, auth.uid(),
    NULLIF(trim(COALESCE(p_actor_label, '')), ''),
    v_role, p_action, p_entity, p_operator_activity_id, p_amount,
    NULLIF(trim(COALESCE(p_details, '')), '')
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────
-- 11. GRANTS — tighten
-- ───────────────────────────────────────────────────────────────

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Views remain SELECTable (they enforce RLS via security_invoker).
GRANT SELECT ON public.audit_record_ledger       TO authenticated;
GRANT SELECT ON public.entity_balances           TO authenticated;
GRANT SELECT ON public.audit_activity_integrity  TO authenticated;
GRANT SELECT ON public.audit_entity_health       TO authenticated;
GRANT SELECT ON public.audit_channel_integrity   TO authenticated;
GRANT SELECT ON public.audit_org_integrity       TO authenticated;
GRANT SELECT ON public.audit_record_anomalies    TO authenticated;

-- service_role keeps full access (used by edge functions).
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Notify PostgREST to reload schema cache.
NOTIFY pgrst, 'reload schema';

COMMIT;
