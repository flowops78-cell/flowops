import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type DbRole = 'admin' | 'operator' | 'viewer';

type AdminClient = ReturnType<typeof createClient>;

type MembershipAuthorityRow = {
  org_id: string;
  role: DbRole;
  status: 'active' | 'invited' | 'disabled';
  is_default_org: boolean;
  organizations?: { cluster_id?: string | null } | null;
};

export type CallerAuthorityContext = {
  role: DbRole | null;
  currentOrgId: string | null;
  clusterId: string | null;
  managedOrgIds: string[];
  isAdmin: boolean;
  source: 'memberships' | 'none';
  /** Clusters where the caller is `cluster_admin` (group manager). */
  administeredClusterIds: string[];
  /** Workspaces where the caller is org `admin` with `active` membership. */
  workspaceAdminOrgIds: string[];
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
  const [
    { data: membershipRows, error: membershipError },
    { data: profileRow, error: profileError },
    { data: clusterMembershipRows, error: clusterMembershipError }
  ] = await Promise.all([
    adminClient
      .from('organization_memberships')
      .select('org_id, role, status, is_default_org, organizations(cluster_id)')
      .eq('user_id', userId)
      .in('status', ['active', 'invited']),
    adminClient
      .from('profiles')
      .select('id, active_org_id, active_cluster_id')
      .eq('id', userId)
      .maybeSingle(),
    adminClient
      .from('cluster_memberships')
      .select('cluster_id, role')
      .eq('user_id', userId),
  ]);

  if (membershipError) {
    throw new Error(`Unable to resolve memberships: ${membershipError.message}`);
  }
  if (profileError) {
    throw new Error(`Unable to resolve caller profile: ${profileError.message}`);
  }
  if (clusterMembershipError) {
    throw new Error(`Unable to resolve cluster memberships: ${clusterMembershipError.message}`);
  }

  const typedMembershipRows = (membershipRows ?? []) as MembershipAuthorityRow[];
  const typedClusterMembershipRows = (clusterMembershipRows ?? []) as Array<{ cluster_id: string; role: string }>;
  const profile = profileRow as { active_org_id: string | null; active_cluster_id: string | null } | null;
  
  const requestedOrgId = options?.requestedOrgId ?? null;
  const requestedMembership = requestedOrgId
    ? typedMembershipRows.find((row) => row.org_id === requestedOrgId) ?? null
    : null;
  
  const defaultMembership = requestedMembership
    ?? typedMembershipRows.find((row) => row.is_default_org)
    ?? typedMembershipRows[0]
    ?? null;

  // --- Cluster & org membership (decentralized: group + workspace scope only) ---
  const administeredClusterIds = dedupeStrings(typedClusterMembershipRows
    .filter((row) => row.role === 'cluster_admin')
    .map((row) => row.cluster_id));

  // Determine if user has any administrative or operational role
  if (administeredClusterIds.length > 0 || typedMembershipRows.length > 0) {
    let managedOrgIds = dedupeStrings(typedMembershipRows.map((row) => row.org_id));
    
    // Resolve all organizations in clusters where the user is an admin
    if (administeredClusterIds.length > 0) {
      const { data: clusterOrgRows, error: clusterOrgError } = await adminClient
        .from('organizations')
        .select('id')
        .in('cluster_id', administeredClusterIds);

      if (clusterOrgError) {
        throw new Error(`Unable to resolve cluster organizations: ${clusterOrgError.message}`);
      }

      managedOrgIds = dedupeStrings([
        ...managedOrgIds,
        ...((clusterOrgRows ?? []) as Array<{ id: string }>).map((row) => row.id),
      ]);
    }

    // Determine currently scoped Org and Cluster
    const currentOrgId = requestedOrgId ?? profile?.active_org_id ?? defaultMembership?.org_id ?? null;
    let currentClusterId = profile?.active_cluster_id;

    if (!currentClusterId && currentOrgId) {
      const orgInfo = typedMembershipRows.find(m => m.org_id === currentOrgId);
      currentClusterId = (Array.isArray(orgInfo?.organizations) ? (orgInfo.organizations as any)[0]?.cluster_id : (orgInfo?.organizations as any)?.cluster_id) ?? null;
    }

    const directMembership = typedMembershipRows.find(m => m.org_id === currentOrgId);
    let currentRole: DbRole | null = directMembership?.role ?? null;

    if (!currentRole && currentClusterId) {
      const clusterMember = typedClusterMembershipRows.find(cm => cm.cluster_id === currentClusterId);
      if (clusterMember) {
        if (clusterMember.role === 'cluster_admin') currentRole = 'admin';
        else if (clusterMember.role === 'cluster_operator') currentRole = 'operator';
        else currentRole = 'viewer';
      }
    }

    const workspaceAdminOrgIds = dedupeStrings(
      typedMembershipRows
        .filter((row) => row.role === 'admin' && row.status === 'active')
        .map((row) => row.org_id),
    );

    return {
      role: currentRole,
      currentOrgId,
      clusterId: currentClusterId ?? null,
      managedOrgIds,
      isAdmin: administeredClusterIds.length > 0 || typedMembershipRows.some((row) => row.role === 'admin'),
      source: 'memberships',
      administeredClusterIds: [...administeredClusterIds],
      workspaceAdminOrgIds,
    };
  }

  // --- Fallback (No Access) ---
  return {
    role: null,
    currentOrgId: null,
    clusterId: null,
    managedOrgIds: [],
    isAdmin: false,
    source: 'none',
    administeredClusterIds: [],
    workspaceAdminOrgIds: [],
  };
};

