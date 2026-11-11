import { act, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { BoardCollectionPresentationConfig } from '../../collections/collectionTypes'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { FilterGroup, ViewFile } from '../../types'
import { BoardWorkspace } from './BoardWorkspace'

interface CapturedHandlers {
  onDragStart?: (event: { active: { id: string }; over: null }) => void
  onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void
}
const handlers: CapturedHandlers = {}

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      Object.assign(handlers, { onDragStart: props.onDragStart, onDragEnd: props.onDragEnd })
      return <actual.DndContext {...props} />
    },
  }
})

const stage = (value: string): FilterGroup => ({ all: [{ field: 'Stage', op: 'equals', value }] })
const view = (filename: string, filters: FilterGroup): ViewFile => ({ filename, definition: { name: filename.replace('.yml', ''), icon: null, color: null, sort: null, filters } })
const VIEWS = [
  view('todo.yml', stage('todo')),
  view('done.yml', stage('done')),
  view('hard.yml', { any: [{ field: 'Stage', op: 'equals', value: 'x' }] }),
]
const presentation: BoardCollectionPresentationConfig = {
  type: 'board',
  properties: [],
  columns: [
    { view: 'todo.yml', wipLimit: null, show: null, stamp: null },
    { view: 'done.yml', wipLimit: null, show: null, stamp: 'completed' },
    { view: 'hard.yml', wipLimit: null, show: null, stamp: null },
  ],
  staleAfterDays: null,
  staleFrom: null,
  colors: {},
}

function renderWorkspace() {
  const entries = [makeEntry({ path: '/vault/Alpha.md', title: 'Alpha', properties: { Stage: 'todo' } })]
  const props = { onUpdateFrontmatter: vi.fn().mockResolvedValue(undefined), onDeleteProperty: vi.fn().mockResolvedValue(undefined), onOpenInList: vi.fn() }
  render(<BoardWorkspace presentation={presentation} viewSort={null} entries={entries} allEntries={entries} views={VIEWS} locale="en" {...props} />)
  return props
}

const dropOn = (column: string) => act(() => {
  handlers.onDragStart?.({ active: { id: '/vault/Alpha.md' }, over: null })
  handlers.onDragEnd?.({ active: { id: '/vault/Alpha.md' }, over: { id: column } })
})

describe('BoardWorkspace drag and drop', () => {
  it('writes the same properties and stamp as the Move to column control', async () => {
    const { onUpdateFrontmatter } = renderWorkspace()
    dropOn('done.yml')
    await vi.waitFor(() => expect(onUpdateFrontmatter).toHaveBeenCalledTimes(2))
    expect(onUpdateFrontmatter).toHaveBeenNthCalledWith(1, '/vault/Alpha.md', 'Stage', 'done')
    expect(onUpdateFrontmatter).toHaveBeenNthCalledWith(2, '/vault/Alpha.md', 'completed', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  })

  it('writes nothing when dropped on a column it cannot be moved into', () => {
    const { onUpdateFrontmatter, onDeleteProperty } = renderWorkspace()
    dropOn('hard.yml')
    expect(onUpdateFrontmatter).not.toHaveBeenCalled()
    expect(onDeleteProperty).not.toHaveBeenCalled()
  })
})
