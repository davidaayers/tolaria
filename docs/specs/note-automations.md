# Note automations (draft spec)

Status: **draft for review, not implemented.** Supersedes the earlier `note-hooks.md` draft (renamed; scripts added; built-in `append` removed).

## Problem

Moving a card on a board, or editing a property, changes one note. Many workflows want that change to have a second effect elsewhere in the vault, for example "when a task becomes `done`, stamp `completed` and record it in today's journal". Those second effects are specific to a person's vault layout, so the app should not hard-code them.

Today the only attachable effect is the board column `stamp` (ADR-0301), which writes to the same note and nothing else. Anything more has to be done by hand or by an outside tool, which does not run when the change is made in the app.

## Goals

- An **automation** is a vault file that says: when *this* happens to a note, do *these* things.
- Plain YAML in the vault, versioned with it and hand-editable, like saved Views.
- The same automation fires whether the change came from the Properties panel, a board drag or the board "Move to column" action.
- The app provides the event and a safe way to run a user's own script. It does not know about journals, weeks or any other personal convention.
- Opening a cloned or downloaded vault must never run anything without the user's explicit approval.
- Reuse existing concepts: the saved-View filter language for "which notes", the existing frontmatter write path for simple writes.

## Non-goals (v1)

- Reacting to changes made outside the app (Claude, git, another editor). The file watcher cannot know the previous value.
- Running on mobile. Mobile edits do not fire automations in v1.
- An in-app editor for automations. They are authored as files.
- Triggers other than "a property changed".
- Built-in actions that edit other notes. A script does that.

## File format

Automations live in `automations/*.yml` at the vault root, next to `views/`.

```yaml
name: Finish task
on:
  property: status          # required: the property that changed
  to: done                  # optional: new value must equal this (scalar or list)
  from: [in-progress, waiting]   # optional: old value must be one of these
when:                       # optional: saved-View filter, evaluated on the note after the change
  all:
    - { field: type, op: equals, value: Task }
do:
  - set: { completed: "{{today}}" }
  - remove: waiting_on
  - run: [/usr/bin/python3, -I, .claude/lib/tasknote.py, journal-link, "{{note.path}}", --today, "{{today}}"]
    timeout: 20
```

### Triggers (`on`)

| Key | Meaning |
|---|---|
| `property` | Property name, matched case-insensitively. Built-ins `status` and `type`/`isA` follow the same aliasing as View filters. |
| `to` | Optional. New value must match one. |
| `from` | Optional. Old value must match one. An absent old value matches `null`. |

It fires only when the value actually changed (`old != new`).

### Condition (`when`)

The `filters` block of a saved View, unchanged, evaluated against the note after the change.

### Actions (`do`)

Run in order.

| Action | Effect |
|---|---|
| `set: {key: value}` | Write one or more properties on the changed note. |
| `remove: key` (or list) | Delete properties from the changed note. |
| `run: [argv...]` | Run a program. See below. |

### `run`

- **Argv list, no shell.** `run` is a list: the executable, then its arguments. Nothing is passed through `sh -c`, so there is no quoting, globbing or injection through note titles.
- **Working directory** is the vault root.
- **Executable.** The first element must be an **absolute path** to the program. There is no `PATH` lookup: an app launched from Finder or the Dock does not inherit the shell's `PATH`, so a bare name such as `python3` would resolve differently than in a terminal. Arguments may be vault-relative (the working directory is the vault root), so scripts stored in the vault work as `[/usr/bin/python3, scripts/x.py]`.
- **Templating** applies to each argument separately. A variable expands inside one argument and never splits it.
- **Environment** adds `TOLARIA_VAULT`, `TOLARIA_NOTE_PATH`, `TOLARIA_PROPERTY`, `TOLARIA_OLD` and `TOLARIA_NEW`, so a script need not parse arguments.
- **Timeout** defaults to 30 s (`timeout:` in seconds, maximum 120). On timeout the process is killed.
- **Result.** Exit 0 is success. Any other exit, timeout or failure to start is a failure; the last lines of stderr go in the toast.
- **Message.** On success, the first non-empty line of standard output (truncated to 200 characters) is shown in the toast in place of the generic `Automation "X" ran`. A script with no output gets the generic toast. Nothing else in stdout is interpreted.
- **One at a time.** Runs are serialized per vault so two quick drags cannot interleave script writes.

### Template variables

`{{today}}` (ISO date), `{{today:FORMAT}}`, `{{now}}`, `{{note.title}}`, `{{note.filename}}`, `{{note.path}}` (absolute), `{{note.relpath}}` (vault-relative), `{{old}}`, `{{new}}`, `{{prop.NAME}}`. An unknown variable fails the action instead of passing the literal text.

## Trust

`set` and `remove` only change the note the user just changed, so they need no approval. **Any automation containing a `run` action is inert until the user approves it.**

