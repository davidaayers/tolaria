# Build Custom Views

Custom views are saved filters for recurring questions.

## Good View Candidates

- Active projects.
- People without a recent follow-up.
- Drafts ready for review.
- Notes changed this week.
- Events in a date range.

## View Definition

Saved views live as files in the vault. They describe filters, sorting, and visible columns using structured data.

## Filters

Custom views can use nested conditions, similar to Notion or Airtable filter groups. Combine `all` and `any` logic when a view needs to answer a more precise question than a single field filter can express.

Date filters support dynamic natural-language values such as `today`, `yesterday`, or `one week ago`. Use these for views that should keep moving over time, such as recent work, stale follow-ups, or upcoming events. `start of week` (Monday) and `start of month` are also supported. `after start of week` includes notes dated on Monday itself, so a "Done this week" view can use `completed after start of week`.

## Kanban Boards From Views

A saved view can show its notes as a Kanban board. Switch the layout from the layout menu in the note-list header. By default each column is one value of a property (`groupBy`). To make each column a saved view instead, add a `columns` list to the board view's `presentation`:

```yaml
presentation:
  type: kanban
  columns:
    - { view: backlog.yml, show: 5 }
    - { view: in-progress.yml, wipLimit: 3 }
    - { view: done-this-week.yml, stamp: completed }
```

Each column takes its name, icon, colour, filter and sort from its view. `show` caps how many cards a column lists, `wipLimit` shows `count/limit` and warns when it is exceeded, and `stamp` sets a date property to today when a card enters the column. A card appears in every column whose view it matches, and notes that match none appear in an Other column. Dropping a card into a column writes whatever that column's view requires; columns whose view cannot be satisfied by setting properties dim while you drag.

## Design The Question First

Before creating a view, write the question it answers. A good view is not "all fields with all filters"; it is a focused lens.
