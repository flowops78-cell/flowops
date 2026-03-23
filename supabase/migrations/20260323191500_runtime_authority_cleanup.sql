-- Phase 5: remove remaining runtime authority reads from legacy tables in
-- live SQL RPCs. These functions should resolve scope through the Phase 4
-- membership-aware helpers rather than reading profiles/user_roles directly.

set search_path = public, extensions;

create or replace function log_audit_event(
  p_action text,
  p_entity text default null,
  p_entity_id uuid default null,
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
    entity_id,
    operator_activity_id,
    amount,
    details
  ) values (
    v_org_id,
    auth.uid(),
    nullif(trim(coalesce(p_actor_label, '')), ''),
    coalesce(v_actor_role, 'viewer'::app_role),
    p_action,
    p_entity,
    p_entity_id,
    p_operator_activity_id,
    p_amount,
    nullif(trim(coalesce(p_details, '')), '')
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function channel_base_transfer(
  p_from_method text,
  p_to_method text,
  p_amount numeric,
  p_date timestamptz,
  p_transfer_id uuid default uuid_generate_v4()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_from_method text;
  v_to_method text;
  v_amount numeric;
  v_transfer_id uuid;
  v_source_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_org_id := get_my_org_id();
  if v_org_id is null then
    raise exception 'No organization found for current user';
  end if;

  if not can_administer_org(v_org_id) then
    raise exception 'Only admin can transfer channel values.';
  end if;

  v_from_method := nullif(trim(p_from_method), '');
  v_to_method := nullif(trim(p_to_method), '');
  v_transfer_id := coalesce(p_transfer_id, uuid_generate_v4());
  v_amount := round(p_amount::numeric, 2);

  if v_from_method is null then
    raise exception 'Source method is required';
  end if;
  if v_to_method is null then
    raise exception 'Destination method is required';
  end if;
  if v_from_method = v_to_method then
    raise exception 'Source and destination method must be different.';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Transfer amount must be greater than zero.';
  end if;

  select coalesce(sum(
    case
      when type = 'increment' then amount
      when type = 'decrement' then -amount
      else 0
    end
  ), 0)
    into v_source_total
  from channel_entries
  where org_id = v_org_id
    and method = v_from_method;

  if v_source_total < v_amount then
    raise exception 'Insufficient source total for transfer.';
  end if;

  insert into channel_entries (
    org_id,
    type,
    amount,
    method,
    operation_type,
    transfer_id,
    counterparty_method,
    date
  ) values (
    v_org_id,
    'decrement',
    v_amount,
    v_from_method,
    'transfer',
    v_transfer_id,
    v_to_method,
    p_date
  );

  insert into channel_entries (
    org_id,
    type,
    amount,
    method,
    operation_type,
    transfer_id,
    counterparty_method,
    date
  ) values (
    v_org_id,
    'increment',
    v_amount,
    v_to_method,
    'transfer',
    v_transfer_id,
    v_from_method,
    p_date
  );

  return v_transfer_id;
end;
$$;