/**
 * True if the caller may administer this workspace: active org admin, or group admin of the org's cluster.
 * Prefer this over `managedOrgIds.includes(orgId)` when using the service role (RLS bypass).
 */
export const callerCanManageOrganization = async (
  adminClient: AdminClient,
  orgId: string,
  authority: CallerAuthorityContext,
): Promise<boolean> => {
  if (authority.workspaceAdminOrgIds.includes(orgId)) return true;
  if (authority.administeredClusterIds.length === 0) return false;

  const { data: orgRow, error } = await adminClient
    .from('organizations')
    .select('cluster_id')
    .eq('id', orgId)
    .maybeSingle();

  if (error || !orgRow?.cluster_id) return false;
  return authority.administeredClusterIds.includes(orgRow.cluster_id as string);
};

export const syncOrgGraph = async (
  adminClient: AdminClient,
  orgId: string,
  clusterId: string | null,
) => {
  if (!clusterId) {
    return;
  }

  const { error: clusterError } = await adminClient
    .from('clusters')
    .upsert({
      id: clusterId,
      name: `cluster_${clusterId.slice(0, 8)}`,
    });

  if (clusterError) {
    throw new Error(`Unable to sync cluster: ${clusterError.message}`);
  }

  const { error: orgError } = await adminClient
    .from('organizations')
    .upsert({
      id: orgId,
      cluster_id: clusterId,
      name: `org_${orgId.slice(0, 8)}`,
    });

  if (orgError) {
    throw new Error(`Unable to sync organization: ${orgError.message}`);
  }
};

export const ensureOrgMembership = async (
  adminClient: AdminClient,
  userId: string,
  orgId: string,
  role: DbRole,
  options?: {
    isDefaultOrg?: boolean;
    status?: 'active' | 'invited' | 'disabled';
    /** Shown in workspace member lists; optional on upsert. */
    displayName?: string | null;
  },
) => {
  const desiredStatus = options?.status ?? 'active';
  const desiredDefault = options?.isDefaultOrg ?? false;
  const displayNameTrimmed = (options?.displayName ?? '').trim();

  const { data: existingMembership, error: lookupError } = await adminClient
    .from('organization_memberships')
    .select('id, role, is_default_org')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Unable to resolve membership: ${lookupError.message}`);
  }

  const nextRole = strongestRole(existingMembership?.role, role);

  const membershipRow: Record<string, unknown> = {
    user_id: userId,
    org_id: orgId,
    role: nextRole,
    status: desiredStatus,
    is_default_org: desiredDefault || existingMembership?.is_default_org === true,
  };
  if (displayNameTrimmed.length > 0) {
    membershipRow.display_name = displayNameTrimmed;
  }

  const { error: upsertError } = await adminClient
    .from('organization_memberships')
    .upsert(membershipRow, { onConflict: 'user_id,org_id' });

  if (upsertError) {
    throw new Error(`Unable to sync organization membership: ${upsertError.message}`);
  }

  if (desiredDefault) {
    await adminClient
      .from('organization_memberships')
      .update({ is_default_org: false })
      .eq('user_id', userId)
      .neq('org_id', orgId);

    await adminClient
      .from('organization_memberships')
      .update({ is_default_org: true, status: desiredStatus })
      .eq('user_id', userId)
      .eq('org_id', orgId);
  }
};
