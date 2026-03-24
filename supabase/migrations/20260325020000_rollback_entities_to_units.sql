-- Migration: Rollback Entities to Units (Data Layer Only)
-- Created at: 2026-03-25

-- 1. Rename Tables Back
alter table if exists entities rename to units;
alter table if exists entity_account_entries rename to unit_account_entries;

-- 2. Rename Columns Back
alter table if exists entries rename column entity_id to unit_id;
alter table if exists adjustment_requests rename column entity_id to unit_id;
alter table if exists output_requests rename column entity_id to unit_id;
alter table if exists allocations rename column entity_id to unit_id;
alter table if exists adjustments rename column entity_id to unit_id;
alter table if exists unit_account_entries rename column entity_id to unit_id;

-- 3. Rename Functions Back
do $$
begin
  if exists (select 1 from pg_proc where proname = 'adjust_entity_balance') then
    alter function adjust_entity_balance(uuid, numeric) rename to adjust_unit_balance;
  end if;
end;
$$;

-- 4. Revert RLS Policies
do $$
begin
  if exists (select 1 from pg_policies where tablename = 'units' and policyname = 'entities_select') then
    alter policy "entities_select" on units rename to "units_select";
  end if;
  if exists (select 1 from pg_policies where tablename = 'units' and policyname = 'entities_all') then
    alter policy "entities_all" on units rename to "units_all";
  end if;
  if exists (select 1 from pg_policies where tablename = 'units' and policyname = 'entities_read') then
    alter policy "entities_read" on units rename to "units_read";
  end if;
  if exists (select 1 from pg_policies where tablename = 'units' and policyname = 'entities_write') then
    alter policy "entities_write" on units rename to "units_write";
  end if;

  if exists (select 1 from pg_policies where tablename = 'unit_account_entries' and policyname = 'entity_account_entries_select') then
    alter policy "entity_account_entries_select" on unit_account_entries rename to "unit_account_entries_select";
  end if;
  if exists (select 1 from pg_policies where tablename = 'unit_account_entries' and policyname = 'entity_account_entries_all') then
    alter policy "entity_account_entries_all" on unit_account_entries rename to "unit_account_entries_all";
  end if;
  if exists (select 1 from pg_policies where tablename = 'unit_account_entries' and policyname = 'entity_account_entries_read') then
    alter policy "entity_account_entries_read" on unit_account_entries rename to "unit_account_entries_read";
  end if;
  if exists (select 1 from pg_policies where tablename = 'unit_account_entries' and policyname = 'entity_account_entries_write') then
    alter policy "entity_account_entries_write" on unit_account_entries rename to "unit_account_entries_write";
  end if;
end;
$$;

-- 5. Audit Logs Cleanup (Revert to unit terminology for internal logging)
update audit_events set 
  action = replace(action, 'entity_', 'unit_'),
  entity = replace(entity, 'entity', 'unit')
where action like 'entity_%' or entity = 'entity';
