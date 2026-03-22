insert into org_meta_mapping (org_id, meta_org_id)
select distinct on (org_id)
  org_id,
  meta_org_id
from profiles
where org_id is not null
  and meta_org_id is not null
order by org_id, created_at asc nulls last, id asc
on conflict (org_id) do nothing;

update profiles as profile
set meta_org_id = mapping.meta_org_id
from org_meta_mapping as mapping
where profile.org_id = mapping.org_id
  and profile.org_id is not null
  and profile.meta_org_id is null;