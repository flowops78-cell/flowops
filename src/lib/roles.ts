export type AppRole = 'admin' | 'operator' | 'viewer';
export type DbRole = 'admin' | 'operator' | 'viewer';
export type ClusterRole = 'cluster_admin' | 'cluster_operator' | 'viewer';


export const normalizeAppRole = (value: unknown): AppRole | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'admin' || normalized === 'operator' || normalized === 'viewer') {
    return normalized;
  }
  if (normalized === 'operator') return 'operator';
  if (normalized === 'viewer' || normalized === 'vwr') {
    return 'viewer';
  }
  return null;
};

export const normalizeDbRole = (value: unknown): DbRole | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'admin' || normalized === 'operator' || normalized === 'viewer') {
    return normalized;
  }
  if (normalized === 'operator') return 'operator';
  if (normalized === 'viewer' || normalized === 'vwr') {
    return 'viewer';
  }
  return null;
};

export const normalizeClusterRole = (value: unknown): ClusterRole | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'cluster_admin' || normalized === 'cluster_operator' || normalized === 'viewer') {
    return normalized as ClusterRole;
  }
  if (normalized === 'admin' || normalized === 'cluster-admin') return 'cluster_admin';
  if (normalized === 'operator' || normalized === 'cluster-operator') return 'cluster_operator';
  if (normalized === 'viewer' || normalized === 'vwr') return 'viewer';
  return null;
};


export const appRoleToDbRole = (role: AppRole): DbRole => {
  return role;
};

export const dbRoleToAppRole = (role: unknown): AppRole => {
  const normalized = normalizeDbRole(role);
  return normalized || 'viewer';
};
