-- Migration: Audit Resilience (Handle Invalid Activity IDs)
-- Created at: 2026-03-25

-- 1. Redefine log_audit_event with existence check for operator_activity_id
drop function if exists log_audit_event(text, text, uuid, numeric, text, text, uuid);

create or replace function log_audit_event(
  p_action text,
  p_entity text default null,
  p_unit_id uuid default null,
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
  v_validated_activity_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  v_org_id := get_my_org_id();
  v_actor_role := coalesce(get_my_org_role(v_org_id), get_my_role());

  if v_org_id is null then
    return null;
  end if;

  -- Validate operator_activity_id existence to prevent FK violations
  if p_operator_activity_id is not null then
    select id into v_validated_activity_id
    from operator_activities
    where id = p_operator_activity_id;
  end if;

  insert into audit_events (
    org_id,
    actor_user_id,
    actor_label,
    actor_role,
    action,
    entity,
    unit_id,
    amount,
    details,
    operator_activity_id
  )
  values (
    v_org_id,
    auth.uid(),
    nullif(trim(coalesce(p_actor_label, '')), ''),
    v_actor_role,
    p_action,
    p_entity,
    p_unit_id,
    p_amount,
    nullif(trim(coalesce(p_details, '')), ''),
    v_validated_activity_id -- Uses the validated ID (null if not found)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;
