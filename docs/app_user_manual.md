# Flow Ops End-User Manual

This guide is for daily users of Flow Ops (admins, operators, and viewers).
It explains how to use the app in normal operations.

---

## 1) Quick Start

1. Open Flow Ops.
2. Sign in with your assigned login ID and password.
3. Use the left navigation (or mobile dock). **Admins** see the full set; **operators and viewers** typically see **Activities** and **Team** only (other areas redirect to Activities until you have admin access).
   - **Overview** — workspace dashboard (admin)
   - **Activities** — activity list and live operations
   - **Entities** — contacts / counterparties (admin)
   - **Channels** — reserve accounts and flow tracking (admin)
   - **Network** — network profiles linked to entities (admin)
   - **Team** — roster and logs
   - **Settings** — access and workspace configuration (admin)

If you do not have access yet, use **Request access** on the sign-in page.

For plain-language definitions (activity vs record vs channel), see [glossary.md](glossary.md).

---

## 2) Roles (What You Can Do)

### Admin / Operator

- Can run activities and update activity status
- Can perform flow actions (costs, reserve increases/decreases, contact operations)
- Can audit activities
- Admin reviews and approves access requests
- Operators can submit deferred entries and output requests
- Admin approves sensitive pending outputs, deferred entries, and alignments
- Can use diagnostics and audit tools

### Viewer

- Read-only access for monitoring and reporting
- Cannot perform value or auditing actions

---

## 3) Navigation Overview

- **Overview**: Operational snapshot and value summary (admin)
- **Activities**: Activity list, detail, and live event management
- **Channels**: Reserve actions, totals, and pending entry tracking (admin)
- **Entities**: Entity profiles and relationship tracking (admin)
- **Network**: Network profiles and linked entities (admin)
- **Team**: Operating team roster and activity logs
- **Settings**: System preferences and access control (admin)

---

## 4) Keyboard Shortcuts

### Global

- `Shift + F` → Toggle focus fullscreen
- `?` → Open shortcut help
- `Esc` → Exit focus/help
- `Arrow Up` → Scroll to top

### Global navigation (single key, when not typing in a field)

Admin routes:

- `B` → Overview (Dashboard)
- `A` → Activities
- `P` → Entities
- `C` → Network
- `V` → Channels
- `T` → Team
- `S` → Settings

Operators and viewers: `B`, `A`, `P`, `C`, `V`, and `S` go to **Activities** (home); `T` still opens **Team**.

### Global create (`N` then …)

- `N` then `A` → Create activity
- `N` then `E` → Add entry (uses active activity when possible)
- `N` then `V` → Add reserve account (admin; opens Channels)
- `N` then `P` → Add entity (admin)
- `N` then `M` → Create team member

### Section tabs

- `Arrow Right` / `Arrow Left` → Move between tabs in multi-tab pages (same as in-app shortcut help)

---

## 5) Operations Workflow

## 5.1 Overview (Dashboard)

Use this for quick business visibility.

Typical use:

1. Open **Overview** (Dashboard).
2. Review totals, active logs, and trend cards/charts.
3. Move into **Channels** or **Entities** for detailed actions.

## 5.2 Channels (reserve accounts)

Use **Channels** for flow movement and pending entry tracking.

Main actions:

- Add inflow/outflow entries
- Track channels and method totals
- Review pending deferred-entry requests
- Approve or reject deferred entries before they become live adjustments
- Add live deferred entries when immediate admin action is required
- Delete operations where allowed
- Archive/unarchive and bulk archive

Recommended flow:

1. Record each value movement immediately.
2. Submit deferred tracking lines for admin approval when value is still pending.
3. Review unresolved total mismatches.
4. Archive historical entries when fully settled.

## 5.3 Entities

Use **Entities** to manage partner (entity) details.

Main actions:

- Add/edit profiles
- Track unit associations
- Delete records where allowed
- Archive/unarchive
- Filter by type/date/search

---

## 6) Activities

## 6.1 List and lifecycle

Use **Activities** to create and manage specific blocks.

Main actions:

- Create activity (date, platform, details)
- Open activity detail
- Review active and closed activities
- Delete activity (if needed)

Lifecycle:

- `scheduled` → `active` → `closed` → `alignd` / `completed`

## 6.2 Activity Detail (Live Screen)

This is the main operating screen.

Main actions:

- Add Units to the activity
- Record inputs and running totals
- Submit deferred tracking requests (admin/operator)
- Manage active allocations 
- Record output requests
- Update operating metrics (costs, operators, rates)
- Close/align activity when totals align

Important:

- Alignd activities are locked for edits.
- Always check discrepancy variance before alignment.

---

## 7) Team Workspace

Use Team for roster and operating block logs.

Tabs:

- **Roster**
- **Logs**

Main actions:

- Add/edit/delete team members
- Set incentive parameters (rate/monthly/none)
- Start / Stop logs
- Review duration metrics and value history
- Search team records

Recommended flow:

1. Maintain active roster.
2. Start log at shift initialization.
3. Stop log at shift termination.
4. Validate calculated metrics.

---

## 8) Settings

Contains operational security controls.

Main actions:

- Review role and permission summary
- Review/approve/reject access requests (admin only)
- Review/approve/reject pending outputs, deferred entries, and alignments (admin only)
- Wipe Data (admin only)

---

## 9) Daily Runbook (Recommended)

## Start of day

1. Sign in.
2. Review pending Account Requests in Settings.
3. Check today’s scheduled activities.

## During operations

1. Open active Activity in Detail view.
2. Record unit entries/flows in real time.
3. Track reserve (**Channels**) activity, pending entries, and entity updates.
4. Track team member logs.

## End of activity

1. Finalize unit totals.
2. Verify discrepancy variance is resolved.
3. Close/align activity (admin/operator).

## End of day

1. Export required reports (CSV) in Settings.
2. Review key audit entries and unresolved items.

---

## 10) Troubleshooting

## I cannot sign in

- Recheck login ID and password.
- Use **Request access** if you do not have an approved account.
- If recently approved, use the initial password set during approval.

## Buttons are disabled for me

- Your role may be `viewer`.
- Admin/operator permissions are required for value and alignment actions.

## Data seems out of date

- Refresh the page to re-sync the real-time tunnel.
- Report persistent issues to your admin.

---

## 11) Good Operating Habits

- Record actions immediately (don’t batch from memory).
- Align every activity before day-end closure.
- Export reports at a consistent schedule.
- Avoid shared accounts; use your own assigned login ID.
