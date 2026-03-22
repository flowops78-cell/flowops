-- Flow Ops Verification
-- Use this to verify a database created from supabase/migrations/20260322230000_flow_ops_schema.sql.

-- 1) Schema sanity
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'user_roles',
    'profiles',
    'workspaces',
    'units',
    'entries',
    'activity_logs',
    'allocations',
    'adjustments',
    'channel_entries',
    'partners',
    'partner_entries',
    'unit_account_entries',
    'adjustment_requests',
    'output_requests',
    'operator_activities',
    'members',
    'expenses',
    'transfer_accounts',
    'audit_events',
    'access_requests',
    'access_invites'
  )
order by table_name;

-- 2) app_role enum values
select e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname = 'app_role'
order by e.enumsortorder;

-- 3) key uniqueness guards
select t.relname as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
where (
  t.relname = 'user_roles'
  and c.contype = 'u'
  and c.conname = 'uq_user_roles_user_id'
)
or (
  t.relname = 'members'
  and c.contype = 'u'
)
order by t.relname, c.conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'members'
  and indexname = 'idx_members_org_user_unique';

-- 4) lifecycle constraint checks on workspaces and queue tables
select t.relname as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
where t.relname in ('workspaces', 'adjustments', 'channel_entries', 'partner_entries', 'unit_account_entries', 'adjustment_requests', 'output_requests', 'members')
  and c.contype = 'c'
order by t.relname, c.conname;

-- 5) expected column presence checks
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'workspaces' and column_name in (
      'org_id', 'activity_category', 'workspace_mode', 'assigned_operator_id', 'end_time',
      'system_contribution', 'channel_value', 'activity_frequency'
    ))
    or
    (table_name = 'units' and column_name in (
      'org_id', 'tags', 'referred_by_partner_id'
    ))
    or
    (table_name = 'partners' and column_name in (
      'org_id', 'contact_method', 'contact_value'
    ))
    or
    (table_name = 'entries' and column_name in (
      'unit_name', 'input_amount', 'output_amount', 'total_input', 'joined_at', 'left_at',
      'position_id', 'activity_units', 'sort_order', 'source_method'
    ))
    or
    (table_name = 'members' and column_name in (
      'user_id', 'member_id', 'incentive_type', 'service_rate', 'retainer_rate', 'tags'
    ))
    or
    (table_name = 'adjustment_requests' and column_name in (
      'org_id', 'unit_id', 'amount', 'type', 'status', 'requested_at', 'resolved_at', 'resolved_by'
    ))
    or
    (table_name = 'transfer_accounts' and column_name in (
      'category', 'is_active', 'status'
    ))
    or
    (table_name = 'audit_events' and column_name in (
      'actor_user_id', 'actor_label', 'actor_role', 'operator_activity_id', 'details'
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

-- 6) columns that should be absent
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'access_requests' and column_name in ('requested_name', 'requested_password'))
    or
    (table_name = 'partners' and column_name = 'contact')
    or
    (table_name = 'units' and column_name = 'phone')
  )
order by table_name, column_name;

-- 7) required helper functions should exist
select routine_name, routine_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name in (
    'get_my_role',
    'get_my_org_id',
    'adjust_unit_balance',
    'adjust_partner_total',
    'log_audit_event',
    'channel_base_transfer'
  )
order by routine_name;

-- 8) function execute grants for privileged helpers
select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where specific_schema = 'public'
  and routine_name in (
    'adjust_unit_balance',
    'adjust_partner_total',
    'log_audit_event',
    'channel_base_transfer'
  )
order by routine_name, grantee, privilege_type;

-- 9) row level security should be enabled across all protected tables
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'user_roles',
    'profiles',
    'workspaces',
    'units',
    'entries',
    'activity_logs',
    'allocations',
    'adjustments',
    'channel_entries',
    'partners',
    'partner_entries',
    'unit_account_entries',
    'adjustment_requests',
    'output_requests',
    'operator_activities',
    'members',
    'expenses',
    'transfer_accounts',
    'audit_events',
    'access_requests',
    'access_invites'
  )
order by c.relname;

-- 10) review policies that must exist on the access-control tables
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'adjustments' and policyname in (
      'adjustments_read', 'adjustments_write'
    ))
    or
    (tablename = 'adjustment_requests' and policyname in (
      'adjustment_requests_read', 'adjustment_requests_insert', 'adjustment_requests_update'
    ))
    or
    (tablename = 'output_requests' and policyname in (
      'output_requests_read', 'output_requests_insert', 'output_requests_update'
    ))
    or
    (tablename = 'access_invites' and policyname in (
      'access_invites_read', 'access_invites_insert', 'access_invites_update', 'access_invites_delete'
    ))
    or
    (tablename = 'access_requests' and policyname in (
      'access_requests_read', 'access_requests_update'
    ))
    or
    (tablename = 'audit_events' and policyname = 'audit_events_read')
  )
order by tablename, policyname;

-- 11) direct client insert/write policies that should remain absent
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'audit_events' and policyname = 'audit_events_write')
    or
    (tablename = 'adjustment_requests' and policyname = 'adjustment_requests_write')
    or
    (tablename = 'output_requests' and policyname = 'output_requests_write')
    or
    (tablename = 'access_requests' and policyname in ('access_requests_insert', 'access_requests_write'))
  )
order by tablename, policyname;

-- 12) indexes that support org-scoped access and invite lookup
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_profiles_org_id',
    'idx_workspaces_org_id',
    'idx_units_org_id',
    'idx_entries_org_id',
    'idx_activity_logs_org_id',
    'idx_allocations_org_id',
    'idx_adjustments_org_id',
    'idx_channel_entries_org_id',
    'idx_partners_org_id',
    'idx_partner_entries_org_id',
    'idx_unit_account_entries_org_id',
    'idx_adjustment_requests_org_id',
    'idx_output_requests_org_id',
    'idx_operator_activities_org_id',
    'idx_members_org_id',
    'idx_expenses_org_id',
    'idx_transfer_accounts_org_id',
    'idx_audit_events_org_id',
    'idx_access_requests_org_id',
    'idx_access_invites_org_id',
    'idx_access_invites_active_lookup'
  )
order by indexname;
