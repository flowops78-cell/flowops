export type AppRole = 'admin' | 'operator' | 'viewer';
export type DbRole = 'admin' | 'operator' | 'viewer';

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

export const appRoleToDbRole = (role: AppRole): DbRole => {
  return role;
};

export const dbRoleToAppRole = (role: unknown): AppRole => {
  const normalized = normalizeDbRole(role);
  return normalized || 'viewer';
};
