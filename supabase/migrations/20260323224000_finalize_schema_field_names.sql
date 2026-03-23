-- ─────────────────────────────────────────────────────────────────────────────
-- Finalize canonical field names across associates, associate_allocations, units
-- Resolves mismatches between base schema legacy aliases and TypeScript types.
-- Idempotent: all blocks check existence before acting.
-- ─────────────────────────────────────────────────────────────────────────────

set search_path = public;

-- ── 1. associates.role: add 'associate' to allowed values ────────────────────
-- The base schema only allowed 'partner' | 'channel' | 'hybrid'.
-- The code now uses 'associate' as the canonical value for what was 'partner'.
do $$
begin
  alter table public.associates
    drop constraint if exists associates_role_check;
  alter table public.associates
    add constraint associates_role_check
      check (role in ('associate', 'partner', 'channel', 'hybrid'));
exception when others then null;
end $$;

-- Migrate existing 'partner' role values to 'associate'
update public.associates set role = 'associate' where role = 'partner';

-- Tighten the role constraint to canonical values once data is migrated.
do $$
begin
  alter table public.associates
    drop constraint if exists associates_role_check;
  alter table public.associates
    add constraint associates_role_check
      check (role in ('associate', 'channel', 'hybrid'));
exception when others then null;
end $$;

-- ── 2. associates: add total_number column (mirrors 'total') ─────────────────
-- Code writes to total_number. DB has 'total'. Add total_number and keep total
-- in sync via default until a future migration drops total.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'associates'
      and column_name  = 'total_number'
  ) then
    alter table public.associates
      add column total_number numeric(12, 2) not null default 0;
    -- Backfill from existing total
    update public.associates set total_number = total;
  end if;
end $$;

-- Keep the legacy alias column in sync for compatibility.
update public.associates
set total = total_number
where total is distinct from total_number;

-- ── 3. associates: add overhead_weight column (mirrors system_allocation_percent) ──
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'associates'
      and column_name  = 'overhead_weight'
  ) then
    alter table public.associates
      add column overhead_weight numeric(12, 2) not null default 0;
    update public.associates set overhead_weight = system_allocation_percent;
  end if;
end $$;

update public.associates
set system_allocation_percent = overhead_weight
where system_allocation_percent is distinct from overhead_weight;

-- ── 4. associate_allocations: add attributed_associate_id (canonical) ─────────
-- Coalesces from associate_id then partner_id to fill it.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'associate_allocations'
      and column_name  = 'attributed_associate_id'
  ) then
    alter table public.associate_allocations
      add column attributed_associate_id uuid references public.associates(id) on delete cascade;
    update public.associate_allocations
      set attributed_associate_id = coalesce(associate_id, partner_id)
      where attributed_associate_id is null;
  end if;
end $$;

update public.associate_allocations
set associate_id = attributed_associate_id,
    partner_id = attributed_associate_id
where attributed_associate_id is not null
  and (
    associate_id is distinct from attributed_associate_id
    or partner_id is distinct from attributed_associate_id
  );

-- ── 5b. associate_allocations: canonical type constraint uses alignment ─────
do $$
begin
  update public.associate_allocations
    set type = 'alignment'
    where type = 'closure';

  alter table public.associate_allocations
    drop constraint if exists associate_allocations_type_check;
  alter table public.associate_allocations
    add constraint associate_allocations_type_check
      check (type in ('input', 'alignment', 'output', 'adjustment'));
exception when others then null;
end $$;

-- ── 5. Index on the new canonical column ─────────────────────────────────────
create index if not exists idx_associate_allocations_attributed
  on public.associate_allocations(attributed_associate_id);

-- ── 6. Update adjust_associate_total to sync both total and total_number ─────
create or replace function public.adjust_associate_total(p_associate_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update associates
    set total        = total + p_amount,
        total_number = total_number + p_amount
    where id = p_associate_id;

  update associates
    set total = total_number
    where id = p_associate_id;
end;
$$;

revoke all on function public.adjust_associate_total(uuid, numeric) from public;
grant execute on function public.adjust_associate_total(uuid, numeric) to service_role;

-- ── 7. associate_record_allocation RPC: use attributed_associate_id ──────────
create or replace function public.associate_record_allocation(
  p_associate_id uuid,
  p_type         text,
  p_amount       numeric,
  p_date         timestamptz,
  p_org_id       uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_delta    numeric;
begin
  if not can_manage_org(p_org_id) then
    raise exception 'Permission denied';
  end if;

  insert into associate_allocations (org_id, attributed_associate_id, associate_id, partner_id, type, amount, date)
    values (p_org_id, p_associate_id, p_associate_id, p_associate_id, p_type, p_amount, coalesce(p_date, now()))
    returning id into v_entry_id;

  v_delta := case when p_type = 'input' then p_amount else -p_amount end;
  perform adjust_associate_total(p_associate_id, v_delta);

  return v_entry_id;
end;
$$;

revoke all on function public.associate_record_allocation(uuid, text, numeric, timestamptz, uuid) from public;
grant execute on function public.associate_record_allocation(uuid, text, numeric, timestamptz, uuid) to authenticated;
