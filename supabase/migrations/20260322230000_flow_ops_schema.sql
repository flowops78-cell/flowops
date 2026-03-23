-- Flow Ops Schema Migration
-- Authoritative Supabase migration for local setup and disposable environments.
-- CAUTION: Destroys existing data. Run only on a fresh or disposable Supabase instance.
-- This file already includes auth hardening, invite flow, and meta-org clustering.
-- Do not chain additional repository SQL files after this one.

-- ─────────────────────────────────────────────────────────────────────────────
-- DESTROY EXISTING SCHEMA
-- ─────────────────────────────────────────────────────────────────────────────
drop view if exists associates cascade;
drop view if exists partners cascade;

drop table if exists access_requests cascade;
drop table if exists audit_events cascade;
drop table if exists adjustment_requests cascade;
drop table if exists adjustments cascade;
drop table if exists output_requests cascade;
drop table if exists unit_account_entries cascade;
drop table if exists associate_allocations cascade;
drop table if exists partner_entries cascade;
drop table if exists associates cascade;
drop table if exists partners cascade;
drop table if exists allocations cascade;
drop table if exists transfer_accounts cascade;
drop table if exists expenses cascade;
drop table if exists channel_entries cascade;
drop table if exists activity_logs cascade;
drop table if exists entries cascade;
drop table if exists members cascade;
drop table if exists units cascade;
drop table if exists workspaces cascade;
drop table if exists profiles cascade;
drop table if exists org_meta_mapping cascade;
drop table if exists org_memberships cascade;
drop table if exists orgs cascade;
drop table if exists org_clusters cascade;
drop table if exists platform_roles cascade;
drop table if exists user_roles cascade;
drop table if exists operator_activities cascade;
drop table if exists access_invites cascade;

drop function if exists get_my_role() cascade;
drop function if exists channel_base_transfer(text, text, numeric, timestamptz, uuid) cascade;
drop type if exists app_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLE ENUM & PLATFORM IDENTITY
-- ─────────────────────────────────────────────────────────────────────────────
create type app_role as enum ('admin', 'operator', 'viewer');

create table if not exists platform_roles (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'platform_admin',
  created_at   timestamptz not null default now(),
  constraint uq_platform_roles_user_id unique (user_id)
);

