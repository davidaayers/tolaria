import { describe, expect, it, vi } from 'vitest'
import { makeEntry } from '../test-utils/noteListTestUtils'
import type { AutomationAction, AutomationFile, NoteChangeEvent } from './automationTypes'
import { runAutomationsForEvent, type AutomationDeps } from './automationRun'

const note = makeEntry({ path: '/vault/06-tasks/a.md', title: 'Write report', isA: 'Task', status: 'done', properties: { Owner: 'dave' } })
const event: NoteChangeEvent = { path: note.path, changes: { status: { old: 'doing', new: 'done' } } }

function file(name: string, actions: AutomationAction[], on: Partial<AutomationFile['definition']['on']> = {}): AutomationFile {
  return { filename: `${name}.yml`, hash: `hash-${name}`, definition: { name, on: { property: 'status', to: ['done'], from: [], ...on }, when: null, actions } }
}
const run = (argv: string[]): AutomationAction => ({ kind: 'run', argv, timeoutSeconds: 30 })

function deps(overrides: Partial<AutomationDeps> = {}): AutomationDeps {
  return {
    vaultPath: '/vault',
    today: () => '2026-11-12',
    now: () => '2026-11-12T08:00:00',
    getEntry: () => note,
    setProperty: vi.fn(async () => undefined),
    removeProperty: vi.fn(async () => undefined),
    runCommand: vi.fn(async () => ({ ok: true, message: null, error: null })),
    trust: () => 'approved',
    askTrust: vi.fn(async () => true),
    ...overrides,
  }
}

describe('runAutomationsForEvent', () => {
  it('runs set, remove and run actions in order with templates expanded', async () => {
    const calls: string[] = []
    const d = deps({
      setProperty: async (_p, key, value) => { calls.push(`set ${key}=${value}`) },
      removeProperty: async (_p, key) => { calls.push(`remove ${key}`) },
      runCommand: async ({ argv, env }) => { calls.push(`run ${argv.join(' ')} | ${env.TOLARIA_NEW}`); return { ok: true, message: 'Linked it', error: null } },
    })
    const results = await runAutomationsForEvent([file('finish', [
      { kind: 'set', values: { completed: '{{today}}' } },
      { kind: 'remove', keys: ['waiting_on'] },
      run(['/usr/bin/python3', 'x.py', '{{note.title}}']),
    ])], event, d)
    expect(calls).toEqual(['set completed=2026-11-12', 'remove waiting_on', 'run /usr/bin/python3 x.py Write report | done'])
    expect(results).toEqual([{ name: 'finish', ok: true, message: 'Linked it', error: null }])
  })

  it('skips automations that do not match', async () => {
    const d = deps()
    const results = await runAutomationsForEvent([file('other', [run(['/bin/true'])], { to: ['waiting'] })], event, d)
    expect(results).toEqual([])
    expect(d.runCommand).not.toHaveBeenCalled()
  })

  it('runs matching automations in filename order', async () => {
    const order: string[] = []
    const d = deps({ setProperty: async (_p, key) => { order.push(key) } })
    await runAutomationsForEvent([file('b', [{ kind: 'set', values: { second: 1 } }]), file('a', [{ kind: 'set', values: { first: 1 } }])], event, d)
    expect(order).toEqual(['first', 'second'])
  })

  it('stops an automation at its first failing action, and still runs the next automation', async () => {
    const d = deps({ runCommand: vi.fn(async () => ({ ok: false, message: null, error: 'exit 2: boom' })) })
    const results = await runAutomationsForEvent([
      file('a', [run(['/bin/false']), { kind: 'set', values: { never: 1 } }]),
      file('b', [{ kind: 'set', values: { later: 1 } }]),
    ], event, d)
    expect(results).toEqual([{ name: 'a', ok: false, message: null, error: 'exit 2: boom' }, { name: 'b', ok: true, message: null, error: null }])
    expect(d.setProperty).toHaveBeenCalledTimes(1)
  })

  it('turns a thrown error, such as an unknown template variable, into a failed result', async () => {
    const d = deps()
    const results = await runAutomationsForEvent([file('bad', [{ kind: 'set', values: { x: '{{nope}}' } }])], event, d)
    expect(results).toEqual([{ name: 'bad', ok: false, message: null, error: 'Unknown automation variable: nope' }])
  })

  it('does not ask or run for an automation with run while it is declined', async () => {
    const d = deps({ trust: () => 'declined' })
    const results = await runAutomationsForEvent([file('a', [run(['/bin/true'])])], event, d)
    expect(results).toEqual([])
    expect(d.askTrust).not.toHaveBeenCalled()
    expect(d.runCommand).not.toHaveBeenCalled()
  })

  it('asks once for an unknown automation with run, and runs it only when approved', async () => {
    const approved = deps({ trust: () => 'unknown' })
    expect((await runAutomationsForEvent([file('a', [run(['/bin/true'])])], event, approved))[0].ok).toBe(true)
    expect(approved.askTrust).toHaveBeenCalledTimes(1)

    const refused = deps({ trust: () => 'unknown', askTrust: vi.fn(async () => false) })
    expect(await runAutomationsForEvent([file('a', [run(['/bin/true'])])], event, refused)).toEqual([])
    expect(refused.runCommand).not.toHaveBeenCalled()
  })

  it('needs no approval for an automation without run', async () => {
    const d = deps({ trust: () => 'unknown' })
    await runAutomationsForEvent([file('a', [{ kind: 'set', values: { x: 1 } }])], event, d)
    expect(d.askTrust).not.toHaveBeenCalled()
    expect(d.setProperty).toHaveBeenCalledWith(note.path, 'x', 1)
  })

  it('refuses a run whose executable is not an absolute path', async () => {
    const d = deps()
    const results = await runAutomationsForEvent([file('a', [run(['python3', 'x.py'])])], event, d)
    expect(results[0]).toMatchObject({ ok: false, error: 'The first element of run must be an absolute path: python3' })
    expect(d.runCommand).not.toHaveBeenCalled()
  })

  it('passes the event to the script through TOLARIA_ environment variables', async () => {
    const d = deps()
    await runAutomationsForEvent([file('a', [run(['/bin/true'])])], event, d)
    expect(d.runCommand).toHaveBeenCalledWith({
      argv: ['/bin/true'], timeoutSeconds: 30,
      env: { TOLARIA_VAULT: '/vault', TOLARIA_NOTE_PATH: note.path, TOLARIA_PROPERTY: 'status', TOLARIA_OLD: 'doing', TOLARIA_NEW: 'done' },
    })
  })
})
