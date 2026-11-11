import { act, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildBoardColumns } from '../../collections/boardColumns'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { FilterGroup, VaultEntry, ViewFile } from '../../types'
import { BoardView } from './BoardView'

type DragEvent = { active: { id: string }; over: { id: string } | null }
interface CapturedHandlers {
  onDragStart?: (event: DragEvent) => void
  onDragEnd?: (event: DragEvent) => void
  onDragCancel?: () => void
}

const handlers: CapturedHandlers = {}

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      Object.assign(handlers, { onDragStart: props.onDragStart, onDragEnd: props.onDragEnd, onDragCancel: props.onDragCancel })
      return <actual.DndContext {...props} />
    },
  }
})

const stage = (value: string): FilterGroup => ({ all: [{ field: 'Stage', op: 'equals', value }] })
const view = (filename: string, name: string): ViewFile => ({ filename, definition: { name, icon: null, color: null, sort: null, filters: stage(filename.replace('.yml', '')) } })
const VIEWS = [view('todo.yml', 'To do'), view('doing.yml', 'Doing'), view('done.yml', 'Done')]
const note = (title: string, Stage: string): VaultEntry => makeEntry({ path: `/vault/${title}.md`, title, properties: { Stage } })
const config = { type: 'board' as const, properties: [], columns: VIEWS.map((v) => ({ view: v.filename, wipLimit: null, show: null, stamp: null })), staleAfterDays: null, staleFrom: null, colors: {} }

function renderBoard(overrides: Partial<ComponentProps<typeof BoardView>> = {}) {
  const entries = [note('Alpha', 'todo'), note('Beta', 'doing')]
  const onMoveCard = vi.fn()
  render(
    <BoardView
      columns={buildBoardColumns(entries, config, VIEWS)}
      properties={[]}
      allEntries={entries}
      typeEntryMap={{}}
      selectedPath={null}
      locale="en"
      onSelectCard={vi.fn()}
      onMoveCard={onMoveCard}
      getMovableKeys={() => new Set(['doing.yml', 'done.yml'])}
      {...overrides}
    />,
  )
  return { onMoveCard, alpha: entries[0] }
}

const drag = (id: string) => act(() => handlers.onDragStart?.({ active: { id }, over: null }))
const drop = (id: string, over: string | null) => act(() => handlers.onDragEnd?.({ active: { id }, over: over ? { id: over } : null }))

describe('BoardView drag and drop', () => {
  beforeEach(() => { delete handlers.onDragStart; delete handlers.onDragEnd; delete handlers.onDragCancel })

  it('moves the dragged card into the column it is dropped on', () => {
    const { onMoveCard, alpha } = renderBoard()
    drag(alpha.path)
    drop(alpha.path, 'done.yml')
    expect(onMoveCard).toHaveBeenCalledWith(expect.objectContaining({ path: alpha.path }), 'done.yml')
  })

  it('ignores a drop on a column the note cannot be moved into', () => {
    const { onMoveCard, alpha } = renderBoard({ getMovableKeys: () => new Set(['doing.yml']) })
    drag(alpha.path)
    drop(alpha.path, 'done.yml')
    expect(onMoveCard).not.toHaveBeenCalled()
  })

  it('ignores a drop outside every column, and a drop back on the same column', () => {
    const { onMoveCard, alpha } = renderBoard({ getMovableKeys: () => new Set(['doing.yml']) })
    drag(alpha.path)
    drop(alpha.path, null)
    drag(alpha.path)
    drop(alpha.path, 'todo.yml')
    expect(onMoveCard).not.toHaveBeenCalled()
  })

  it('shows which columns accept the dragged card, and clears it on drop or cancel', () => {
    const { alpha } = renderBoard({ getMovableKeys: () => new Set(['doing.yml']) })
    const state = (name: string) => screen.getByRole('region', { name }).getAttribute('data-drop')
    expect(state('Doing')).toBeNull()

    drag(alpha.path)
    expect(state('Doing')).toBe('allowed')
    expect(state('Done')).toBe('blocked')
    expect(state('To do')).toBe('blocked')

    act(() => handlers.onDragCancel?.())
    expect(state('Doing')).toBeNull()

    drag(alpha.path)
    drop(alpha.path, 'doing.yml')
    expect(state('Doing')).toBeNull()
  })

  it('does nothing when the board is not wired for moves', () => {
    const { alpha } = renderBoard({ onMoveCard: undefined, getMovableKeys: undefined })
    drag(alpha.path)
    expect(screen.getByRole('region', { name: 'Done' }).getAttribute('data-drop')).toBeNull()
    expect(() => drop(alpha.path, 'done.yml')).not.toThrow()
  })
})
