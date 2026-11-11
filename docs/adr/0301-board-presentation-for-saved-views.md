---
type: ADR
id: "0301"
title: "Saved Views can present their notes as a board grouped by one property"
status: active
date: 2026-11-10
---

## Context

[ADR-0144](0144-collections-and-presentations.md) made a Collection carry presentation configuration and named boards as a future presentation: "a board groups notes by a property". Only `list` exists today.

The need is concrete. Task notes carry their state in a `status` property (`backlog`, `this-week`, `in-progress`, `waiting`, `done`), and the only board today is an ASCII rendering produced outside Tolaria. Users who manage work as notes want to see and change that state in one place, without leaving the vault model: the board must stay a view of note properties, not a second data store.

Two facts in the current code shape the decision:

- Saved Views are rewritten on save by typed serializers that know only the current fields. The desktop serializer (`ViewDefinition` in `src-tauri/src/vault/views.rs`) and the mobile writer (`apps/mobile/src/workspace/mobileSavedViews.ts`) both drop unknown keys, so a nested `presentation` block written by hand or by a newer client is erased by the next save from an older surface.
- The relative date grammar for `before`/`after` filters ([ADR-0048](0048-relative-date-expressions-in-view-filters.md)) has no week boundary, so "done this week" cannot be expressed as a filter.

## Decision

**A saved View may declare `presentation.type: board`, which renders its filtered notes as columns grouped by one scalar property; moving a card between columns writes that property on the note through the existing frontmatter update path.** Every surface that rewrites a View preserves its `presentation` block, including surfaces that cannot render it.

```yaml
name: Tasks Board
icon: kanban
filters:
  all:
    - { field: type, op: equals, value: Task }
presentation:
  type: board
  groupBy: status
  properties: [area, due]
  staleAfterDays: 180          # optional, off when absent
  colors: { team: purple, ops: green }   # optional chip colour per value
  columns:
    - { value: backlog,     label: Backlog, max: 5 }
    - { value: this-week,   label: This Week, sort: "property:due:asc" }
    - { value: in-progress, label: In Progress, limit: 5 }
    - { value: waiting,     label: Waiting }
    - { value: done,        label: Done this week, stamp: completed,
        filter: { all: [ { field: completed, op: after, value: "start of week" } ] } }
```

- **`groupBy`**: the property whose value places a card. Only scalar properties are supported; a note with a list value or a wikilink value is not draggable and goes to Other.
- **`columns`**: ordered. `value` matches the property exactly, case-insensitively after trimming. Optional per column:
  - `label`: the column heading.
  - `icon`: an emoji, icon name or image URL shown before the heading (the same values a View's `icon` accepts). Columns without one show a coloured dot.
  - `limit`: a work-in-progress limit, shown as `n/limit`. It warns and never blocks.
  - `max`: the number of cards shown before a "+N more" footer.
  - `sort`: the same grammar as the View's `sort`.
  - `filter`: a filter group applied after the View filter, only for this column.
  - `stamp`: a property set to today's date when a card enters the column and removed when it leaves.
- **Columns omitted**: the board derives one column per distinct value present, in alphabetical order.
- **Other column**: notes whose value matches no column, including notes with no value, appear in an Other column shown only when it is non-empty. Nothing in the View's result set is hidden.
- **`properties`**: the card fields.
- **`colors`**: an optional map from a property value to a chip colour (`blue`, `green`, `orange`, `purple`, `teal`, `pink`, `yellow`, `red`, `gray`), matched case-insensitively. Values without an entry get a stable automatic colour. Unknown colour names are ignored.
- **`staleAfterDays`**: an optional staleness flag. It counts from the date property named by `staleFrom`, such as `added`, and falls back to the note's created date.
- **Layout**: a board View replaces both the note list and the editor with a full-width board. Selecting a card opens a side panel with the note's properties and body, and an action that returns to the normal list and editor layout with that note open.
- **Delivery**: in two phases. Phase 1 is the board, the side panel, and a status control in the panel. Phase 2 adds drag and drop between columns, using the same write path as the status control.

## Options considered

- **Nested `presentation.type: board` on saved Views** (chosen): follows ADR-0144. It reuses the View filter engine, sorting, ordering, sidebar placement, and Git-synced YAML, and adds no new file type or store.
- **`kind: board` at the top level of a View**: rejected in ADR-0144 as vague and overloaded with "view".
- **A separate board file (`boards/*.yml`) with its own filters**: duplicates the View filter engine and sidebar wiring, and splits one concept in two.
- **Derive columns only from the values present**: zero configuration, but column order and empty columns matter for a workflow board (an empty In Progress column is information). Kept as the fallback when `columns` is absent.
- **A typed Rust `Presentation` enum**: catches malformed YAML at load. Rejected for now: every new presentation would need a Rust change, and older desktop or mobile builds would still erase blocks they do not know. Rust keeps the block as an opaque YAML value and the renderer validates it, falling back to `list`.
- **A board-specific `doneWindow` setting instead of a per-column filter**: smaller, but special-cases one workflow. Per-column filters cover it and other cases, such as an "Overdue" column.

## Consequences

- The Rust `ViewDefinition` gains `presentation: Option<serde_yaml::Value>`, written back only when present. The mobile View writer emits a preserved `presentation` block verbatim. Mobile renders board Views as lists until it has a board presentation, but no longer destroys the configuration. Regression tests cover a desktop and a mobile save round-trip of a View with a board block.
- The relative date grammar of ADR-0048 gains `start of week` (Monday 00:00 UTC) and `start of month` in both the Rust and TypeScript parsers, so a Done column can mean "this week". This extends ADR-0048 without changing existing expressions.
- Moving a card is a note save: it goes through `update_frontmatter` / `delete_frontmatter_property`, so the vault watcher, Git autocommit and external-change refresh behave as they do for a property edited in the Properties panel. `stamp` makes one move write two properties. Both writes must succeed or the card snaps back and a toast explains why.
- Column membership is computed from the in-memory vault index, so a board stays as fast as the list for the same View. Statistics that need Git history (days in a status) are not provided.
- No View editor UI ships with phase 1. Board Views are created by editing YAML, or by the AI agent. A presentation editor in the Create/Edit View dialog is follow-up work.
- Keyboard: cards are focusable buttons. Arrow keys move focus within and across columns, and the status control in the side panel is the keyboard path to move a card, so drag and drop is never the only path.
- Revisit this decision when a second non-list presentation (calendar, table) lands. That is the point ADR-0144 sets for designing a shared presentation host and any plugin surface.
