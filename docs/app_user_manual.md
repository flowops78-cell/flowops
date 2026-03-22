# Flow Ops End-User Manual

This guide is for daily users of Flow Ops (admins, operators, and viewers).
It explains how to use the app in normal operations.

---

## 1) Quick Start

1. Open Flow Ops.
2. Sign in with your assigned login ID and password.
3. Use the left navigation (or mobile dock) to open:
   - **Dashboard**
   - **Activity**
   - **Reserve**
   - **Contacts**
   - **Team**
   - **Config**

If you do not have access yet, use **Request access** on the sign-in page.

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

- **Dashboard**: Operational snapshot and value summary
- **Activity**: Activity records, Units overview, and live event management
- **Reserve**: Reserve actions, totals, and pending entry tracking
- **Contacts**: Profiles and relationship tracking
- **Team**: Operating team roster and activity logs
- **Config**: System preferences and access control

---

## 4) Keyboard Shortcuts

### Global

- `Shift + F` → Toggle focus fullscreen
- `?` → Open shortcut help
- `Esc` → Exit focus/help
- `Arrow Up` → Scroll to top

### Global Navigation (G then ...)

- `G then D` → Dashboard
- `G then A` → Activity
- `G then T` → Reserve
- `G then M` → Team
- `G then S` → Config

### Global Create (C then ...)

- `C then A` → Create activity
- `C then E` → Record entry
- `C then C` → Add account
- `C then M` → Create member

### Section Tabs

- `Arrow Right` / `Arrow Left` → Move between tabs in multi-tab pages

---

## 5) Operations Workflow

## 5.1 Dashboard

Use this for quick business visibility.

Typical use:

1. Open **Dashboard**.
2. Review totals, active logs, and trend cards/charts.
3. Move into Reserve/Contacts for detailed actions.

## 5.2 Reserve

Use Reserve for flow movement and pending entry tracking.

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

## 5.3 Contacts

Use this to manage partner details.

Main actions:

- Add/edit profiles
- Track unit associations
- Delete records where allowed
- Archive/unarchive
- Filter by type/date/search

---

## 6) Activity Workspace

## 6.1 Overview

Use Activity to create and manage specific blocks.

Main actions:

- Create activity (date, platform, details)
- Open activity details
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

## 8) Settings Workspace

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
3. Track reserve activity, pending entries, and entity updates.
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
