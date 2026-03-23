set search_path = public;

do $$
begin
  if to_regclass('public.partners') is not null and to_regclass('public.associates') is null then
    alter table public.partners rename to associates;
  end if;
end $$;

do $$
begin
  if to_regclass('public.partner_entries') is not null and to_regclass('public.associate_allocations') is null then
    alter table public.partner_entries rename to associate_allocations;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'units'
      and column_name = 'referred_by_partner_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'units'
      and column_name = 'attributed_associate_id'
  ) then
    alter table public.units rename column referred_by_partner_id to attributed_associate_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'members'
      and column_name = 'service_rate'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'members'
      and column_name = 'overhead_weight'
  ) then
    alter table public.members rename column service_rate to overhead_weight;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'associates'
      and column_name = 'partner_arrangement_rate'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'associates'
      and column_name = 'allocation_factor'
  ) then
    alter table public.associates rename column partner_arrangement_rate to allocation_factor;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'associate_allocations'
      and column_name = 'partner_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'associate_allocations'
      and column_name = 'associate_id'
  ) then
    alter table public.associate_allocations rename column partner_id to associate_id;
  end if;
end $$;

alter index if exists public.idx_partners_org_id rename to idx_associates_org_id;
alter index if exists public.idx_partner_entries_org_id rename to idx_associate_allocations_org_id;

drop policy if exists "partners_read" on public.associates;
drop policy if exists "partners_write" on public.associates;
drop policy if exists "partner_entries_read" on public.associate_allocations;
drop policy if exists "partner_entries_write" on public.associate_allocations;

drop policy if exists "associates_read" on public.associates;
create policy "associates_read" on public.associates
  for select
  using (can_access_org(org_id));

drop policy if exists "associates_write" on public.associates;
create policy "associates_write" on public.associates
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "associate_allocations_read" on public.associate_allocations;
create policy "associate_allocations_read" on public.associate_allocations
  for select
  using (can_access_org(org_id));

drop policy if exists "associate_allocations_write" on public.associate_allocations;
create policy "associate_allocations_write" on public.associate_allocations
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

create or replace function public.adjust_associate_total(p_associate_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'associates'
      and column_name = 'total_number'
  ) then
    execute 'update public.associates set total = total + $1, total_number = total_number + $1 where id = $2'
      using p_amount, p_associate_id;
  else
    execute 'update public.associates set total = total + $1 where id = $2'
      using p_amount, p_associate_id;
  end if;
end;
$$;

revoke all on function public.adjust_associate_total(uuid, numeric) from public;
grant execute on function public.adjust_associate_total(uuid, numeric) to service_role;

drop function if exists public.adjust_partner_total(uuid, numeric);
