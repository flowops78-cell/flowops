-- Migration: Refactor Telemetry to Units
-- Created at: 2026-03-25

-- 1. Rename column in audit_events (Conditional)
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'audit_events' and column_name = 'entity_id') then
    alter table audit_events rename column entity_id to unit_id;
  end if;
end;
$$;

-- 2. Update log_audit_event function (Parameter rename requires drop/create)
drop function if exists log_audit_event(text, text, uuid, numeric, text, text, uuid);
create or replace function log_audit_event(
  p_action text,
  p_entity text default null,
  p_unit_id uuid default null, -- Renamed from p_entity_id to match DataContext mapping
  p_amount numeric default null,
  p_details text default null,
  p_actor_label text default null,
  p_operator_activity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_actor_role app_role;
  v_event_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  v_org_id := get_my_org_id();
  v_actor_role := coalesce(get_my_org_role(v_org_id), get_my_role());

  if v_org_id is null then
    return null;
  end if;

  insert into audit_events (
    org_id,
    actor_user_id,
    actor_label,
    actor_role,
    action,
    entity,
    unit_id, -- Used the renamed column
    amount,
    details,
    operator_activity_id
  )
  values (
    v_org_id,
    auth.uid(),
    p_actor_label,
    v_actor_role,
    p_action,
    p_entity,
    p_unit_id,
    p_amount,
    p_details,
    p_operator_activity_id
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;
