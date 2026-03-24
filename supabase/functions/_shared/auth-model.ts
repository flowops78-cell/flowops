import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type DbRole = 'admin' | 'operator' | 'viewer';

type AdminClient = ReturnType<typeof createClient>;

type MembershipAuthorityRow = {
  org_id: string;
  role: DbRole;
  status: 'active' | 'invited' | 'disabled';
  is_default_org: boolean;
  orgs?: { cluster_id?: string | null } | null;
};

type LegacyProfileRow = {
  org_id: string | null;
  meta_org_id: string | null;
};

type LegacyUserRoleRow = {
  role: DbRole;
};

export type CallerAuthorityContext = {
  role: DbRole | null;
  currentOrgId: string | null;
  metaOrgId: string | null;
  managedOrgIds: string[];
  isPlatformAdmin: boolean;
  isAdmin: boolean;
  source: 'memberships' | 'legacy' | 'none';
};

const roleRank: Record<DbRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

const normalizeRole = (value: unknown): DbRole => {
  if (value === 'admin' || value === 'operator' || value === 'viewer') {
    return value;
  }
  return 'viewer';
};

const strongestRole = (left: unknown, right: unknown): DbRole => {
  const normalizedLeft = normalizeRole(left);
  const normalizedRight = normalizeRole(right);
  return roleRank[normalizedLeft] >= roleRank[normalizedRight] ? normalizedLeft : normalizedRight;
};

const dedupeStrings = (values: Array<string | null | undefined>) => Array.from(new Set(
  values.filter((value): value is string => typeof value === 'string' && value.length > 0),
));

const pickStrongestRole = (roles: Array<DbRole | null | undefined>): DbRole | null => {
  let strongest: DbRole | null = null;
  for (const role of roles) {
    if (!role) continue;
    if (!strongest || roleRank[role] > roleRank[strongest]) {
      strongest = role;
    }
  }
  return strongest;
};

