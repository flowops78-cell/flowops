# Flow Ops — glossary

Short definitions for terms that often get mixed up in conversation and support.

## Activity

A dated operating block (scheduled → active → closed). **Not** the same as a single ledger line or CSV row.

## Record / entry

A ledger line linked to an activity and usually an entity (inflow, outflow, deferred, etc.). Export and audit views refer to these as records.

## Entity

A contact or counterparty profile with balances and tags. Shown in the **Entities** area of the app.

## Channel (reserve account)

A **reserve account** in the **Channels** screen: named bucket for inflow/outflow and method tracking. This is **not** the same as a “network profile” (see below).

## Network profile (`collaborations`)

A **network profile** groups attribution and rules for entities. The database table is `collaborations`. In advanced settings, **profile type** uses stored values such as `channel` in a *historic* sense (reserve/flow routing for that profile)—do not confuse with the **Channels** list.

## Flow label (`channel_label`)

On a record, the optional string that ties movement to a reserve account name or routing label. Related to **Channels**, not to network profiles unless your process explicitly links them.

## Operator vs viewer

- **Operator / admin**: can post records, approve pending items, and change impact data (subject to RLS).
- **Viewer**: read-only; navigation may still show shortcuts, but impact actions are hidden or blocked.