create table if not exists user_roles (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        app_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  constraint uq_user_roles_user_id unique (user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ORGANIZATIONAL GRAPH
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists org_clusters (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists orgs (
  id           uuid primary key default uuid_generate_v4(),
  cluster_id   uuid references org_clusters(id) on delete set null,
  name         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists org_meta_mapping (
  org_id      uuid primary key references orgs(id) on delete cascade,
  meta_org_id uuid not null references org_clusters(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists org_memberships (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  org_id          uuid not null references orgs(id) on delete cascade,
  role            app_role not null default 'viewer',
  status          text not null default 'active' check (status in ('active', 'invited', 'disabled', 'revoked')),
  is_default_org  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_org_memberships_user_org unique (user_id, org_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILES (personal context)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  org_id              uuid references orgs(id) on delete set null,
  meta_org_id         uuid references org_clusters(id) on delete set null,
  current_session_id  uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- OPERATIONAL WORKSPACES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists workspaces (
  id                   uuid primary key default uuid_generate_v4(),
  org_id               uuid not null references orgs(id) on delete cascade,
  name                 text,
  channel              text,
  org_code             text,
  activity_category    text not null default 'standard',
  workspace_mode       text not null default 'cash',
  status               text not null default 'active' check (status in ('active', 'completed', 'archived')),
  assigned_operator_id uuid references auth.users(id) on delete set null,
  location             text,
  start_time           timestamptz,
  end_time             timestamptz,
  system_contribution  numeric(12, 2),
  channel_value        numeric(12, 2),
  activity_frequency   numeric(10, 2),
  date                 timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- UNITS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists units (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name                    text not null,
  tags                    text[],
  attributed_associate_id uuid, -- reworded from referred_by_partner_id
  referred_by_partner_id  uuid, -- legacy alias for backward compatibility
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ENTRIES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists entries (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references orgs(id) on delete cascade,
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
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  member_id   text,
  name        text not null,
  role        app_role not null default 'viewer',
  incentive_type text not null default 'hourly' check (incentive_type in ('hourly', 'monthly', 'none')),
  overhead_weight numeric(12, 2), -- reworded from service_rate
  service_rate    numeric(12, 2), -- legacy alias
  retainer_rate   numeric(12, 2),
  status      text not null default 'active' check (status in ('active', 'completed', 'archived')),
  tags        text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(org_id, member_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ACTIVITY_LOGS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists activity_logs (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references orgs(id) on delete cascade,
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
-- CHANNEL ENTRIES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists channel_entries (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id) on delete cascade,
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
-- ASSOCIATES (formerly Partners)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists associates (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  role        text not null default 'channel' check (role in ('associate', 'partner', 'channel', 'hybrid')),
  contact_method text not null default 'none' check (contact_method in ('none', 'internal', 'email', 'telegram', 'signal', 'whatsapp')),
  contact_value  text,
  allocation_factor numeric(12, 2) not null default 0,
  partner_arrangement_rate numeric(12, 2) not null default 0, -- legacy alias
  overhead_weight numeric(12, 2) not null default 0,
  system_allocation_percent numeric(12, 2) not null default 0, -- legacy alias
  total_number numeric(12, 2) not null default 0,
  total       numeric(12, 2) not null default 0, -- legacy alias
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ASSOCIATE ALLOCATIONS (formerly Partner Entries)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists associate_allocations (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references orgs(id) on delete cascade,
  attributed_associate_id uuid references associates(id) on delete cascade,
  associate_id  uuid references associates(id) on delete cascade, -- legacy alias
  partner_id    uuid references associates(id) on delete cascade, -- legacy alias
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
-- RLS ENABLEMENT
-- ─────────────────────────────────────────────────────────────────────────────
alter table platform_roles enable row level security;
alter table org_clusters enable row level security;
alter table orgs enable row level security;
alter table org_meta_mapping enable row level security;
alter table org_memberships enable row level security;

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
alter table channel_entries enable row level security;
alter table associates enable row level security;
alter table associate_allocations enable row level security;
alter table unit_account_entries enable row level security;
alter table adjustment_requests enable row level security;
alter table output_requests enable row level security;
alter table operator_activities enable row level security;
alter table members enable row level security;
alter table expenses enable row level security;
alter table transfer_accounts enable row level security;
alter table audit_events enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS & RPCS
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function get_my_platform_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role
  from platform_roles
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function get_my_role()
returns app_role
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (
      select membership.role
      from org_memberships as membership
      where membership.user_id = auth.uid()
        and membership.status in ('active', 'invited')
      order by
        case membership.role
          when 'admin' then 0
          when 'operator' then 1
          else 2
        end,
        membership.is_default_org desc,
        membership.created_at asc,
        membership.org_id asc
      limit 1
    ),
    (
      select user_role.role
      from user_roles as user_role
      where user_role.user_id = auth.uid()
      limit 1
    )
  );
$$;

create or replace function get_my_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (
      select membership.org_id
      from org_memberships as membership
      where membership.user_id = auth.uid()
        and membership.status in ('active', 'invited')
      order by membership.is_default_org desc, membership.created_at asc, membership.org_id asc
      limit 1
    ),
    (
      select profile.org_id
      from profiles as profile
      where profile.id = auth.uid()
      limit 1
    )
  );
$$;

create or replace function get_my_meta_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (
      select org.cluster_id
      from org_memberships as membership
      join orgs as org on org.id = membership.org_id
      where membership.user_id = auth.uid()
        and membership.status in ('active', 'invited')
      order by membership.is_default_org desc, membership.created_at asc, membership.org_id asc
      limit 1
    ),
    (
      select profile.meta_org_id
      from profiles as profile
      where profile.id = auth.uid()
      limit 1
    )
  );
$$;

create or replace function get_my_org_role(p_org_id uuid)
returns app_role
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (
      select membership.role
      from org_memberships as membership
      where membership.user_id = auth.uid()
        and membership.org_id = p_org_id
        and membership.status in ('active', 'invited')
      order by
        case membership.role
          when 'admin' then 0
          when 'operator' then 1
          else 2
        end,
        membership.is_default_org desc,
        membership.created_at asc
      limit 1
    ),
    (
      select user_role.role
      from user_roles as user_role
      where user_role.user_id = auth.uid()
        and p_org_id = get_my_org_id()
      limit 1
    )
  );
$$;

create or replace function has_org_membership(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from org_memberships as membership
    where membership.user_id = auth.uid()
      and membership.org_id = p_org_id
      and membership.status in ('active', 'invited')
  );
$$;

create or replace function is_org_in_my_cluster(p_org_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_profile_meta_id uuid;
  v_profile_role app_role;
begin
  if auth.uid() is null then
    return false;
  end if;

  if get_my_platform_role() = 'platform_admin' then
    return true;
  end if;

  if exists (
    select 1
    from org_memberships as membership
    where membership.user_id = auth.uid()
      and membership.org_id = p_org_id
      and membership.status in ('active', 'invited')
      and membership.role = 'admin'
  ) then
    return true;
  end if;

  if exists (
    select 1
    from org_memberships as membership
    join orgs as actor_org on actor_org.id = membership.org_id
    join orgs as target_org on target_org.id = p_org_id
    where membership.user_id = auth.uid()
      and membership.status in ('active', 'invited')
      and membership.role = 'admin'
      and actor_org.cluster_id = target_org.cluster_id
  ) then
    return true;
  end if;

  select profile.meta_org_id, user_role.role
    into v_profile_meta_id, v_profile_role
  from profiles as profile
  left join user_roles as user_role on user_role.user_id = profile.id
  where profile.id = auth.uid()
  limit 1;

  if v_profile_role = 'admin' and v_profile_meta_id is null then
    return true;
  end if;

  return exists (
    select 1
    from org_meta_mapping as mapping
    where mapping.org_id = p_org_id
      and mapping.meta_org_id = v_profile_meta_id
  );
end;
$$;

create or replace function can_access_org(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select is_org_in_my_cluster(p_org_id) or has_org_membership(p_org_id);
$$;

create or replace function can_manage_org(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select is_org_in_my_cluster(p_org_id) or get_my_org_role(p_org_id) = 'operator';
$$;

create or replace function can_administer_org(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select is_org_in_my_cluster(p_org_id) or get_my_org_role(p_org_id) = 'admin';
$$;

create or replace function adjust_unit_balance(p_unit_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update units
    set total = coalesce(total, 0) + p_amount
    where id = p_unit_id;
end;
$$;

create or replace function adjust_associate_total(p_associate_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update associates
    set total = total + p_amount,
        total_number = total_number + p_amount
    where id = p_associate_id;
end;
$$;

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

create or replace function associate_record_allocation(
  p_associate_id uuid,
  p_type text,
  p_amount numeric,
  p_date timestamptz,
  p_org_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_delta numeric;
begin
  if not can_manage_org(p_org_id) then
    raise exception 'Permission denied';
  end if;

  insert into associate_allocations (
    org_id,
    attributed_associate_id,
    associate_id,
    partner_id,
    type,
    amount,
    date
  ) values (
    p_org_id,
    p_associate_id,
    p_associate_id,
    p_associate_id,
    p_type,
    p_amount,
    coalesce(p_date, now())
  ) returning id into v_entry_id;

  v_delta := case when p_type = 'input' then p_amount else -p_amount end;
  perform adjust_associate_total(p_associate_id, v_delta);

  return v_entry_id;
end;
$$;

revoke all on function adjust_unit_balance(uuid, numeric) from public;
revoke all on function adjust_associate_total(uuid, numeric) from public;
revoke all on function log_audit_event(text, text, uuid, numeric, text, text, uuid) from public;
revoke all on function channel_base_transfer(text, text, numeric, timestamptz, uuid) from public;
revoke all on function associate_record_allocation(uuid, text, numeric, timestamptz, uuid) from public;

grant execute on function adjust_unit_balance(uuid, numeric) to service_role;
grant execute on function adjust_associate_total(uuid, numeric) to service_role;
grant execute on function log_audit_event(text, text, uuid, numeric, text, text, uuid) to authenticated;
grant execute on function log_audit_event(text, text, uuid, numeric, text, text, uuid) to service_role;
grant execute on function channel_base_transfer(text, text, numeric, timestamptz, uuid) to authenticated;
grant execute on function channel_base_transfer(text, text, numeric, timestamptz, uuid) to service_role;
grant execute on function associate_record_allocation(uuid, text, numeric, timestamptz, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- POLICIES: ARCHITECTURE
-- ─────────────────────────────────────────────────────────────────────────────

-- platform_roles: platform admins see all roles; self-read allowed
create policy "platform_roles_select" on platform_roles for select
  using (user_id = auth.uid() or exists (select 1 from platform_roles where user_id = auth.uid()));

-- org_clusters: admins see their cluster; platform admins see all
create policy "org_clusters_select" on org_clusters for select
  using (id = get_my_meta_org_id() or exists (select 1 from platform_roles where user_id = auth.uid()));

-- orgs: cluster-scoped read
create policy "orgs_select" on orgs for select
  using (is_org_in_my_cluster(id));

-- org_memberships: visible to self or org admins
create policy "org_memberships_select" on org_memberships for select
  using (user_id = auth.uid() or (get_my_role() = 'admin' and is_org_in_my_cluster(org_id)));

-- ─────────────────────────────────────────────────────────────────────────────
-- POLICIES: OPERATIONAL DATA
-- ─────────────────────────────────────────────────────────────────────────────

-- user_roles: users read own role; cluster admins see cluster roles
create policy "user_roles_select" on user_roles for select
  using (user_id = auth.uid() or (get_my_role() = 'admin' and exists (select 1 from profiles where id = user_roles.user_id and is_org_in_my_cluster(org_id))));

-- profiles: read own or cluster-scoped read
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or (get_my_role() = 'admin' and is_org_in_my_cluster(org_id)));

-- workspaces: cluster-aware read/write
create policy "workspaces_select" on workspaces for select
  using (is_org_in_my_cluster(org_id));

create policy "workspaces_all" on workspaces for all
  using (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id))
  with check (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id));

-- units: cluster-aware read/write
create policy "units_select" on units for select
  using (is_org_in_my_cluster(org_id));

create policy "units_all" on units for all
  using (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id))
  with check (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id));

-- entries: group-scoped transaction read/write
create policy "entries_select" on entries for select
  using (is_org_in_my_cluster(org_id));

create policy "entries_all" on entries for all
  using (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id))
  with check (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id));

-- associates: read and manage scoped to group
create policy "associates_select" on associates for select
  using (is_org_in_my_cluster(org_id));

create policy "associates_all" on associates for all
  using (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id))
  with check (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id));

-- associate_allocations: strictly scoped
create policy "associate_allocations_select" on associate_allocations for select
  using (is_org_in_my_cluster(org_id));

create policy "associate_allocations_all" on associate_allocations for all
  using (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id))
  with check (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id));

-- unit_account_entries: specialized protection for decrements
create policy "unit_account_entries_select" on unit_account_entries for select
  using (is_org_in_my_cluster(org_id));

create policy "unit_account_entries_all" on unit_account_entries for all
  using (
    (get_my_role() = 'admin' and is_org_in_my_cluster(org_id))
    or (get_my_role() = 'operator' and is_org_in_my_cluster(org_id) and type <> 'decrement')
  )
  with check (
    (get_my_role() = 'admin' and is_org_in_my_cluster(org_id))
    or (get_my_role() = 'operator' and is_org_in_my_cluster(org_id) and type <> 'decrement')
  );

-- Transfer accounts, Expenses, Audit logs, Members: Cluster Scoped
create policy "audit_events_select" on audit_events for select using (is_org_in_my_cluster(org_id));
create policy "members_select" on members for select using (is_org_in_my_cluster(org_id));
create policy "members_all" on members for all using (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id));
create policy "expenses_select" on expenses for select using (is_org_in_my_cluster(org_id));
create policy "expenses_all" on expenses for all using (get_my_role() in ('admin', 'operator') and is_org_in_my_cluster(org_id));
create policy "transfer_accounts_select" on transfer_accounts for select using (is_org_in_my_cluster(org_id));
create policy "transfer_accounts_all" on transfer_accounts for all using (get_my_role() = 'admin' and is_org_in_my_cluster(org_id));

-- Request Queues (Adjustment/Output): Insertion permitted for operators, resolution only for admins
create policy "adjustment_requests_select" on adjustment_requests for select using (is_org_in_my_cluster(org_id));
create policy "adjustment_requests_insert" on adjustment_requests for insert with check (is_org_in_my_cluster(org_id));
create policy "adjustment_requests_resolve" on adjustment_requests for update using (get_my_role() = 'admin' and is_org_in_my_cluster(org_id));

create policy "output_requests_select" on output_requests for select using (is_org_in_my_cluster(org_id));
create policy "output_requests_insert" on output_requests for insert with check (is_org_in_my_cluster(org_id));
create policy "output_requests_resolve" on output_requests for update using (get_my_role() = 'admin' and is_org_in_my_cluster(org_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES (Matching New Naming)
-- ─────────────────────────────────────────────────────────────────────────────
create index idx_org_memberships_user on org_memberships(user_id);
create index idx_org_memberships_org on org_memberships(org_id);
create index idx_org_meta_cluster on org_meta_mapping(meta_org_id);

create index idx_profiles_org_id on profiles(org_id);
create index idx_profiles_meta_id on profiles(meta_org_id);
create index idx_workspaces_org_id on workspaces(org_id);
create index idx_units_org_id on units(org_id);
create index idx_entries_org_id on entries(org_id);
create index idx_entries_workspace_id on entries(workspace_id);
create index idx_associates_org_id on associates(org_id);
create index idx_associate_allocations_org_id on associate_allocations(org_id);
create index idx_associate_allocations_attributed_associate_id on associate_allocations(attributed_associate_id);
create index idx_associate_allocations_associate_id on associate_allocations(associate_id);
create index idx_unit_account_entries_org_id on unit_account_entries(org_id);
create index idx_adjustment_requests_org_id on adjustment_requests(org_id);
create index idx_output_requests_org_id on output_requests(org_id);
create index idx_members_org_id on members(org_id);
create index idx_audit_events_org_id on audit_events(org_id);
create index idx_access_requests_org_id on access_requests(org_id);
create index idx_access_invites_org_id on access_invites(org_id);
create index idx_workspaces_status on workspaces(status);
