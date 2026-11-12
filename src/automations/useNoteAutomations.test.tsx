import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEntry } from '../test-utils/noteListTestUtils'
import type { AutomationFile } from './automationTypes'
import { useNoteAutomations } from './useNoteAutomations'

const backend = vi.hoisted(() => ({
  listAutomations: vi.fn(),
  getAutomationTrust: vi.fn(),
  setAutomationTrust: vi.fn(),
  runAutomationCommand: vi.fn(),
}))
vi.mock('./automationBackend', () => backend)

const entry = makeEntry({ path: '/vault/a.md', title: 'Write report', isA: 'Task', status: 'done' })
const file = (actions: AutomationFile['definition']['actions']): AutomationFile => ({
  filename: 'finish.yml', hash: 'h1',
  definition: { name: 'Finish', on: { property: 'status', to: ['done'], from: [] }, when: null, actions },
})

function setup() {
  const updateFrontmatter = vi.fn(async () => undefined)
  const deleteProperty = vi.fn(async () => undefined)
  const setToastMessage = vi.fn()
  const hook = renderHook(() => useNoteAutomations({ vaultPath: '/vault', locale: 'en', entries: [entry], setToastMessage, updateFrontmatter, deleteProperty }))
  return { ...hook, updateFrontmatter, deleteProperty, setToastMessage }
}

const change = { path: '/vault/a.md', key: 'status', old: 'doing', new: 'done' } as const
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(400) })

describe('useNoteAutomations', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.values(backend).forEach((fn) => { fn.mockReset() })
    backend.getAutomationTrust.mockResolvedValue({})
    backend.setAutomationTrust.mockResolvedValue(undefined)
  })
  afterEach(() => { vi.useRealTimers() })

  it('does nothing when the vault has no automations', async () => {
    backend.listAutomations.mockResolvedValue({ files: [], errors: [] })
    const { result, setToastMessage } = setup()
    act(() => result.current.onPropertyChanged(change))
    await settle()
    expect(backend.listAutomations).toHaveBeenCalledWith('/vault')
    expect(setToastMessage).not.toHaveBeenCalled()
  })

  it('runs a matching set automation once for merged writes and toasts that it ran', async () => {
    backend.listAutomations.mockResolvedValue({ files: [file([{ kind: 'set', values: { completed: '{{today}}' } }])], errors: [] })
    const { result, updateFrontmatter, setToastMessage } = setup()
    act(() => {
      result.current.onPropertyChanged(change)
      result.current.onPropertyChanged({ path: '/vault/a.md', key: 'completed', old: null, new: '2026-11-12' })
    })
    await settle()
    expect(updateFrontmatter).toHaveBeenCalledTimes(1)
    expect(updateFrontmatter).toHaveBeenCalledWith('/vault/a.md', 'completed', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), { silent: true })
    expect(setToastMessage).toHaveBeenCalledWith('Automation "Finish" ran')
  })

  it('does not react to writes the automation makes itself', async () => {
    backend.listAutomations.mockResolvedValue({ files: [file([{ kind: 'set', values: { flag: true } }])], errors: [] })
    const { result, updateFrontmatter } = setup()
    updateFrontmatter.mockImplementation(async () => { result.current.onPropertyChanged({ path: '/vault/a.md', key: 'status', old: 'x', new: 'done' }) })
    act(() => result.current.onPropertyChanged(change))
    await settle()
    expect(updateFrontmatter).toHaveBeenCalledTimes(1)
    expect(backend.listAutomations).toHaveBeenCalledTimes(1)
  })

  it('asks for approval before running a program, records the answer, then runs it and shows its message', async () => {
    backend.listAutomations.mockResolvedValue({ files: [file([{ kind: 'run', argv: ['/bin/echo', 'x'], timeoutSeconds: 30 }])], errors: [] })
    backend.runAutomationCommand.mockResolvedValue({ ok: true, message: 'Linked it', error: null })
    const { result, setToastMessage } = setup()
    act(() => result.current.onPropertyChanged(change))
    await settle()
    expect(result.current.approvalFile?.filename).toBe('finish.yml')
    expect(backend.runAutomationCommand).not.toHaveBeenCalled()

    act(() => result.current.answerApproval(true))
    await settle()
    expect(backend.setAutomationTrust).toHaveBeenCalledWith('/vault', 'h1', true)
    expect(backend.runAutomationCommand).toHaveBeenCalledWith('/vault', 'finish.yml', expect.objectContaining({ argv: ['/bin/echo', 'x'] }))
    expect(result.current.approvalFile).toBeNull()
    expect(setToastMessage).toHaveBeenCalledWith('Linked it')
  })

  it('does not run a program the user declined', async () => {
    backend.listAutomations.mockResolvedValue({ files: [file([{ kind: 'run', argv: ['/bin/echo'], timeoutSeconds: 30 }])], errors: [] })
    const { result } = setup()
    act(() => result.current.onPropertyChanged(change))
    await settle()
    act(() => result.current.answerApproval(false))
    await settle()
    expect(backend.setAutomationTrust).toHaveBeenCalledWith('/vault', 'h1', false)
    expect(backend.runAutomationCommand).not.toHaveBeenCalled()
  })

  it('runs an already approved program without asking, and toasts a failure', async () => {
    backend.getAutomationTrust.mockResolvedValue({ h1: 'approved' })
    backend.listAutomations.mockResolvedValue({ files: [file([{ kind: 'run', argv: ['/bin/false'], timeoutSeconds: 30 }])], errors: [] })
    backend.runAutomationCommand.mockResolvedValue({ ok: false, message: null, error: 'exit 1: boom' })
    const { result, setToastMessage } = setup()
    act(() => result.current.onPropertyChanged(change))
    await settle()
    expect(result.current.approvalFile).toBeNull()
    expect(setToastMessage).toHaveBeenCalledWith('Automation "Finish" failed: exit 1: boom')
  })
})
