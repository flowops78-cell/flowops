-- Flow Ops Canonical Backend Verification
-- Use this to verify a database created from supabase/migrations/20260327000000_baseline_schema.sql.

-- 1) Schema sanity
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'clusters',
    'organizations',
    'platform_roles',
    'cluster_memberships',
    'organization_memberships',
    'profiles',
    'collaborations',
    'entities',
    'activities',
    'records',
    'team_members',
    'channels',
    'channel_records',
    'operator_activities',
    'audit_events',
    'access_requests',
    'access_invites'
  )
order by table_name;

-- 2) enum values
select t.typname, e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname in ('app_role', 'record_status', 'record_direction', 'collaboration_type')
order by t.typname, e.enumsortorder;

-- 3) key uniqueness guards
select t.relname as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
where (
  t.relname = 'cluster_memberships'
  and c.contype = 'u'
)
or (
  t.relname = 'organization_memberships'
  and c.contype = 'u'
)
order by t.relname, c.conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'uq_team_members_org_user_id',
    'idx_records_activity_id',
    'idx_records_entity_id',
    'idx_channel_records_record_id',
    'idx_access_invites_org_id'
  )
order by indexname;

-- 4) lifecycle constraint checks on canonical tables
select t.relname as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
where t.relname in ('activities', 'records', 'collaborations', 'channels', 'access_requests', 'access_invites')
  and c.contype = 'c'
order by t.relname, c.conname;

-- 5) expected column presence checks
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'entities' and column_name in (
      'org_id', 'name', 'collaboration_id', 'referred_by_entity_id', 'referring_collaboration_id', 'total_units'
    ))
    or
    (table_name = 'activities' and column_name in (
      'org_id', 'label', 'date', 'start_time', 'status', 'channel_label', 'assigned_user_id'
    ))
    or
    (table_name = 'records' and column_name in (
      'org_id', 'activity_id', 'entity_id', 'direction', 'status', 'unit_amount', 'transfer_group_id', 'notes'
    ))
    or
    (table_name = 'collaborations' and column_name in (
      'org_id', 'name', 'collaboration_type', 'participation_factor', 'overhead_weight_pct', 'rules'
    ))
    or
    (table_name = 'team_members' and column_name in (
      'org_id', 'name', 'staff_role', 'user_id'
    ))
    or
    (table_name = 'channels' and column_name in (
      'org_id', 'name', 'status', 'notes'
    ))
    or
    (table_name = 'channel_records' and column_name in (
      'org_id', 'activity_id', 'channel_id', 'record_id', 'created_at'
    ))
    or
    (table_name = 'audit_events' and column_name in (
      'org_id', 'entity_id', 'actor_user_id', 'actor_label', 'actor_role', 'operator_activity_id', 'details'
    ))
    or
    (table_name = 'access_requests' and column_name in (
      'org_id', 'login_id', 'requested_role', 'reviewed_by', 'reviewed_at'
    ))
    or
    (table_name = 'access_invites' and column_name in (
      'org_id', 'token_hash', 'created_by', 'expires_at', 'revoked_at', 'last_used_at', 'use_count', 'max_uses'
    ))
  )
order by table_name, column_name;

-- 6) legacy tables and columns should be absent
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    table_name in (
      'workspaces',
      'units',
      'entries',
      'associates',
      'members',
      'channel_entries',
      'activity_logs',
      'allocations',
      'adjustments',
      'associate_allocations',
      'unit_account_entries',
      'adjustment_requests',
      'output_requests',
      'expenses',
      'transfer_accounts',
      'user_roles',
      'org_clusters',
      'orgs',
      'org_memberships'
    )
    or
    (table_name = 'records' and column_name in ('workspace_id', 'unit_id', 'input_amount', 'output_amount'))
    or
    (table_name = 'entities' and column_name in ('attributed_associate_id', 'referred_by_partner_id'))
    or
    (table_name = 'activities' and column_name in ('assigned_operator_id', 'channel'))
    or
    (table_name = 'team_members' and column_name in ('member_id', 'role'))
  )
order by table_name, column_name;

-- 7) required helper functions should exist
select routine_name, routine_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name in (
    'get_my_role',
    'get_my_org_id',
    'get_my_platform_role',
    'user_has_org_access',
    'user_has_cluster_access',
    'is_org_in_my_cluster',
    'log_audit_event',
    'update_updated_at_column'
  )
order by routine_name;

-- 8) row level security should be enabled across protected tables
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'clusters',
    'organizations',
    'platform_roles',
    'cluster_memberships',
    'organization_memberships',
    'profiles',
    'collaborations',
    'entities',
    'activities',
    'records',
    'team_members',
    'channels',
    'channel_records',
    'operator_activities',
    'audit_events',
    'access_requests',
    'access_invites'
  )
order by c.relname;

-- 9) policies that must exist on governance and org-scoped tables
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'clusters' and policyname = 'clusters_read')
    or
    (tablename = 'organizations' and policyname = 'organizations_read')
    or
    (tablename = 'cluster_memberships' and policyname = 'cluster_memberships_read')
    or
    (tablename = 'organization_memberships' and policyname = 'organization_memberships_read')
    or
    (tablename = 'profiles' and policyname in ('profiles_read', 'profiles_update'))
    or
    (tablename = 'collaborations' and policyname in ('collaborations_read', 'collaborations_write'))
    or
    (tablename = 'entities' and policyname in ('entities_read', 'entities_write'))
    or
    (tablename = 'activities' and policyname in ('activities_read', 'activities_write'))
    or
    (tablename = 'records' and policyname in ('records_read', 'records_write'))
    or
    (tablename = 'team_members' and policyname in ('team_members_read', 'team_members_write'))
    or
    (tablename = 'channels' and policyname in ('channels_read', 'channels_write'))
    or
    (tablename = 'channel_records' and policyname in ('channel_records_read', 'channel_records_write'))
    or
    (tablename = 'operator_activities' and policyname in ('operator_activities_read', 'operator_activities_write'))
    or
    (tablename = 'audit_events' and policyname in ('audit_events_read', 'audit_events_write'))
    or
    (tablename = 'access_requests' and policyname in ('access_requests_read', 'access_requests_write'))
    or
    (tablename = 'access_invites' and policyname in ('access_invites_read', 'access_invites_write'))
  )
order by tablename, policyname;
