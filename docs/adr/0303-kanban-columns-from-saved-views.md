---
type: ADR
id: "0303"
title: "Kanban columns can be driven by saved Views"
status: active
date: 2026-11-17
Platform: desktop
---

## Context

ADR 0301 registered Kanban with columns taken from the distinct values of one `groupBy` property, and ADR 0302 made it own the workspace. That model has no way to say "Done, but only this week", to show an empty column before any note uses it, or to give one column a different rule from another: every note with `status: done` stays in Done forever.

Saved Views already describe a name, icon, colour, filter and sort. A column that is a saved View reuses all of it, and the sidebar and the board describe a status once.

## Decision

This ADR extends ADR 0301 and 0302; the registry, shell, file formats and `groupBy` mode stay as they are.

A saved View's Kanban `presentation` may carry an ordered `columns` list. When it is non-empty it replaces `groupBy`.

```yaml
presentation:
  type: kanban
  properties: [due, area]
  columns:
    - { view: backlog.yml, show: 5 }
    - { view: in-progress.yml, wipLimit: 3 }
    - { view: done-this-week.yml, stamp: completed }
```

- **Columns are saved Views.** The heading, icon, colour, filter and sort come from the referenced View. Order is the order of the list, and dragging a column header rewrites it. A bare filename is shorthand for `{ view: <filename> }`.
- **Membership.** A note is in a column when it is in the board View's result and matches the column View. It shows in every column it matches, and in an **Other** column, shown only when non-empty, when it matches none. Nothing in the board View's result is hidden.
- **Per column**, only what is about the board: `wipLimit` (shown as `n/limit`, warns, never blocks), `show` (cards shown before a "+N more" footer; the count is unchanged) and `stamp` (a property set to today's local date when a card enters the column and removed when it leaves).
- **Missing View.** The column stays in place, labelled "(View not found)", and cannot receive cards. The board View is never its own column. When several vaults define the same filename, the board's own vault wins.
- **Moving a card** writes each condition of the target View that the note does not already meet, through the normal frontmatter handlers, one edit at a time. Only plain `equals` conditions on a writable property can be written. A drop is refused, and the column is dimmed while dragging, when the target View uses an `any` group, a nested group, another operator, a relationship or built-in field, or when the writes would not make the note match. The result is checked before anything is written. A failed write snaps the card back.
- **New cards.** A column that a card can be written into has a **+** button. The new note is created with the board View's `equals` conditions, the column View's `equals` conditions and the column's `stamp` as initial frontmatter, so it lands in that column. It is created without opening it. `planViewColumnCreate` returns nothing, and the column has no button, for the same columns that refuse drops, and when the result would not match both the column View and the board View. Note creation accepts `initialProperties` (they win over the type's instance defaults) and `openTab: false`.
- **Card chips.** `KanbanCardFace` renders metadata through `KanbanCardChips`: plain values become coloured chips (a stable colour per value), due-style properties (`due`, `deadline`) show urgency ("3d overdue", "Due tomorrow"), and lists and links stay on the shared `PropertyChips`. It applies to group-by and View-column boards alike.
- **Only saved Views.** Type, folder and built-in collections ignore `columns`, because the columns reference other Views. They keep `groupBy`.
- **Layout switching** stashes `columns` with the rest of the Kanban settings, so List and back loses nothing, and rewrites keep unknown keys of the `presentation` block.
- **Date filters.** A "Done this week" View needs `start of week` and `start of month` in `before` and `after` filters (Monday 00:00; UTC in Rust, local time in the frontend). `after` is inclusive for these two values, so a date-only note on Monday itself is "after start of week"; `before` and every other `after` value stay strict.

## Consequences

- A Done column can be bounded by its own View without hiding anything from the other columns.
- Card drag ids include the column, because one note can appear in several columns.
- There is no editor for `columns` yet: they are written in the View YAML, or by the AI agent. Reordering by drag is the only UI that writes them.
- Existing `groupBy` boards, layout files and the `kanbanConfig` stash are unchanged. Rust keeps `presentation` and layout files as opaque values, so older builds keep the block but render a List.

## Alternatives

- Per-column filters inside the board config were rejected: they duplicate the View filter engine and drift from the sidebar.
- Filtering the whole board View (for example `status != done OR completed after start of week`) works with `groupBy` but applies one rule to every column.
- An `on_or_after` operator was rejected for now: it needs schema, UI and mobile changes, and "after start of week" already reads as "this week so far".