export const getCallerAuthorityContext = async (
  adminClient: AdminClient,
  userId: string,
  options?: { requestedOrgId?: string | null },
): Promise<CallerAuthorityContext> => {
  const [{ data: platformRoleRow, error: platformRoleError }, { data: membershipRows, error: membershipError }, { data: profileRow, error: profileError }, { data: userRoleRow, error: userRoleError }] = await Promise.all([
    adminClient
      .from('platform_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle(),
    adminClient
      .from('org_memberships')
      .select('org_id, role, status, is_default_org, orgs(cluster_id)')
      .eq('user_id', userId)
      .in('status', ['active', 'invited']),
    adminClient
      .from('profiles')
      .select('org_id, meta_org_id')
      .eq('id', userId)
      .maybeSingle(),
    adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (platformRoleError) {
    throw new Error(`Unable to resolve platform role: ${platformRoleError.message}`);
  }
  if (membershipError) {
    throw new Error(`Unable to resolve memberships: ${membershipError.message}`);
  }
  if (profileError) {
    throw new Error(`Unable to resolve caller profile: ${profileError.message}`);
  }
  if (userRoleError) {
    throw new Error(`Unable to resolve legacy role: ${userRoleError.message}`);
  }

  const typedMembershipRows = (membershipRows ?? []) as MembershipAuthorityRow[];
  const requestedOrgId = options?.requestedOrgId ?? null;
  const requestedMembership = requestedOrgId
    ? typedMembershipRows.find((row) => row.org_id === requestedOrgId) ?? null
    : null;
  const defaultMembership = requestedMembership
    ?? typedMembershipRows.find((row) => row.is_default_org)
    ?? typedMembershipRows[0]
    ?? null;
  const platformRole = typeof platformRoleRow?.role === 'string' ? platformRoleRow.role : null;
  const isPlatformAdmin = platformRole === 'platform_admin';

  if (isPlatformAdmin) {
    const { data: allOrgRows, error: allOrgRowsError } = await adminClient
      .from('orgs')
      .select('id, cluster_id');

    if (allOrgRowsError) {
      throw new Error(`Unable to resolve platform admin org scope: ${allOrgRowsError.message}`);
    }

    const typedAllOrgRows = (allOrgRows ?? []) as Array<{ id: string; cluster_id: string | null }>;
    const fallbackMembership = typedMembershipRows.find((row) => row.is_default_org) ?? typedMembershipRows[0] ?? null;
    return {
      role: 'admin',
      currentOrgId: requestedOrgId ?? fallbackMembership?.org_id ?? (profileRow as LegacyProfileRow | null)?.org_id ?? typedAllOrgRows[0]?.id ?? null,
      metaOrgId: requestedOrgId
        ? (typedAllOrgRows.find((row) => row.id === requestedOrgId)?.cluster_id ?? null)
        : (fallbackMembership?.orgs?.cluster_id ?? (profileRow as LegacyProfileRow | null)?.meta_org_id ?? typedAllOrgRows[0]?.cluster_id ?? null),
      managedOrgIds: dedupeStrings(typedAllOrgRows.map((row) => row.id)),
      isPlatformAdmin: true,
      isAdmin: true,
      source: typedMembershipRows.length > 0 ? 'memberships' : 'legacy',
    };
  }

  if (typedMembershipRows.length > 0) {
    const clusterIds = dedupeStrings(typedMembershipRows
      .filter((row) => row.role === 'admin')
      .map((row) => {
        const orgInfo = Array.isArray(row.orgs) ? row.orgs[0] : row.orgs;
        return orgInfo?.cluster_id ?? null;
      }));

    let managedOrgIds = dedupeStrings(typedMembershipRows.map((row) => row.org_id));
    if (clusterIds.length > 0) {
      const { data: clusterOrgRows, error: clusterOrgError } = await adminClient
        .from('orgs')
        .select('id, cluster_id')
        .in('cluster_id', clusterIds);

      if (clusterOrgError) {
        console.error(`[auth-model] Failed to resolve cluster orgs for clusterIds: ${clusterIds.join(',')}`, clusterOrgError);
        throw new Error(`Unable to resolve cluster orgs: ${clusterOrgError.message}`);
      }

      managedOrgIds = dedupeStrings([
        ...managedOrgIds,
        ...((clusterOrgRows ?? []) as Array<{ id: string; cluster_id: string | null }>).map((row) => row.id),
      ]);
    }

    const defaultOrgInfo = Array.isArray(defaultMembership?.orgs) ? defaultMembership.orgs[0] : defaultMembership?.orgs;

    return {
      role: pickStrongestRole(typedMembershipRows.map((row) => row.role)),
      currentOrgId: defaultMembership?.org_id ?? requestedOrgId ?? (profileRow as LegacyProfileRow | null)?.org_id ?? null,
      metaOrgId: defaultOrgInfo?.cluster_id ?? (profileRow as LegacyProfileRow | null)?.meta_org_id ?? null,
      managedOrgIds,
      isPlatformAdmin: isPlatformAdmin || !!(profileRow as LegacyProfileRow | null)?.meta_org_id, // Meta-org owners are effectively platform-esque
      isAdmin: isPlatformAdmin || typedMembershipRows.some((row) => row.role === 'admin'),
      source: 'memberships',
    };
  }

  const legacyProfile = (profileRow ?? null) as LegacyProfileRow | null;
  const legacyRole = normalizeRole((userRoleRow as LegacyUserRoleRow | null)?.role);
  const legacyIsGlobalAdmin = legacyRole === 'admin' && !legacyProfile?.meta_org_id;

  if (legacyRole || legacyProfile?.org_id || legacyProfile?.meta_org_id || isPlatformAdmin) {
    let managedOrgIds = legacyProfile?.org_id ? [legacyProfile.org_id] : [];

    if (legacyIsGlobalAdmin || isPlatformAdmin) {
      const { data: allOrgRows, error: allOrgError } = await adminClient
        .from('orgs')
        .select('id');
      
      if (!allOrgError && allOrgRows) {
        managedOrgIds = dedupeStrings([
          ...managedOrgIds,
          ...allOrgRows.map(row => row.id),
        ]);
      }
    } else if (legacyProfile?.meta_org_id) {
      const { data: mappingRows, error: mappingError } = await adminClient
        .from('org_meta_mapping')
        .select('org_id')
        .eq('meta_org_id', legacyProfile.meta_org_id);

      if (mappingError) {
        throw new Error(`Unable to resolve legacy managed orgs: ${mappingError.message}`);
      }

      managedOrgIds = dedupeStrings([
        ...managedOrgIds,
        ...((mappingRows ?? []) as Array<{ org_id: string | null }>).map((row) => row.org_id),
      ]);
    }

    return {
      role: legacyRole,
      currentOrgId: requestedOrgId ?? legacyProfile?.org_id ?? null,
      metaOrgId: legacyProfile?.meta_org_id ?? null,
      managedOrgIds,
      isPlatformAdmin: isPlatformAdmin || legacyIsGlobalAdmin,
      isAdmin: isPlatformAdmin || legacyIsGlobalAdmin || legacyRole === 'admin',
      source: 'legacy',
    };
  }

  return {
    role: null,
    currentOrgId: null,
    metaOrgId: null,
    managedOrgIds: [],
    isPlatformAdmin,
    isAdmin: isPlatformAdmin,
    source: 'none',
  };
};

export const syncOrgGraph = async (
  adminClient: AdminClient,
  orgId: string,
  metaOrgId: string | null,
) => {
  if (!metaOrgId) {
    return;
  }

  const { error: clusterError } = await adminClient
    .from('org_clusters')
    .upsert({
      id: metaOrgId,
      name: `cluster_${metaOrgId.slice(0, 8)}`,
    });

  if (clusterError) {
    throw new Error(`Unable to sync org cluster: ${clusterError.message}`);
  }

  const { error: orgError } = await adminClient
    .from('orgs')
    .upsert({
      id: orgId,
      cluster_id: metaOrgId,
      name: `org_${orgId.slice(0, 8)}`,
    });

  if (orgError) {
    throw new Error(`Unable to sync org row: ${orgError.message}`);
  }
};

export const ensureOrgMembership = async (
  adminClient: AdminClient,
  userId: string,
  orgId: string,
  role: DbRole,
  options?: { isDefaultOrg?: boolean; status?: 'active' | 'invited' | 'disabled' },
) => {
  const desiredStatus = options?.status ?? 'active';
  const desiredDefault = options?.isDefaultOrg ?? false;

  const { data: existingMembership, error: lookupError } = await adminClient
    .from('org_memberships')
    .select('id, role, is_default_org')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Unable to resolve membership: ${lookupError.message}`);
  }

  const nextRole = strongestRole(existingMembership?.role, role);

  const { error: upsertError } = await adminClient
    .from('org_memberships')
    .upsert({
      user_id: userId,
      org_id: orgId,
      role: nextRole,
      status: desiredStatus,
      is_default_org: desiredDefault || existingMembership?.is_default_org === true,
    }, { onConflict: 'user_id,org_id' });

  if (upsertError) {
    throw new Error(`Unable to sync org membership: ${upsertError.message}`);
  }

  if (desiredDefault) {
    const { error: resetDefaultError } = await adminClient
      .from('org_memberships')
      .update({ is_default_org: false })
      .eq('user_id', userId)
      .neq('org_id', orgId);

    if (resetDefaultError) {
      throw new Error(`Unable to reset default memberships: ${resetDefaultError.message}`);
    }

    const { error: defaultError } = await adminClient
      .from('org_memberships')
      .update({ is_default_org: true, status: desiredStatus })
      .eq('user_id', userId)
      .eq('org_id', orgId);

    if (defaultError) {
      throw new Error(`Unable to mark default membership: ${defaultError.message}`);
    }
  }
};
