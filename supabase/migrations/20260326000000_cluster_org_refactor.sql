-- ─────────────────────────────────────────────────────────────────────────────
-- 20260326000000_cluster_org_refactor.sql
-- Refactor Flow Ops org hierarchy to a deterministic cluster -> organization model.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1. Rename existing organizational tables to matching requested naming convention
-- Wait, I should check if they exist before renaming to avoid errors if rerunning
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'org_clusters') then
    alter table public.org_clusters rename to clusters;
  end if;
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'orgs') then
    alter table public.orgs rename to organizations;
  end if;
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'org_memberships') then
    alter table public.org_memberships rename to organization_memberships;
  end if;
end $$;

-- 2. Enhance clusters table
alter table public.clusters add column if not exists created_by uuid references auth.users(id);

-- 3. Update profiles for active context
alter table public.profiles add column if not exists active_cluster_id uuid references public.clusters(id);
alter table public.profiles add column if not exists active_org_id uuid references public.organizations(id);

-- 4. Create cluster_memberships table
create table if not exists public.cluster_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  role text not null check (role in ('cluster_admin', 'cluster_operator', 'viewer')),
  created_at timestamptz default now(),
  unique (user_id, cluster_id)
);

-- 5. Data Backfill: Initial Context State
-- Set active components on profiles from legacy fields
update public.profiles
set active_cluster_id = meta_org_id,
    active_org_id = org_id
where active_cluster_id is null and active_org_id is null;

-- 6. Data Backfill: Cluster Memberships
-- Promote anyone who was a 'meta-org admin' (legacy admin with meta_org_id)
insert into public.cluster_memberships (user_id, cluster_id, role)
select 
  p.id as user_id, 
  p.meta_org_id as cluster_id, 
  'cluster_admin'::text as role
from public.profiles p
join public.user_roles ur on ur.user_id = p.id
where p.meta_org_id is not null 
  and ur.role::text = 'admin'
on conflict (user_id, cluster_id) do nothing;

-- Ensure all existing org memberships are updated to Use requested 'org_admin' role naming if needed
update public.organization_memberships
set role = 'admin' 
where role::text = 'admin';

-- 7. Helper Functions for RLS
create or replace function public.user_has_org_access(target_org uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.user_id = auth.uid()
      and om.org_id = target_org
      and om.status = 'active'
  );
$$;

create or replace function public.user_has_cluster_access(target_cluster uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.cluster_memberships cm
    where cm.user_id = auth.uid()
      and cm.cluster_id = target_cluster
  );
$$;

-- 8. Update existing RLS helper functions to bridge the transition
create or replace function get_my_meta_org_id()
returns uuid
language sql stable security definer
as $$
  select coalesce(
    (select active_cluster_id from public.profiles where id = auth.uid()),
    (
      select o.cluster_id
      from public.organization_memberships om
      join public.organizations o on o.id = om.org_id
      where om.user_id = auth.uid()
        and om.status = 'active'
      order by om.is_default_org desc, om.created_at asc
      limit 1
    )
  );
$$;

-- NOTE: we keep is_org_in_my_cluster but update its logic to check cluster_memberships
create or replace function is_org_in_my_cluster(p_org_id uuid)
returns boolean
language plpgsql stable security definer
as $$
declare
  v_cluster_id uuid;
begin
  select cluster_id into v_cluster_id from public.organizations where id = p_org_id;
  return public.user_has_cluster_access(v_cluster_id);
end;
$$;

commit;
