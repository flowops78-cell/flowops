-- Migration: Rename Units to Entities
-- Created at: 2026-03-25

-- 1. Rename Tables
alter table if exists units rename to entities;
alter table if exists unit_account_entries rename to entity_account_entries;

-- 2. Rename Columns in 'entities' (formerly units)
-- (None usually needed based on schema, but check for references)

-- 3. Rename 'unit_id' to 'entity_id' in referencing tables
alter table if exists entries rename column unit_id to entity_id;
alter table if exists adjustment_requests rename column unit_id to entity_id;
alter table if exists output_requests rename column unit_id to entity_id;
alter table if exists allocations rename column unit_id to entity_id;
alter table if exists adjustments rename column unit_id to entity_id;
alter table if exists entity_account_entries rename column unit_id to entity_id;

-- 4. Rename Functions
do $$
begin
  if exists (select 1 from pg_proc where proname = 'adjust_unit_balance') then
    alter function adjust_unit_balance(uuid, numeric) rename to adjust_entity_balance;
  end if;
end;
$$;

-- 5. Update RLS Policies (Rename them for clarity)
do $$
begin
  if exists (select 1 from pg_policies where tablename = 'entities' and policyname = 'units_select') then
    alter policy "units_select" on entities rename to "entities_select";
  end if;
  if exists (select 1 from pg_policies where tablename = 'entities' and policyname = 'units_all') then
    alter policy "units_all" on entities rename to "entities_all";
  end if;
  if exists (select 1 from pg_policies where tablename = 'entities' and policyname = 'units_read') then
    alter policy "units_read" on entities rename to "entities_read";
  end if;
  if exists (select 1 from pg_policies where tablename = 'entities' and policyname = 'units_write') then
    alter policy "units_write" on entities rename to "entities_write";
  end if;

  if exists (select 1 from pg_policies where tablename = 'entity_account_entries' and policyname = 'unit_account_entries_select') then
    alter policy "unit_account_entries_select" on entity_account_entries rename to "entity_account_entries_select";
  end if;
  if exists (select 1 from pg_policies where tablename = 'entity_account_entries' and policyname = 'unit_account_entries_all') then
    alter policy "unit_account_entries_all" on entity_account_entries rename to "entity_account_entries_all";
  end if;
  if exists (select 1 from pg_policies where tablename = 'entity_account_entries' and policyname = 'unit_account_entries_read') then
    alter policy "unit_account_entries_read" on entity_account_entries rename to "entity_account_entries_read";
  end if;
  if exists (select 1 from pg_policies where tablename = 'entity_account_entries' and policyname = 'unit_account_entries_write') then
    alter policy "unit_account_entries_write" on entity_account_entries rename to "entity_account_entries_write";
  end if;
end;
$$;

-- 6. Update Triggers (if any specific to naming)
-- The 'set_updated_at' trigger on 'entities' (formerly units) works automatically.

-- 7. Audit Logs Cleanup (Optional: Move old actions to new terminology)
update audit_events set 
  action = replace(action, 'unit_', 'entity_'),
  entity = replace(entity, 'unit', 'entity')
where action like 'unit_%' or entity = 'unit';
