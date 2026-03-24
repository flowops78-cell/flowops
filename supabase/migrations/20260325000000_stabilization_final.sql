-- Migration: Stabilization Final (RLS Policies & Updated At Triggers)
-- Created at: 2026-03-25

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. UPDATED_AT TRIGGER FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. APPLY UPDATED_AT TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  for t in select table_name 
           from information_schema.columns 
           where column_name = 'updated_at' 
             and table_schema = 'public'
             and table_type = 'BASE TABLE'
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function update_updated_at_column()', t);
  end loop;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MISSING RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Activity Logs: Cluster members can view
drop policy if exists "activity_logs_select" on activity_logs;
create policy "activity_logs_select" on activity_logs for select
using (is_org_in_my_cluster(org_id));

-- Access Requests: Cluster members can view
drop policy if exists "access_requests_select" on access_requests;
create policy "access_requests_select" on access_requests for select
using (is_org_in_my_cluster(org_id));

-- Access Invites: Cluster members can view
drop policy if exists "access_invites_select" on access_invites;
create policy "access_invites_select" on access_invites for select
using (is_org_in_my_cluster(org_id));

-- Operator Activities: Cluster members can view
drop policy if exists "operator_activities_select" on operator_activities;
create policy "operator_activities_select" on operator_activities for select
using (is_org_in_my_cluster(org_id));

-- Additional permissions for Admins to manage requests/invites
drop policy if exists "access_requests_all" on access_requests;
create policy "access_requests_all" on access_requests for all
using (get_my_role() = 'admin' and is_org_in_my_cluster(org_id));

drop policy if exists "access_invites_all" on access_invites;
create policy "access_invites_all" on access_invites for all
using (get_my_role() = 'admin' and is_org_in_my_cluster(org_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FINAL HARDENING
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure profiles are correctly created for all users (Handle existing users if any)
-- This is optional but good for integrity
insert into profiles (id, org_id)
select id, null from auth.users
on conflict (id) do nothing;
