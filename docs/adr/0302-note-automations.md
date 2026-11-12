---
type: ADR
id: "0302"
title: "Vault-defined automations react to a property change and may run an approved script"
status: proposed
date: 2026-11-12
---

## Context

A property edit changes one note, but workflows often need a second effect elsewhere: "when a task becomes `done`, stamp `completed` and record it in today's journal". Those effects depend on the user's own vault layout, so the app cannot hard-code them. The only attachable effect today is a board column `stamp` ([ADR-0301](0301-board-presentation-for-saved-views.md)), which writes to the same note and nothing else.

Facts in the current code that shape the decision:

- Every in-app property edit (Properties panel, board drag, "Move to column", note-width and type retargeting) goes through one function, `runFrontmatterOp` in `src/hooks/useNoteActions.ts`, which calls `update_frontmatter` / `delete_frontmatter_property`. One place can observe all of them.
- Saved Views are rewritten by typed serializers that drop unknown keys (see ADR-0301), so new vault-defined behaviour must not live inside a View file.
- The filter language for "which notes" already exists and is evaluated in the renderer.
- Vaults are cloned and shared. Anything that executes code from a vault file is a security boundary.

## Decision

**A vault may contain `automations/*.yml` files. Each names a property change (`on`), an optional saved-View filter (`when`), and a list of actions (`do`): `set`, `remove`, and `run`. A `run` action starts a program the user has approved; nothing runs without that approval.**

```yaml
name: Finish task
on: { property: status, to: done }
when: { all: [ { field: type, op: equals, value: Task } ] }
do:
  - set: { completed: "{{today}}" }
  - run: [/usr/bin/python3, -I, .claude/lib/tasknote.py, journal-link, "{{note.path}}"]
```

- **Trigger.** A user-made, in-app change of one property, with optional `from`/`to` values. Changes made by an automation do not trigger automations (no cascading). Changes made outside the app are not observed.
- **Events are batched per note.** Writes to one note within a short window (150 ms) are merged into one event, so a board move that writes `status` and `completed` fires once. The merged event carries the first old value and last new value of each key.
- **`run` is an argv list with no shell.** The first element must be an absolute path. Arguments are templated one by one. The working directory is the vault root; `TOLARIA_*` environment variables describe the event. A timeout (default 30 s, maximum 120 s) kills the process. On success, the first non-empty stdout line becomes the toast.
- **Approval is per file content.** An automation with a `run` action is inert until the user approves it in a dialog showing the exact command. The approval is stored in Tolaria's app configuration directory, outside the vault, as the SHA-256 of the file. Editing the file withdraws approval. A declined file is remembered as declined for that hash.
- **Execution happens in two places.** The renderer detects changes, matches, templates and applies `set`/`remove` through the existing frontmatter path. A new Rust module owns reading `automations/`, the trust store and process spawning, and exposes them as Tauri commands.
- **Failure** stops the action list at the first failed action and shows a toast. Earlier actions are not rolled back, as with board moves.

## Options considered

- **Executable action with an approval gate** (chosen): the app stays generic, user logic lives in user scripts, and the approval gate bounds the risk — more surface (process spawning, trust store) than the alternatives.
- **Built-in `append`/journal actions only**: no code execution, but each user's note conventions (daily file, sections per day) would have to be modelled in the app, and they differ per vault.
- **Column-level `onEnter` script on the board**: smallest change, but it solves only board drags, not the Properties panel, and puts command execution inside View files that older clients rewrite.
- **External watcher or git hook in the vault**: needs no app changes, but cannot see the previous value, runs after the autocommit rather than with the edit, and does not exist for users who do not already script their vault.
- **Run through `sh -c`**: familiar syntax, rejected because note titles and property values would reach the shell.

## Consequences

- The app can run a program on the user's machine because of a vault file. Mitigations are the content-hash approval outside the vault, the visible command, absolute executable paths, no shell, a timeout, and no execution when a vault is merely opened. What an approved script does remains the user's responsibility.
- Mobile does not run automations in v1; mobile edits do not fire them. Automation files sync like any vault file.
- `stamp` stays as it is. It is conceptually a special case and may be re-expressed as an automation later.
- Batching means an automation fires about 150 ms after the last write, not synchronously with it.
- Bulk edits fire one event, and so one script run, per note.
- New files: `src-tauri/src/automation/` and `src/automations/`. New Tauri commands: `list_automations`, `run_automation_command`, `get_automation_trust`, `set_automation_trust`.
- PostHog gets one event, `note_automation_ran`, with counts and a script-used flag only.
- Re-evaluate when a second trigger (note created, moved, archived) or mobile support is wanted.
