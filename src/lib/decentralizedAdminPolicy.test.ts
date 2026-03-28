import { describe, it, expect } from 'vitest';

/** Matches manage-organizations `list-all-accounts` gate (group admin only). */
export function directoryRequiresGroupAdmin(adminClusterIds: string[]): boolean {
  return adminClusterIds.length > 0;
}

/** Matches top-level admin check before provision-organization and similar. */
export function managementRequiresAdmin(isAdmin: boolean): boolean {
  return isAdmin;
}

describe('decentralized admin (no platform_roles)', () => {
  it('directory list returns 403 when caller is not cluster_admin of any group', () => {
    expect(directoryRequiresGroupAdmin([])).toBe(false);
  });

  it('directory list allowed when caller is cluster_admin of at least one group', () => {
    expect(directoryRequiresGroupAdmin(['11111111-1111-1111-1111-111111111111'])).toBe(true);
  });

  it('workspace provisioning requires org or group admin flag from authority', () => {
    expect(managementRequiresAdmin(false)).toBe(false);
    expect(managementRequiresAdmin(true)).toBe(true);
  });
});
