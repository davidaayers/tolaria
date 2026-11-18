import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { VaultEntry } from '../types'
import { addMockEntry } from '../mock-tauri'
import { useNoteCreation } from './useNoteCreation'
import type { NoteCreationConfig } from './useNoteCreation'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../mock-tauri', () => ({
  isTauri: vi.fn(() => false),
  addMockEntry: vi.fn(),
  updateMockContent: vi.fn(),
  trackMockChange: vi.fn(),
  mockInvoke: vi.fn().mockResolvedValue(''),
}))

const makeEntry = (overrides: Partial<VaultEntry> = {}): VaultEntry => ({
  path: '/vault/test.md', filename: 'test.md', title: 'Test Note', isA: 'Note',
  aliases: [], belongsTo: [], relatedTo: [], status: null, archived: false,
  modifiedAt: 1700000000, createdAt: 1700000000, fileSize: 100, snippet: '',
  wordCount: 0, relationships: {}, icon: null, color: null, order: null,
  outgoingLinks: [], template: null, sort: null, sidebarLabel: null,
  view: null, visible: null, properties: {}, organized: false, favorite: false,
  favoriteIndex: null, listPropertiesDisplay: [], hasH1: false,
  ...overrides,
})

describe('handleCreateNote with initial properties', () => {
  const addEntry = vi.fn()
  const openTabWithContent = vi.fn()
  const config = (entries: VaultEntry[] = []): NoteCreationConfig => ({
    addEntry, removeEntry: vi.fn(), entries, setToastMessage: vi.fn(), vaultPath: '/test/vault',
  })
  const create = async (entries: VaultEntry[], ...args: Parameters<ReturnType<typeof useNoteCreation>['handleCreateNote']>) => {
    const { result } = renderHook(() => useNoteCreation(config(entries), { openTabWithContent }))
    await act(async () => { await result.current.handleCreateNote(...args) })
  }

  beforeEach(() => vi.clearAllMocks())

  it('writes the properties into the new note and its entry', async () => {
    await create([], 'Write plan', 'Task', 'plus_button', { initialProperties: { Stage: 'todo', flagged: true, status: 'open' } })
    const entry = addEntry.mock.calls[0][0] as VaultEntry
    expect(entry.properties).toMatchObject({ Stage: 'todo', flagged: true })
    expect(entry.status).toBe('open')
    const content = openTabWithContent.mock.calls[0][1] as string
    expect(content).toContain('Stage: todo')
    expect(content).toContain('flagged: true')
    expect(content).toContain('status: open')
  })

  it('lets the given properties win over the type defaults for the same key', async () => {
    const taskType = makeEntry({ path: '/vault/type/task.md', title: 'Task', isA: 'Type', properties: { _list_properties_display: [], Stage: 'backlog' } })
    await create([taskType], 'Write plan', 'Task', 'plus_button', { initialProperties: { Stage: 'doing' } })
    const entry = addEntry.mock.calls[0][0] as VaultEntry
    expect(entry.properties.Stage).toBe('doing')
    expect((openTabWithContent.mock.calls[0][1] as string).match(/^Stage:/gm)).toHaveLength(1)
  })

  it('can create the note without opening an editor tab', async () => {
    await create([], 'Quiet', 'Task', 'plus_button', { openTab: false })
    expect(addEntry).toHaveBeenCalledTimes(1)
    expect(openTabWithContent).not.toHaveBeenCalled()
  })

  it('writes the title as the H1 when asked, and marks the entry as having one', async () => {
    await create([], 'Write plan', 'Task', 'plus_button', { titleHeading: true, openTab: false })
    const entry = addEntry.mock.calls[0][0] as VaultEntry
    expect(entry.hasH1).toBe(true)
    expect(vi.mocked(addMockEntry).mock.calls[0][1]).toContain('\n# Write plan\n')
  })

  it('leaves the body without an H1 by default', async () => {
    await create([], 'Quiet', 'Task', 'plus_button', { openTab: false })
    expect(vi.mocked(addMockEntry).mock.calls[0][1]).not.toContain('# Quiet')
    expect((addEntry.mock.calls[0][0] as VaultEntry).hasH1).toBe(false)
  })

  it('still opens the note by default, with no extra options', async () => {
    await create([], 'Loud', 'Task')
    expect(openTabWithContent).toHaveBeenCalledTimes(1)
  })
})