- The first time such an automation would fire, Tolaria shows a dialog with the automation's name, the exact `run` command(s), and **Allow** or **Don't run**. It names the vault so the user knows which one is asking.
- Approval is stored in the app's own settings, **outside the vault**, as `{vault path → set of SHA-256 hashes of approved automation files}`. A vault cannot approve itself.
- Approval is **per file**, keyed by a hash of its contents. Editing the file withdraws approval; the dialog appears again on the next trigger and simply shows the current command.
- "Don't run" is remembered for that file version too, so the user is not asked on every drag. The automation stays listed as disabled.
- Opening a vault runs nothing. Only a user-made change in the app can trigger an automation.
- A global setting turns automations off entirely.

What `run` can do once approved is whatever the user's account can do; the trust dialog and the shown command are the control, as with git hooks or a VS Code task.

## Execution semantics

1. **Event:** one event per user action, emitted after *all* of that action's writes succeeded. A board move that writes `status` and `completed` is one event; `on.property` matches if it is in that set.
2. **Selection:** every approved, matching automation runs, in filename order.
3. **No cascading:** writes made by an automation (including a script's file changes, which the watcher reloads) do not emit events. v1 loop guard.
4. **Failure:** actions stop at the first failure. Earlier actions are not rolled back, matching board moves. A toast names the automation and the action that failed. The triggering change stays.
5. **Persistence:** `set`/`remove` go through the existing frontmatter path, so the vault watcher, Git autocommit and external-change refresh behave as for any edit. A script's own writes are picked up by the same watcher.
6. **Feedback:** a toast, `Automation "Finish task" ran`, or the script's own message, so the user can tell it fired.

## Where it runs

- **Detection, matching, templating and `set`/`remove`:** the renderer, in one place that all in-app property writes pass through, because the filter evaluator and View loading already live in TypeScript and `when` needs the full entry. A `useNoteAutomations` hook loads `automations/*.yml`, watches them like Views, and exposes `runAutomations(change)`.
- **`run`:** a new Tauri command in Rust that validates the vault, resolves the executable, spawns it with a timeout and returns exit status and the tail of stderr. The renderer never builds a shell string.
- **Trust store:** Rust-side settings, read through an existing settings command.
- The board move path (`applyBoardMovePlan`), the Properties panel and any bulk property edit must each report their change to the hook. Enumerating every in-app write path is the main implementation risk and the first spike task.

## Interaction with existing features

- **Board `stamp`:** becomes a special case (`on: status to: <value>`, `set: completed`). Left as is in v1 so ADR-0301 stays untouched.
- **Saved Views:** automation files are not Views and are hidden from View listings. Views are rewritten by typed serializers that drop unknown keys (ADR-0301), so automations live in separate files that no app surface rewrites.
- **Mobile:** does not run automations. Files sync like any vault file.
- **Undo:** none, as for board moves.

## Analytics

One PostHog event, `note_automation_ran`, with counts only (actions run, whether a script was used, success or failure). No note titles, paths, hook names or command text.

## Example: the author's finish-task workflow

The journal rule stays in the user's script (`tasknote.py`), not in Tolaria:

```yaml
name: Finish task
on: { property: status, to: done }
when: { all: [ { field: type, op: equals, value: Task } ] }
do:
  - run: [/usr/bin/python3, -I, .claude/lib/tasknote.py, journal-link, "{{note.path}}", --today, "{{today}}"]
```

`tasknote.py` needs a small idempotent `journal-link` subcommand, built from its existing `add_journal_link`. It prints one line such as `Linked "Write report" in journal 2026-11-12`, which becomes the toast. (In the real file the executable is written as an absolute path, e.g. `/usr/bin/python3`.)

## Decisions taken

- Scripts are supported; journal-specific behaviour is not built in (author's call).
- Detection in the renderer, process execution in Rust (recommended).
- Name: **Automation**, `automations/` folder.
- Trust is per file hash (author: "whatever you recommend, don't go overboard").
- Executables must be absolute paths; no `PATH` resolution (author's call).
- A script's first stdout line becomes the toast message (author's idea, adopted).

## Open questions

1. **Script output beyond the toast.** Should a script be able to return changed paths so the UI can reselect or refresh them, or is the watcher enough? (v1: watcher.)
2. **Batching.** Bulk-editing 20 notes fires 20 events and 20 script runs. Debounce, or a batch event with all paths?
3. **Cascading.** Is "no cascading" too limiting? A depth limit of 1 or 2 is the usual alternative.
4. **Visibility.** Should Tolaria list automations and their approval state (Settings or sidebar) so users can see what is active and re-approve? Without it, a declined automation is silent.
5. **Upstream fit.** This runs user programs from the app, so it needs an ADR and the owner's view on the roadmap before much code is written.
