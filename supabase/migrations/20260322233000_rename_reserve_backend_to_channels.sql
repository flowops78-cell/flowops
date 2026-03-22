-- Rename reserve-backed schema objects to channel-backed names for existing deployments.

alter table if exists public.reserve_entries rename to channel_entries;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspaces'
      and column_name = 'reserve_value'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspaces'
      and column_name = 'channel_value'
  ) then
    alter table public.workspaces rename column reserve_value to channel_value;
  end if;
end;
$$;

alter index if exists idx_reserve_entries_org_id rename to idx_channel_entries_org_id;

drop policy if exists "reserve_entries_read" on public.channel_entries;
drop policy if exists "reserve_entries_write" on public.channel_entries;
drop policy if exists "channel_entries_read" on public.channel_entries;
drop policy if exists "channel_entries_write" on public.channel_entries;

create policy "channel_entries_read" on public.channel_entries
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "channel_entries_write" on public.channel_entries
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

drop function if exists public.channel_base_transfer(text, text, numeric, timestamptz, uuid);
drop function if exists public.reserve_base_transfer(text, text, numeric, timestamptz, uuid);
drop function if exists public.reserve_base_transfer(text, text, numeric, timestamptz, text, uuid);

create or replace function public.channel_base_transfer(
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

  if get_my_role() <> 'admin' then
    raise exception 'Only admin can transfer channel values.';
  end if;

  select org_id into v_org_id from profiles where id = auth.uid();
  if v_org_id is null then
    raise exception 'No organization found for current user';
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
  from public.channel_entries
  where org_id = v_org_id
    and method = v_from_method;

  if v_source_total < v_amount then
    raise exception 'Insufficient source total for transfer.';
  end if;

  insert into public.channel_entries (
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

  insert into public.channel_entries (
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

revoke all on function public.channel_base_transfer(text, text, numeric, timestamptz, uuid) from public;
grant execute on function public.channel_base_transfer(text, text, numeric, timestamptz, uuid) to authenticated;
grant execute on function public.channel_base_transfer(text, text, numeric, timestamptz, uuid) to service_role;