-- Phase 3: backfill org_memberships from the legacy auth model.
-- Goal: populate memberships from legacy evidence only, normalize defaults,
-- and surface unresolved gaps before the read switch.

-- ---------------------------------------------------------------------------
-- Phase 3.1: base memberships from profiles + user_roles
-- ---------------------------------------------------------------------------
insert into public.org_memberships (user_id, org_id, role, status, is_default_org)
select
  profile.id as user_id,
  profile.org_id,
  coalesce(user_role.role, 'viewer'::app_role) as role,
  'active' as status,
  true as is_default_org
from public.profiles as profile
join public.orgs as org on org.id = profile.org_id
left join public.user_roles as user_role on user_role.user_id = profile.id
where profile.org_id is not null
on conflict (user_id, org_id) do update
set role = case
  when excluded.role = 'admin' then 'admin'::app_role
  when excluded.role = 'operator' and public.org_memberships.role = 'viewer' then 'operator'::app_role
  else public.org_memberships.role
end,
status = 'active',
is_default_org = public.org_memberships.is_default_org or excluded.is_default_org;

-- ---------------------------------------------------------------------------
-- Phase 3.2: add memberships from members table
-- ---------------------------------------------------------------------------
insert into public.org_memberships (user_id, org_id, role, status, is_default_org)
select
  member.user_id,
  member.org_id,
  coalesce(member.role, 'viewer'::app_role) as role,
  'active' as status,
  false as is_default_org
from public.members as member
join public.orgs as org on org.id = member.org_id
where member.user_id is not null
on conflict (user_id, org_id) do update
set role = case
  when excluded.role = 'admin' then 'admin'::app_role
  when excluded.role = 'operator' and public.org_memberships.role = 'viewer' then 'operator'::app_role
  else public.org_memberships.role
end,
status = 'active';

-- ---------------------------------------------------------------------------
-- Phase 3.3: repair default org flags without inventing org access
-- ---------------------------------------------------------------------------

-- Reset users that somehow ended up with multiple defaults so we can reassign
-- one deterministically.
update public.org_memberships
set is_default_org = false
where user_id in (
  select membership.user_id
  from public.org_memberships as membership
  group by membership.user_id
  having count(*) filter (where membership.is_default_org) > 1
);

-- Assign exactly one default only for users that still have none.
update public.org_memberships as membership
set is_default_org = true
where membership.id in (
  select distinct on (candidate.user_id) candidate.id
  from public.org_memberships as candidate
  where candidate.user_id in (
    select missing_default.user_id
    from public.org_memberships as missing_default
    group by missing_default.user_id
    having count(*) filter (where missing_default.is_default_org) = 0
  )
  order by candidate.user_id, candidate.created_at asc, candidate.id asc
);

-- ---------------------------------------------------------------------------
-- Phase 3.4: validation output before Phase 5 read switching
-- ---------------------------------------------------------------------------

-- Expect 0.
select count(*) as users_without_membership
from public.profiles as profile
where not exists (
  select 1
  from public.org_memberships as membership
  where membership.user_id = profile.id
);

-- Expect no rows.
select membership.user_id, membership.org_id, count(*) as membership_count
from public.org_memberships as membership
group by membership.user_id, membership.org_id
having count(*) > 1;

-- Expect no rows.
select membership.user_id, count(*) as default_count
from public.org_memberships as membership
where membership.is_default_org = true
group by membership.user_id
having count(*) > 1;

-- Expect no rows.
select membership.user_id
from public.org_memberships as membership
group by membership.user_id
having count(*) filter (where membership.is_default_org) = 0;

-- Expect 0.
select count(*) as memberships_with_missing_org
from public.org_memberships as membership
left join public.orgs as org on org.id = membership.org_id
where org.id is null;

-- Investigate any rows returned here before enabling membership-only reads.
select profile.id as user_id
from public.profiles as profile
where not exists (
  select 1
  from public.org_memberships as membership
  where membership.user_id = profile.id
)
order by profile.created_at asc nulls last, profile.id asc;