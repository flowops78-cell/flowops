-- Phase 4: move RLS helper logic to org_memberships and secure the new
-- authority tables under row-level security.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Membership-aware helper functions
-- ---------------------------------------------------------------------------

create or replace function get_my_platform_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role
  from public.platform_roles
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
      from public.org_memberships as membership
      where membership.user_id = auth.uid()
        and membership.status = 'active'
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
      from public.user_roles as user_role
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
      from public.org_memberships as membership
      where membership.user_id = auth.uid()
        and membership.status = 'active'
      order by membership.is_default_org desc, membership.created_at asc, membership.org_id asc
      limit 1
    ),
    (
      select profile.org_id
      from public.profiles as profile
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
      from public.org_memberships as membership
      join public.orgs as org on org.id = membership.org_id
      where membership.user_id = auth.uid()
        and membership.status = 'active'
      order by membership.is_default_org desc, membership.created_at asc, membership.org_id asc
      limit 1
    ),
    (
      select profile.meta_org_id
      from public.profiles as profile
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
      from public.org_memberships as membership
      where membership.user_id = auth.uid()
        and membership.org_id = p_org_id
        and membership.status = 'active'
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
      from public.user_roles as user_role
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
    from public.org_memberships as membership
    where membership.user_id = auth.uid()
      and membership.org_id = p_org_id
      and membership.status = 'active'
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
    from public.org_memberships as membership
    where membership.user_id = auth.uid()
      and membership.org_id = p_org_id
      and membership.status = 'active'
      and membership.role = 'admin'
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.org_memberships as membership
    join public.orgs as actor_org on actor_org.id = membership.org_id
    join public.orgs as target_org on target_org.id = p_org_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role = 'admin'
      and actor_org.cluster_id = target_org.cluster_id
  ) then
    return true;
  end if;

  select profile.meta_org_id, user_role.role
    into v_profile_meta_id, v_profile_role
  from public.profiles as profile
  left join public.user_roles as user_role on user_role.user_id = profile.id
  where profile.id = auth.uid()
  limit 1;

  if v_profile_role = 'admin' and v_profile_meta_id is null then
    return true;
  end if;

  return exists (
    select 1
    from public.org_meta_mapping as mapping
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

-- ---------------------------------------------------------------------------
-- Secure the new authority tables
-- ---------------------------------------------------------------------------

alter table public.org_clusters enable row level security;
alter table public.orgs enable row level security;
alter table public.org_memberships enable row level security;
alter table public.platform_roles enable row level security;

drop policy if exists "org_clusters_select" on public.org_clusters;
drop policy if exists "org_clusters_read" on public.org_clusters;
create policy "org_clusters_read" on public.org_clusters
  for select
  using (
    get_my_platform_role() = 'platform_admin'
    or id = get_my_meta_org_id()
  );

drop policy if exists "org_clusters_write_insert" on public.org_clusters;
create policy "org_clusters_write_insert" on public.org_clusters
  for insert
  with check (false);

drop policy if exists "org_clusters_write_update" on public.org_clusters;
create policy "org_clusters_write_update" on public.org_clusters
  for update
  using (false)
  with check (false);

drop policy if exists "org_clusters_write_delete" on public.org_clusters;
create policy "org_clusters_write_delete" on public.org_clusters
  for delete
  using (false);

drop policy if exists "orgs_select" on public.orgs;
drop policy if exists "orgs_read" on public.orgs;
create policy "orgs_read" on public.orgs
  for select
  using (can_access_org(id));

drop policy if exists "orgs_write_insert" on public.orgs;
create policy "orgs_write_insert" on public.orgs
  for insert
  with check (false);

drop policy if exists "orgs_write_update" on public.orgs;
create policy "orgs_write_update" on public.orgs
  for update
  using (false)
  with check (false);

drop policy if exists "orgs_write_delete" on public.orgs;
create policy "orgs_write_delete" on public.orgs
  for delete
  using (false);

drop policy if exists "org_memberships_select" on public.org_memberships;
drop policy if exists "org_memberships_read" on public.org_memberships;
create policy "org_memberships_read" on public.org_memberships
  for select
  using (
    user_id = auth.uid()
    or can_administer_org(org_id)
  );

drop policy if exists "org_memberships_write_insert" on public.org_memberships;
create policy "org_memberships_write_insert" on public.org_memberships
  for insert
  with check (false);

drop policy if exists "org_memberships_write_update" on public.org_memberships;
create policy "org_memberships_write_update" on public.org_memberships
  for update
  using (false)
  with check (false);

drop policy if exists "org_memberships_write_delete" on public.org_memberships;
create policy "org_memberships_write_delete" on public.org_memberships
  for delete
  using (false);

drop policy if exists "platform_roles_select" on public.platform_roles;
drop policy if exists "platform_roles_read" on public.platform_roles;
create policy "platform_roles_read" on public.platform_roles
  for select
  using (user_id = auth.uid());

drop policy if exists "platform_roles_write_insert" on public.platform_roles;
create policy "platform_roles_write_insert" on public.platform_roles
  for insert
  with check (false);

drop policy if exists "platform_roles_write_update" on public.platform_roles;
create policy "platform_roles_write_update" on public.platform_roles
  for update
  using (false)
  with check (false);

drop policy if exists "platform_roles_write_delete" on public.platform_roles;
create policy "platform_roles_write_delete" on public.platform_roles
  for delete
  using (false);

-- ---------------------------------------------------------------------------
-- Rewire existing client-facing policies to the new helper layer
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_read" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_read" on public.profiles
  for select
  using (
    id = auth.uid()
    or (
      get_my_role() = 'admin'
      and (
        get_my_platform_role() = 'platform_admin'
        or (org_id is not null and is_org_in_my_cluster(org_id))
        or (org_id is null and meta_org_id is not null and meta_org_id = get_my_meta_org_id())
      )
    )
  );

drop policy if exists "workspaces_select" on public.workspaces;
drop policy if exists "workspaces_read" on public.workspaces;
create policy "workspaces_read" on public.workspaces
  for select
  using (
    is_org_in_my_cluster(org_id)
    or (
      has_org_membership(org_id)
      and (
        get_my_org_role(org_id) = 'viewer'
        or (
          get_my_org_role(org_id) = 'operator'
          and (
            status in ('completed', 'archived')
            or (status = 'active' and assigned_operator_id = auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "workspaces_all" on public.workspaces;
drop policy if exists "workspaces_write" on public.workspaces;
create policy "workspaces_write" on public.workspaces
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "units_select" on public.units;
drop policy if exists "units_read" on public.units;
create policy "units_read" on public.units
  for select
  using (can_access_org(org_id));

drop policy if exists "units_all" on public.units;
drop policy if exists "units_write" on public.units;
create policy "units_write" on public.units
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "entries_select" on public.entries;
drop policy if exists "entries_read" on public.entries;
create policy "entries_read" on public.entries
  for select
  using (can_access_org(org_id));

drop policy if exists "entries_all" on public.entries;
drop policy if exists "entries_write" on public.entries;
create policy "entries_write" on public.entries
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "activity_logs_read" on public.activity_logs;
create policy "activity_logs_read" on public.activity_logs
  for select
  using (can_access_org(org_id));

drop policy if exists "activity_logs_write" on public.activity_logs;
create policy "activity_logs_write" on public.activity_logs
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "channel_entries_read" on public.channel_entries;
create policy "channel_entries_read" on public.channel_entries
  for select
  using (can_access_org(org_id));

drop policy if exists "channel_entries_write" on public.channel_entries;
create policy "channel_entries_write" on public.channel_entries
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "associates_select" on public.associates;
drop policy if exists "associates_all" on public.associates;
drop policy if exists "partners_read" on public.associates;
drop policy if exists "associates_read" on public.associates;
create policy "associates_read" on public.associates
  for select
  using (can_access_org(org_id));

drop policy if exists "partners_write" on public.associates;
drop policy if exists "associates_write" on public.associates;
create policy "associates_write" on public.associates
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "associate_allocations_select" on public.associate_allocations;
drop policy if exists "associate_allocations_all" on public.associate_allocations;
drop policy if exists "partner_entries_read" on public.associate_allocations;
drop policy if exists "associate_allocations_read" on public.associate_allocations;
create policy "associate_allocations_read" on public.associate_allocations
  for select
  using (can_access_org(org_id));

drop policy if exists "partner_entries_write" on public.associate_allocations;
drop policy if exists "associate_allocations_write" on public.associate_allocations;
create policy "associate_allocations_write" on public.associate_allocations
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "allocations_read" on public.allocations;
create policy "allocations_read" on public.allocations
  for select
  using (can_access_org(org_id));

drop policy if exists "allocations_write" on public.allocations;
create policy "allocations_write" on public.allocations
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "adjustments_read" on public.adjustments;
create policy "adjustments_read" on public.adjustments
  for select
  using (can_access_org(org_id));

drop policy if exists "adjustments_write" on public.adjustments;
create policy "adjustments_write" on public.adjustments
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "unit_account_entries_select" on public.unit_account_entries;
drop policy if exists "unit_account_entries_read" on public.unit_account_entries;
create policy "unit_account_entries_read" on public.unit_account_entries
  for select
  using (can_access_org(org_id));

drop policy if exists "unit_account_entries_all" on public.unit_account_entries;
drop policy if exists "unit_account_entries_write" on public.unit_account_entries;
create policy "unit_account_entries_write" on public.unit_account_entries
  for all
  using (
    can_administer_org(org_id)
    or (get_my_org_role(org_id) = 'operator' and type <> 'decrement')
  )
  with check (
    can_administer_org(org_id)
    or (get_my_org_role(org_id) = 'operator' and type <> 'decrement')
  );

drop policy if exists "adjustment_requests_select" on public.adjustment_requests;
drop policy if exists "adjustment_requests_read" on public.adjustment_requests;
create policy "adjustment_requests_read" on public.adjustment_requests
  for select
  using (can_access_org(org_id));

drop policy if exists "adjustment_requests_insert" on public.adjustment_requests;
create policy "adjustment_requests_insert" on public.adjustment_requests
  for insert
  with check (can_administer_org(org_id) or (get_my_org_role(org_id) = 'operator' and status = 'pending'));

drop policy if exists "adjustment_requests_resolve" on public.adjustment_requests;
drop policy if exists "adjustment_requests_update" on public.adjustment_requests;
create policy "adjustment_requests_update" on public.adjustment_requests
  for update
  using (can_administer_org(org_id))
  with check (can_administer_org(org_id));

drop policy if exists "output_requests_select" on public.output_requests;
drop policy if exists "output_requests_read" on public.output_requests;
create policy "output_requests_read" on public.output_requests
  for select
  using (can_access_org(org_id));

drop policy if exists "output_requests_insert" on public.output_requests;
create policy "output_requests_insert" on public.output_requests
  for insert
  with check (can_administer_org(org_id) or (get_my_org_role(org_id) = 'operator' and status = 'pending'));

drop policy if exists "output_requests_resolve" on public.output_requests;
drop policy if exists "output_requests_update" on public.output_requests;
create policy "output_requests_update" on public.output_requests
  for update
  using (can_administer_org(org_id))
  with check (can_administer_org(org_id));

drop policy if exists "operator_activities_read" on public.operator_activities;
create policy "operator_activities_read" on public.operator_activities
  for select
  using (
    is_org_in_my_cluster(org_id)
    or actor_user_id = auth.uid()
    or get_my_org_role(org_id) = 'operator'
  );

drop policy if exists "operator_activities_write" on public.operator_activities;
create policy "operator_activities_write" on public.operator_activities
  for all
  using (actor_user_id = auth.uid() and (can_administer_org(org_id) or get_my_org_role(org_id) = 'operator'))
  with check (actor_user_id = auth.uid() and (can_administer_org(org_id) or get_my_org_role(org_id) = 'operator'));

drop policy if exists "members_select" on public.members;
drop policy if exists "members_read" on public.members;
create policy "members_read" on public.members
  for select
  using (can_access_org(org_id));

drop policy if exists "members_all" on public.members;
drop policy if exists "members_write" on public.members;
create policy "members_write" on public.members
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "expenses_select" on public.expenses;
drop policy if exists "expenses_read" on public.expenses;
create policy "expenses_read" on public.expenses
  for select
  using (can_access_org(org_id));

drop policy if exists "expenses_all" on public.expenses;
drop policy if exists "expenses_write" on public.expenses;
create policy "expenses_write" on public.expenses
  for all
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "transfer_accounts_select" on public.transfer_accounts;
drop policy if exists "transfer_accounts_read" on public.transfer_accounts;
create policy "transfer_accounts_read" on public.transfer_accounts
  for select
  using (can_access_org(org_id));

drop policy if exists "transfer_accounts_all" on public.transfer_accounts;
drop policy if exists "transfer_accounts_write" on public.transfer_accounts;
create policy "transfer_accounts_write" on public.transfer_accounts
  for all
  using (can_administer_org(org_id))
  with check (can_administer_org(org_id));

drop policy if exists "audit_events_select" on public.audit_events;
drop policy if exists "audit_events_read" on public.audit_events;
create policy "audit_events_read" on public.audit_events
  for select
  using (can_access_org(org_id));

drop policy if exists "access_requests_read" on public.access_requests;
create policy "access_requests_read" on public.access_requests
  for select
  using (can_manage_org(org_id));

drop policy if exists "access_requests_update" on public.access_requests;
create policy "access_requests_update" on public.access_requests
  for update
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "access_invites_read" on public.access_invites;
create policy "access_invites_read" on public.access_invites
  for select
  using (can_manage_org(org_id));

drop policy if exists "access_invites_insert" on public.access_invites;
create policy "access_invites_insert" on public.access_invites
  for insert
  with check (can_manage_org(org_id));

drop policy if exists "access_invites_update" on public.access_invites;
create policy "access_invites_update" on public.access_invites
  for update
  using (can_manage_org(org_id))
  with check (can_manage_org(org_id));

drop policy if exists "access_invites_delete" on public.access_invites;
create policy "access_invites_delete" on public.access_invites
  for delete
  using (can_manage_org(org_id));