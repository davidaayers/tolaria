import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildBoardColumns, type BoardColumn } from '../../collections/boardColumns'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { FilterGroup, VaultEntry, ViewFile } from '../../types'
import { BoardView } from './BoardView'

const stage = (value: string): FilterGroup => ({ all: [{ field: 'Stage', op: 'equals', value }] })
const view = (filename: string, name: string): ViewFile => ({ filename, definition: { name, icon: null, color: null, sort: null, filters: stage(filename.replace('.yml', '')) } })
const VIEWS = [view('todo.yml', 'To do'), view('done.yml', 'Done')]
const note = (title: string, Stage: string): VaultEntry => makeEntry({ path: `/vault/${title}.md`, title, properties: { Stage } })

function renderBoard(overrides: Partial<React.ComponentProps<typeof BoardView>> = {}, show: number | null = null) {
  const entries = [note('Alpha', 'todo'), note('Beta', 'todo'), note('Gamma', 'todo'), note('Delta', 'done')]
  const config = { type: 'board' as const, properties: [], columns: VIEWS.map((v) => ({ view: v.filename, wipLimit: null, show: v.filename === 'todo.yml' ? show : null, stamp: null })), staleAfterDays: null, staleFrom: null, colors: {} }
  const onCreateCard = vi.fn()
  const onComposeChange = vi.fn()
  render(
    <BoardView
      columns={buildBoardColumns(entries, config, VIEWS)}
      properties={[]}
      allEntries={entries}
      typeEntryMap={{}}
      selectedPath={null}
      locale="en"
      onSelectCard={vi.fn()}
      {...overrides}
      onCreateCard={onCreateCard}
      onComposeChange={onComposeChange}
    />,
  )
  return { onCreateCard, onComposeChange }
}

const region = (name: string) => screen.getByRole('region', { name })

describe('BoardView filtering', () => {
  it('shows only matching cards but keeps the real count and ignores the show cap', () => {
    renderBoard({ matchPaths: new Set(['/vault/Beta.md', '/vault/Gamma.md']) }, 1)
    const todo = region('To do')
    expect(within(todo).queryByText('Alpha')).not.toBeInTheDocument()
    expect(within(todo).getByText('Beta')).toBeInTheDocument()
    expect(within(todo).getByText('Gamma')).toBeInTheDocument()
    expect(within(todo).getByText('3')).toBeInTheDocument()
    expect(within(todo).queryByRole('button', { name: /more/ })).not.toBeInTheDocument()
  })

  it('says so when a column has cards but none match', () => {
    renderBoard({ matchPaths: new Set(['/vault/Beta.md']) })
    expect(within(region('Done')).getByText('No matching cards')).toBeInTheDocument()
    expect(within(region('Done')).queryByText('No notes')).not.toBeInTheDocument()
  })

  it('keeps the empty message for a column with no cards at all', () => {
    renderBoard({ matchPaths: new Set() }, null)
    expect(within(region('To do')).getByText('No matching cards')).toBeInTheDocument()
  })
})

describe('BoardView card creation', () => {
  const canCreateIn = (column: BoardColumn) => column.key === 'todo.yml'

  it('offers a + only on columns that can take a new card', () => {
    renderBoard({ canCreateIn })
    expect(within(region('To do')).getByRole('button', { name: 'Add card to To do' })).toBeInTheDocument()
    expect(within(region('Done')).queryByRole('button', { name: /Add card/ })).not.toBeInTheDocument()
  })

  it('starts composing in the column when + is clicked', () => {
    const { onComposeChange } = renderBoard({ canCreateIn })
    fireEvent.click(screen.getByRole('button', { name: 'Add card to To do' }))
    expect(onComposeChange).toHaveBeenCalledWith('todo.yml')
  })

  it('shows a title box in the composing column and creates the card on Enter', () => {
    const { onCreateCard, onComposeChange } = renderBoard({ canCreateIn, composingKey: 'todo.yml' })
    const input = within(region('To do')).getByRole('textbox', { name: 'Card title' })
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: '  Write plan  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreateCard).toHaveBeenCalledWith(expect.objectContaining({ key: 'todo.yml' }), 'Write plan')
    expect(onComposeChange).toHaveBeenCalledWith(null)
  })

  it('does not create an empty card, and Escape cancels', () => {
    const { onCreateCard, onComposeChange } = renderBoard({ canCreateIn, composingKey: 'todo.yml' })
    const input = within(region('To do')).getByRole('textbox', { name: 'Card title' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreateCard).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onComposeChange).toHaveBeenCalledWith(null)
  })

  it('shows no title box in the other columns', () => {
    renderBoard({ canCreateIn, composingKey: 'todo.yml' })
    expect(within(region('Done')).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('has no + at all when the board is not wired for creating', () => {
    renderBoard({ canCreateIn: undefined, onCreateCard: undefined })
    expect(screen.queryByRole('button', { name: /Add card/ })).not.toBeInTheDocument()
  })
})
