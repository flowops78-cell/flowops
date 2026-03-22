-- Flow Ops Schema Migration
-- Authoritative Supabase migration for local setup and disposable environments.
-- CAUTION: Destroys existing data. Run only on a fresh or disposable Supabase instance.
-- This file already includes auth hardening, invite flow, and meta-org clustering.
-- Do not chain additional repository SQL files after this one.

-- ─────────────────────────────────────────────────────────────────────────────
-- DESTROY EXISTING SCHEMA
-- ─────────────────────────────────────────────────────────────────────────────
drop view if exists partners cascade;

drop table if exists access_requests cascade;
drop table if exists audit_events cascade;
drop table if exists adjustment_requests cascade;
drop table if exists adjustments cascade;
drop table if exists output_requests cascade;
drop table if exists unit_account_entries cascade;
drop table if exists partner_entries cascade;
drop table if exists partners cascade;
drop table if exists allocations cascade;
drop table if exists transfer_accounts cascade;
drop table if exists expenses cascade;
drop table if exists reserve_entries cascade;
drop table if exists activity_logs cascade;
drop table if exists entries cascade;
drop table if exists members cascade;
drop table if exists units cascade;
drop table if exists workspaces cascade;
drop table if exists profiles cascade;
drop table if exists org_meta_mapping cascade;
drop table if exists user_roles cascade;
drop table if exists operator_activities cascade;
drop table if exists access_invites cascade;

-- keep legacy drops for backwards compatibility with very old dev instances
drop table if exists logs cascade;
drop table if exists members cascade;

drop function if exists get_my_role() cascade;
drop function if exists reserve_base_transfer(text, text, numeric, timestamptz, text, uuid) cascade;
drop type if exists app_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLE ENUM & USER ROLES
-- ─────────────────────────────────────────────────────────────────────────────
create type app_role as enum ('admin', 'operator', 'viewer');

create table if not exists user_roles (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        app_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  constraint uq_user_roles_user_id unique (user_id)
);

