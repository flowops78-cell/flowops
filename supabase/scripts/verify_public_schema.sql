-- Automated schema checks for Flow Ops (run via: supabase db execute --file supabase/scripts/verify_public_schema.sql)
-- Requires linked project or local DB.

-- Expected base tables (subset)
SELECT 'table:' || t.nm AS check_id,
       EXISTS (
         SELECT 1
         FROM information_schema.tables it
         WHERE it.table_schema = 'public'
           AND it.table_name = t.nm
           AND it.table_type = 'BASE TABLE'
       ) AS ok
FROM (VALUES
  ('organizations'),
  ('entities'),
  ('activities'),
  ('records'),
  ('profiles'),
  ('organization_memberships'),
  ('channels'),
  ('collaborations'),
  ('team_members'),
  ('audit_events'),
  ('operator_activities')
) AS t(nm)
ORDER BY 1;

-- Expected views (ledger / audit)
SELECT 'view:' || v.nm AS check_id,
       EXISTS (
         SELECT 1
         FROM information_schema.views iv
         WHERE iv.table_schema = 'public'
           AND iv.table_name = v.nm
       ) AS ok
FROM (VALUES
  ('audit_record_ledger'),
  ('entity_balances'),
  ('audit_activity_integrity'),
  ('audit_entity_health'),
  ('audit_org_integrity'),
  ('audit_channel_integrity'),
  ('audit_record_anomalies')
) AS v(nm)
ORDER BY 1;

-- activities columns required by app insert (DataContext.addActivity)
SELECT 'column:activities:' || c.column_name AS check_id,
       TRUE AS ok
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'activities'
  AND c.column_name IN (
    'id', 'org_id', 'label', 'date', 'start_time', 'status',
    'channel_label', 'assigned_user_id', 'activity_mode'
  )
ORDER BY 1;

-- Cluster / org metadata (list UI, routing)
SELECT 'column:organizations:' || c.column_name AS check_id,
       TRUE AS ok
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'organizations'
  AND c.column_name IN ('slug', 'tag')
ORDER BY 1;

SELECT 'column:clusters:' || c.column_name AS check_id,
       TRUE AS ok
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'clusters'
  AND c.column_name IN ('slug', 'tag')
ORDER BY 1;
