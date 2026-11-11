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

**A saved View may declare `presentation.type: board`, which renders its filtered notes as columns, one column per referenced saved View; moving a card into a column writes whatever that column's View requires on the note, through the existing frontmatter update path.** Every surface that rewrites a View preserves its `presentation` block, including surfaces that cannot render it.

```yaml
name: Tasks Board
icon: kanban
filters:
  all:
    - { field: type, op: equals, value: Task }
presentation:
  type: board
  properties: [area, due]
  staleAfterDays: 180          # optional, off when absent
  colors: { team: purple, ops: green }   # optional chip colour per value
  columns:
    - { view: tasks-backlog.yml, max: 5 }
    - { view: tasks-this-week.yml, limit: 5 }
    - { view: tasks-in-progress.yml, limit: 3 }
    - { view: tasks-waiting.yml }
    - { view: tasks-done-this-week.yml, stamp: completed }
```

- **Columns are saved Views.** A column's heading, icon, colour, filter and sort all come from the referenced View, so the board and the sidebar describe a status once. `columns` is required and ordered; a bare filename is shorthand for `{ view: <filename> }`. A board with no valid column falls back to `list`.
- **Membership**: a note is in a column when it is in the board View's result and matches the column View's filter. It appears in every column it matches, and in an **Other** column (shown only when non-empty) when it matches none. Nothing in the board View's result set is hidden.
- **Per column** the board adds only what is about the board, not the View:
  - `limit`: a work-in-progress limit, shown as `n/limit`. It warns and never blocks.
  - `max`: the number of cards shown before a "+N more" footer.
  - `stamp`: a property set to today's date when a card enters the column and removed when it leaves.
- **Missing View**: a column whose View does not exist stays in place, labelled with the filename and "View not found", and cannot receive cards. The board View never serves as one of its own columns. When several vaults define the same filename, the board's own vault wins.
- **Moving a card** sets each condition of the target View that the note does not already meet, and only plain `equals` conditions on a writable property can be set. For `type = Task AND status = done` and a note that is already a Task, only `status` is written. A move is refused, and the column is view-only for that note, when the target View uses an `any` group, a nested group, any other operator, a relationship field, or a built-in field such as `title` or `archived`, or when the writes would not make the note match the View. The result is checked before anything is written.
- **`properties`**: the card fields.
- **`colors`**: an optional map from a property value to a chip colour (`blue`, `green`, `orange`, `purple`, `teal`, `pink`, `yellow`, `red`, `gray`), matched case-insensitively. Values without an entry get a stable automatic colour. Unknown colour names are ignored.
- **`staleAfterDays`**: an optional staleness flag. It counts from the date property named by `staleFrom`, such as `added`, and falls back to the note's created date.
- **Layout**: a board View replaces both the note list and the editor with a full-width board. Selecting a card opens a side panel with the note's properties and body, and an action that returns to the normal list and editor layout with that note open.
- **Delivery**: in two phases. Phase 1 is the board, the side panel, and a column control in the panel. Phase 2 adds drag and drop between columns, using the same write path as the column control.

## Options considered

- **Nested `presentation.type: board` on saved Views** (chosen): follows ADR-0144. It reuses the View filter engine, sorting, ordering, sidebar placement, and Git-synced YAML, and adds no new file type or store.
- **Columns as saved Views** (chosen over columns as values of one property): a column's name, icon, colour, filter and sort already exist on a View, and keeping them in two places drifts. The cost is that a card can sit in several columns or none, and a move has to be derived from the target View's filter instead of being one property write.
- **Columns as values of a `groupBy` property**: a card is always in exactly one column and a move is one write, but every column needs its own label, icon, colour, sort and filter, which duplicates the View model. It was built first and replaced.
- **`kind: board` at the top level of a View**: rejected in ADR-0144 as vague and overloaded with "view".
- **A separate board file (`boards/*.yml`) with its own filters**: duplicates the View filter engine and sidebar wiring, and splits one concept in two.
- **A typed Rust `Presentation` enum**: catches malformed YAML at load. Rejected for now: every new presentation would need a Rust change, and older desktop or mobile builds would still erase blocks they do not know. Rust keeps the block as an opaque YAML value and the renderer validates it, falling back to `list`.

## Consequences

- The Rust `ViewDefinition` gains `presentation: Option<serde_yaml::Value>`, written back only when present. The mobile View writer emits a preserved `presentation` block verbatim. Mobile renders board Views as lists until it has a board presentation, but no longer destroys the configuration. Regression tests cover a desktop and a mobile save round-trip of a View with a board block.
- The relative date grammar of ADR-0048 gains `start of week` (Monday 00:00 UTC) and `start of month` in both the Rust and TypeScript parsers, so a "Done this week" View can filter on it. This extends ADR-0048 without changing existing expressions.
- Moving a card is a note save: it goes through `update_frontmatter` / `delete_frontmatter_property`, so the vault watcher, Git autocommit and external-change refresh behave as they do for a property edited in the Properties panel. `stamp` makes one move write more than one property. Both writes must succeed or the card snaps back and a toast explains why.
- Column membership is computed from the in-memory vault index, so a board stays as fast as the list for the same Views. Statistics that need Git history (days in a status) are not provided.
- Editing or deleting a column's View changes the board. Renaming its file leaves a "View not found" column until the `view:` reference is updated.
- No View editor UI ships with phase 1 for the board block itself. Board Views are created by editing YAML, or by the AI agent, while the columns can be edited in the existing View dialog. A presentation editor in the Create/Edit View dialog is follow-up work.
- Keyboard: cards are focusable buttons. The column control in the side panel is the keyboard path to move a card, so drag and drop is never the only path.
- Revisit this decision when a second non-list presentation (calendar, table) lands. That is the point ADR-0144 sets for designing a shared presentation host and any plugin surface.
