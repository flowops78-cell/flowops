-- Phase 1 + Phase 2 of membership-based auth migration.
-- Non-breaking only: add new authority tables and backfill org_clusters/orgs.
-- No read/write path changes yet.

create extension if not exists "uuid-ossp";

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Phase 1: new authority tables
-- ---------------------------------------------------------------------------

create table if not exists public.org_clusters (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz not null default now()
);

create table if not exists public.orgs (
  id uuid primary key,
  cluster_id uuid not null references public.org_clusters(id) on delete restrict,
  name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orgs_cluster_id on public.orgs(cluster_id);

create table if not exists public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  role app_role not null,
  status text not null check (status in ('active', 'invited', 'disabled')),
  is_default_org boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_org_memberships_user_org unique (user_id, org_id)
);

create index if not exists idx_org_memberships_user_id on public.org_memberships(user_id);
create index if not exists idx_org_memberships_org_id on public.org_memberships(org_id);

create table if not exists public.platform_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('platform_admin'))
);

-- ---------------------------------------------------------------------------
-- Phase 2: backfill clusters and orgs from legacy model
-- ---------------------------------------------------------------------------

-- 2.1 Create clusters directly from existing legacy org/meta mappings.
insert into public.org_clusters (id, name)
select distinct
  mapping.meta_org_id,
  'cluster_' || left(mapping.meta_org_id::text, 8)
from public.org_meta_mapping as mapping
where mapping.meta_org_id is not null
on conflict (id) do nothing;

-- 2.2 Create org rows directly from existing legacy org/meta mappings.
insert into public.orgs (id, cluster_id, name)
select distinct
  mapping.org_id,
  mapping.meta_org_id,
  'org_' || left(mapping.org_id::text, 8)
from public.org_meta_mapping as mapping
where mapping.org_id is not null
  and mapping.meta_org_id is not null
on conflict (id) do update
set cluster_id = excluded.cluster_id;

-- 2.3 Discover org ids that exist in legacy tables but are not present in org_meta_mapping.
-- Each orphan org gets its own deterministic singleton cluster so reruns stay idempotent.
with orphan_orgs as (
  select distinct profile.org_id
  from public.profiles as profile
  left join public.orgs as existing_org on existing_org.id = profile.org_id
  where profile.org_id is not null
    and existing_org.id is null

  union

  select distinct member.org_id
  from public.members as member
  left join public.orgs as existing_org on existing_org.id = member.org_id
  where member.org_id is not null
    and existing_org.id is null

  union

  select distinct workspace.org_id
  from public.workspaces as workspace
  left join public.orgs as existing_org on existing_org.id = workspace.org_id
  where workspace.org_id is not null
    and existing_org.id is null
), orphan_clusters as (
  select
    orphan_orgs.org_id,
    uuid_generate_v5(uuid_ns_url(), 'flow-ops-org-cluster:' || orphan_orgs.org_id::text) as cluster_id
  from orphan_orgs
)
insert into public.org_clusters (id, name)
select
  orphan_clusters.cluster_id,
  'cluster_fallback_' || left(orphan_clusters.org_id::text, 8)
from orphan_clusters
on conflict (id) do nothing;

-- 2.4 Create org rows for those orphan org ids using the deterministic singleton clusters above.
with orphan_orgs as (
  select distinct profile.org_id
  from public.profiles as profile
  left join public.orgs as existing_org on existing_org.id = profile.org_id
  where profile.org_id is not null
    and existing_org.id is null

  union

  select distinct member.org_id
  from public.members as member
  left join public.orgs as existing_org on existing_org.id = member.org_id
  where member.org_id is not null
    and existing_org.id is null

  union

  select distinct workspace.org_id
  from public.workspaces as workspace
  left join public.orgs as existing_org on existing_org.id = workspace.org_id
  where workspace.org_id is not null
    and existing_org.id is null
), orphan_clusters as (
  select
    orphan_orgs.org_id,
    uuid_generate_v5(uuid_ns_url(), 'flow-ops-org-cluster:' || orphan_orgs.org_id::text) as cluster_id
  from orphan_orgs
)
insert into public.orgs (id, cluster_id, name)
select
  orphan_clusters.org_id,
  orphan_clusters.cluster_id,
  'org_fallback_' || left(orphan_clusters.org_id::text, 8)
from orphan_clusters
on conflict (id) do nothing;