create table if not exists org_meta_mapping (
  org_id      uuid primary key,
  meta_org_id uuid not null,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILES (org scoping foundation)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  org_id              uuid,
  meta_org_id         uuid,
  current_session_id  uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- WORKSPACES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists workspaces (
  id                   uuid primary key default uuid_generate_v4(),
  org_id               uuid not null,
  name                 text,
  channel             text,
  org_code             text,
  activity_category        text not null default 'standard',
  workspace_mode       text not null default 'cash',
  status               text not null default 'active' check (status in ('active', 'completed', 'archived')),
  assigned_operator_id uuid references auth.users(id) on delete set null,
  location             text,
  start_time           timestamptz,
  end_time             timestamptz,
  system_contribution numeric(12, 2),
  reserve_value    numeric(12, 2),
  activity_frequency    numeric(10, 2),
  date                 timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- UNITS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists units (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null,
  name                    text not null,
  tags                    text[],
  referred_by_partner_id uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ENTRIES (input/output transactions per unit in workspace)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists entries (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null,
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  unit_id         uuid references units(id) on delete set null,
  unit_name       text,
  input_amount      numeric(12, 2) not null default 0,
  output_amount     numeric(12, 2) not null default 0,
  total_input       numeric(12, 2) not null default 0,
  joined_at         timestamptz,
  left_at           timestamptz,
  position_id       integer,
  activity_units    integer,
  sort_order        integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- MEMBERS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists members (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null,
  user_id     uuid references auth.users(id) on delete set null,
  member_id   text, -- custom human-readable ID
  name        text not null,
  role        app_role not null default 'viewer',

  incentive_type text not null default 'hourly' check (incentive_type in ('hourly', 'monthly', 'none')),
  service_rate numeric(12, 2),
  retainer_rate numeric(12, 2),
  status      text not null default 'active' check (status in ('active', 'completed', 'archived')),
  tags        text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(org_id, member_id) -- custom IDs must be unique within an org
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ACTIVITY_LOGS (session records)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists activity_logs (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null,
  member_id       uuid references members(id) on delete set null,
  workspace_id    uuid references workspaces(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,
  start_time      timestamptz not null default now(),
  end_time        timestamptz,
  duration_hours  numeric(10, 2),
  status          text not null default 'active' check (status in ('active', 'completed', 'archived')),
  date            timestamptz not null default now(),
  total_value     numeric(12, 2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RESERVE ENTRIES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists reserve_entries (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null,
  type        text not null check (type in ('increment', 'adjustment', 'decrement')),
  amount      numeric(12, 2) not null,
  method      text not null,
  operation_type text not null default 'manual' check (operation_type in ('manual', 'transfer')),
  transfer_id uuid,
  counterparty_method text,
  date        timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTNERS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists partners (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null,
  name        text not null,
  role        text not null default 'channel' check (role in ('partner', 'channel', 'hybrid')),
  contact_method text not null default 'none' check (contact_method in ('none', 'internal', 'email', 'telegram', 'signal', 'whatsapp')),
  contact_value text,
  total       numeric(12, 2) not null default 0,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTNER ENTRIES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists partner_entries (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null,
  partner_id  uuid references partners(id) on delete cascade,
  amount        numeric(12, 2) not null,
  type          text not null check (type in ('input', 'alignment', 'output', 'adjustment')),
  date          timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- DEFERRED UNIT RECORDS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists allocations (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null,
  unit_id     uuid not null references units(id) on delete cascade,
  amount      numeric(12, 2) not null,
  type        text not null check (type in ('allocation', 'return')),
  date        timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LIVE DEFERRED ADJUSTMENTS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists adjustments (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null,
  unit_id     uuid not null references units(id) on delete cascade,
  amount      numeric(12, 2) not null,
  type        text not null check (type in ('input', 'output')),
  date        timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- UNIT ACCOUNT ENTRIES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists unit_account_entries (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null,
  unit_id     uuid not null references units(id) on delete cascade,
  type        text not null check (type in ('increment', 'adjustment', 'decrement')),
  amount      numeric(12, 2) not null,
  date        timestamptz not null default now(),
  request_id  uuid,
  source_method text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- DEFERRED ENTRY APPROVAL QUEUE
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists adjustment_requests (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null,
  unit_id       uuid not null references units(id) on delete cascade,
  amount        numeric(12, 2) not null,
  type          text not null check (type in ('input', 'output')),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- APPROVED OUTPUT QUEUE
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists output_requests (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null,
  unit_id       uuid not null references units(id) on delete cascade,
  amount        numeric(12, 2) not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id), -- Changed from text check to uuid ref
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SESSION MANAGEMENT (presence tracking)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists operator_activities (
  id                uuid primary key default uuid_generate_v4(),
  org_id            uuid not null,
  actor_user_id     uuid not null references auth.users(id) on delete cascade,
  actor_role        app_role not null default 'viewer',
  actor_label       text,
  started_at        timestamptz not null default now(),
  last_active_at      timestamptz not null default now(),
  ended_at          timestamptz,
  duration_seconds  integer,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);



-- ─────────────────────────────────────────────────────────────────────────────
-- EXPENSES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists expenses (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null,
  workspace_id  uuid references workspaces(id) on delete set null,
  amount        numeric(12, 2) not null,
  category      text,
  date          timestamptz not null default now(),
  status        text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRANSFER ACCOUNTS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists transfer_accounts (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null,
  name        text not null,
  category    text not null,
  is_active   boolean not null default true,
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT EVENTS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists audit_events (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null,
  created_at    timestamptz not null default now(),
  actor_user_id uuid,
  actor_label   text,
  actor_role    app_role,
  action        text not null,
  entity        text,
  entity_id     uuid,
  operator_activity_id uuid references operator_activities(id) on delete set null,
  amount        numeric(12, 2),
  details       text check (details is null or char_length(details) <= 120)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCESS REQUESTS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists access_requests (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null,
  login_id           text not null,
  requested_role     app_role not null default 'viewer',
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by        uuid references auth.users(id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists access_invites (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null,
  token_hash         text not null unique,
  label              text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz,
  revoked_at         timestamptz,
  last_used_at       timestamptz,
  use_count          integer not null default 0,
  max_uses           integer not null default 1 check (max_uses > 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ENABLE ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table user_roles enable row level security;
alter table profiles enable row level security;
alter table access_requests enable row level security;
alter table access_invites enable row level security;
alter table workspaces enable row level security;
alter table units enable row level security;
alter table entries enable row level security;
alter table activity_logs enable row level security;
alter table allocations enable row level security;
alter table adjustments enable row level security;
alter table reserve_entries enable row level security;
alter table partners enable row level security;
alter table partner_entries enable row level security;
alter table unit_account_entries enable row level security;
alter table adjustment_requests enable row level security;
alter table output_requests enable row level security;
alter table operator_activities enable row level security;
alter table members enable row level security;
alter table expenses enable row level security;
alter table transfer_accounts enable row level security;
alter table audit_events enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_my_role()
returns app_role
language sql stable security definer
set search_path = public
as $$
  select role from user_roles where user_id = auth.uid() limit 1;
$$;

create or replace function get_my_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from profiles where id = auth.uid() limit 1;
$$;

create or replace function get_my_meta_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select meta_org_id from profiles where id = auth.uid() limit 1;
$$;

create or replace function is_org_in_my_cluster(p_org_id uuid)
returns boolean
language plpgsql stable security definer
as $$
declare
  v_meta_id uuid;
  v_role app_role;
begin
  select meta_org_id, role into v_meta_id, v_role
  from profiles
  join user_roles on profiles.id = user_roles.user_id
  where profiles.id = auth.uid();

  -- Global Admins (null meta_id) see everything
  if v_role = 'admin' and v_meta_id is null then
    return true;
  end if;

  -- Use mapping table for cluster check
  return exists (
    select 1 from org_meta_mapping
    where org_id = p_org_id and meta_org_id = v_meta_id
  );
end;
$$;

-- Atomic Unit Total Adjustments
create or replace function adjust_unit_balance(p_unit_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update units set total = total + p_amount where id = p_unit_id;
end;
$$;

create or replace function adjust_partner_total(p_partner_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update partners set total = total + p_amount where id = p_partner_id;
end;
$$;

-- Secure Audit Event Insertion via RPC
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
security definer -- Bypass RLS for log creation
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

  select org_id into v_org_id from profiles where id = auth.uid();
  select role into v_actor_role from user_roles where user_id = auth.uid();
  
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
    v_actor_role,
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

create or replace function reserve_base_transfer(
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
    raise exception 'Only admin can transfer reserve values.';
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

  select coalesce(sum(case when type = 'inflow' then amount else -amount end), 0)
    into v_source_total
  from reserve_entries
  where org_id = v_org_id
    and method = v_from_method;

  if v_source_total < v_amount then
    raise exception 'Insufficient source total for transfer.';
  end if;

  insert into reserve_entries (
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

  insert into reserve_entries (
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

revoke all on function adjust_unit_balance(uuid, numeric) from public;
revoke all on function adjust_partner_total(uuid, numeric) from public;
revoke all on function log_audit_event(text, text, uuid, numeric, text, text, uuid) from public;
revoke all on function reserve_base_transfer(text, text, numeric, timestamptz, uuid) from public;

grant execute on function adjust_unit_balance(uuid, numeric) to service_role;
grant execute on function adjust_partner_total(uuid, numeric) to service_role;
grant execute on function log_audit_event(text, text, uuid, numeric, text, text, uuid) to authenticated;
grant execute on function log_audit_event(text, text, uuid, numeric, text, text, uuid) to service_role;
grant execute on function reserve_base_transfer(text, text, numeric, timestamptz, uuid) to authenticated;
grant execute on function reserve_base_transfer(text, text, numeric, timestamptz, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES (simplified & working)
-- ─────────────────────────────────────────────────────────────────────────────

-- user_roles: users can read own role, admins see all
create policy "user_roles_read" on user_roles
  for select
  using (user_id = auth.uid());

-- Keep client writes disabled to avoid recursive RLS on user_roles.
-- Role writes should be done by service-role paths (edge functions / SQL editor).
create policy "user_roles_write_insert" on user_roles
  for insert
  with check (false);

create policy "user_roles_write_update" on user_roles
  for update
  using (false)
  with check (false);

create policy "user_roles_write_delete" on user_roles
  for delete
  using (false);

-- profiles: users read their own profile; admins can read cluster profiles.
create policy "profiles_read" on profiles
  for select
  using (
    id = auth.uid() 
    or (
      get_my_role() = 'admin' 
      and (get_my_meta_org_id() is null or meta_org_id = get_my_meta_org_id())
    )
  );

-- workspaces: admins see cluster; viewers are read-only within org; operators are limited to assigned active rows plus finished rows.
create policy "workspaces_read" on workspaces
  for select
  using (
    (get_my_role() = 'admin' and is_org_in_my_cluster(org_id))
    or (
      auth.uid() is not null
      and org_id = get_my_org_id()
      and (
        get_my_role() = 'viewer'
        or (
          get_my_role() = 'operator'
          and (
            status in ('completed', 'archived')
            or (status = 'active' and assigned_operator_id = auth.uid())
          )
        )
      )
    )
  );

create policy "workspaces_write" on workspaces
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- units: readable within org; writable by admins and operators only.
create policy "units_read" on units
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (auth.uid() is not null and org_id = get_my_org_id()));

create policy "units_write" on units
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- entries: readable within org; writable by admins and operators only.
create policy "entries_read" on entries
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "entries_write" on entries
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- activity_logs: readable within org; writable by admins and operators only.
create policy "activity_logs_read" on activity_logs
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "activity_logs_write" on activity_logs
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- reserve_entries: org users can read; only admins and operators can write.
create policy "reserve_entries_read" on reserve_entries
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "reserve_entries_write" on reserve_entries
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- partners + partner_entries: readable within org; writable by admins and operators only.
create policy "partners_read" on partners
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "partners_write" on partners
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

create policy "partner_entries_read" on partner_entries
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "partner_entries_write" on partner_entries
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- Deferred unit records: readable within org; writable by admins and operators only.
create policy "allocations_read" on allocations
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "allocations_write" on allocations
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- Live deferred adjustments: readable within org; writable by admins and operators only.
create policy "adjustments_read" on adjustments
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "adjustments_write" on adjustments
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- unit_account_entries: viewers are read-only; operators cannot directly post decrement rows.
create policy "unit_account_entries_read" on unit_account_entries
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "unit_account_entries_write" on unit_account_entries
  for all
  using (
    (get_my_role() = 'admin' and is_org_in_my_cluster(org_id))
    or (get_my_role() = 'operator' and org_id = get_my_org_id() and type <> 'decrement')
  )
  with check (
    (get_my_role() = 'admin' and is_org_in_my_cluster(org_id))
    or (get_my_role() = 'operator' and org_id = get_my_org_id() and type <> 'decrement')
  );

-- Deferred entry request queue: admins can resolve; operators can create pending requests.
create policy "adjustment_requests_read" on adjustment_requests
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "adjustment_requests_insert" on adjustment_requests
  for insert
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id() and status = 'pending'));

create policy "adjustment_requests_update" on adjustment_requests
  for update
  using (get_my_role() = 'admin' and is_org_in_my_cluster(org_id))
  with check (get_my_role() = 'admin' and is_org_in_my_cluster(org_id));

-- Approved output queue: admins can resolve; operators can create pending requests.
create policy "output_requests_read" on output_requests
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "output_requests_insert" on output_requests
  for insert
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id() and status = 'pending'));

create policy "output_requests_update" on output_requests
  for update
  using (get_my_role() = 'admin' and is_org_in_my_cluster(org_id))
  with check (get_my_role() = 'admin' and is_org_in_my_cluster(org_id));

-- operator_activities: users see their own activity; operators see org activity; admins see cluster activity.
create policy "operator_activities_read" on operator_activities
  for select
  using (
    (get_my_role() = 'admin' and is_org_in_my_cluster(org_id))
    or actor_user_id = auth.uid() 
    or (get_my_role() = 'operator' and org_id = get_my_org_id())
  );

create policy "operator_activities_write" on operator_activities
  for all
  using (actor_user_id = auth.uid() and get_my_role() in ('admin', 'operator') and org_id = get_my_org_id())
  with check (actor_user_id = auth.uid() and get_my_role() in ('admin', 'operator') and org_id = get_my_org_id());

-- members: org-scoped. regional admins see cluster.
create policy "members_read" on members
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "members_write" on members
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- expenses: platform admins see all. regional admins see cluster.
create policy "expenses_read" on expenses
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "expenses_write" on expenses
  for all
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- transfer_accounts: platform admins see all. regional admins see cluster.
create policy "transfer_accounts_read" on transfer_accounts
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

create policy "transfer_accounts_write" on transfer_accounts
  for all
  using (get_my_role() = 'admin' and is_org_in_my_cluster(org_id))
  with check (get_my_role() = 'admin' and is_org_in_my_cluster(org_id));

-- audit_events: platform admins see all. regional admins see cluster.
create policy "audit_events_read" on audit_events
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or org_id = get_my_org_id());

-- access_requests: request creation is edge-function only. regional admins see cluster.
create policy "access_requests_read" on access_requests
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

create policy "access_requests_update" on access_requests
  for update
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- access_invites: regional admins see cluster.
create policy "access_invites_read" on access_invites
  for select
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

create policy "access_invites_insert" on access_invites
  for insert
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

create policy "access_invites_update" on access_invites
  for update
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()))
  with check ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

create policy "access_invites_delete" on access_invites
  for delete
  using ((get_my_role() = 'admin' and is_org_in_my_cluster(org_id)) or (get_my_role() = 'operator' and org_id = get_my_org_id()));

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
create index idx_profiles_org_id on profiles(org_id);
create index idx_workspaces_org_id on workspaces(org_id);
create index idx_units_org_id on units(org_id);
create index idx_entries_org_id on entries(org_id);
create index idx_entries_workspace_id on entries(workspace_id);
create index idx_activity_logs_org_id on activity_logs(org_id);
create index idx_activity_logs_workspace_id on activity_logs(workspace_id);
create index idx_allocations_org_id on allocations(org_id);
create index idx_adjustments_org_id on adjustments(org_id);
create index idx_reserve_entries_org_id on reserve_entries(org_id);
create index idx_partners_org_id on partners(org_id);
create index idx_partner_entries_org_id on partner_entries(org_id);
create index idx_unit_account_entries_org_id on unit_account_entries(org_id);
create index idx_adjustment_requests_org_id on adjustment_requests(org_id);
create index idx_adjustment_requests_unit_id on adjustment_requests(unit_id);
create index idx_output_requests_org_id on output_requests(org_id);
create index idx_output_requests_unit_id on output_requests(unit_id);
create index idx_operator_activities_org_id on operator_activities(org_id);
create index idx_operator_activities_actor_user_id on operator_activities(actor_user_id);
create index idx_members_org_id on members(org_id);
create unique index idx_members_org_user_unique on members(org_id, user_id);
create index idx_expenses_org_id on expenses(org_id);
create index idx_transfer_accounts_org_id on transfer_accounts(org_id);
create index idx_audit_events_org_id on audit_events(org_id);
create index idx_access_requests_org_id on access_requests(org_id);
create index idx_access_invites_org_id on access_invites(org_id);
create index idx_access_invites_active_lookup on access_invites(token_hash, revoked_at, expires_at);
create index idx_workspaces_status on workspaces(status);
