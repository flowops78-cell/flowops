/** Roster / operator labels: display name → stored email → signed-in user email (self) → role + short id. */

import type { AppRole } from './roles';
import { getRoleLabel } from './labels';

export type WorkspaceMemberLabelInput = {
  user_id: string;
  display_name: string | null;
  account_email: string | null;
  /** Used when email/display are missing so dropdowns are not raw UUID prefixes. */
  role?: AppRole | null;
};

export function workspaceMemberDisplayLabel(
  m: WorkspaceMemberLabelInput,
  opts?: { currentUserId?: string | null; currentUserEmail?: string | null },
): string {
  const d = m.display_name?.trim();
  if (d) return d;
  const e = m.account_email?.trim();
  if (e) return e;
  const self = opts?.currentUserEmail?.trim();
  if (opts?.currentUserId && m.user_id === opts.currentUserId && self) return self;
  const role = m.role ? getRoleLabel(m.role) : null;
  const short = `${m.user_id.slice(0, 8)}…`;
  return role ? `${role} · ${short}` : short;
}
