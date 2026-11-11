import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BoardCollectionPresentationConfig } from '../../collections/collectionTypes'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { FilterGroup, VaultEntry, ViewFile } from '../../types'
import { BoardWorkspace } from './BoardWorkspace'

const stage = (value: string): FilterGroup => ({ all: [{ field: 'type', op: 'equals', value: 'Task' }, { field: 'Stage', op: 'equals', value }] })
const view = (filename: string, name: string): ViewFile => ({ filename, definition: { name, icon: null, color: null, sort: null, filters: stage(filename.replace('.yml', '')) } })
const BOARD: ViewFile = { filename: 'board.yml', definition: { name: 'Tasks Board', icon: null, color: null, sort: null, filters: { all: [{ field: 'type', op: 'equals', value: 'Task' }] } } }
const HARD: ViewFile = { filename: 'hard.yml', definition: { name: 'Hard', icon: null, color: null, sort: null, filters: { any: [{ field: 'Stage', op: 'equals', value: 'x' }] } } }
const VIEWS = [view('todo.yml', 'To do'), view('done.yml', 'Done'), HARD]

const presentation = (views: string[]): BoardCollectionPresentationConfig => ({
  type: 'board', properties: ['area', 'due'], staleAfterDays: null, staleFrom: null, colors: {},
  columns: views.map((name) => ({ view: name, wipLimit: null, show: null, stamp: null })),
})

const task = (title: string, properties: VaultEntry['properties']) => makeEntry({ path: `/vault/${title}.md`, title, isA: 'Task', properties })
const ENTRIES = [
  task('Fix login', { Stage: 'todo', area: 'ops', due: '2020-01-01' }),
  task('Plan offsite', { Stage: 'todo', area: 'team' }),
  task('Ship it', { Stage: 'done', area: 'ops' }),
]

function renderWorkspace(columns = ['todo.yml', 'done.yml'], extra: { withCreate?: boolean } = {}) {
  const onCreateNote = vi.fn().mockResolvedValue(true)
  render(
    <BoardWorkspace
      presentation={presentation(columns)}
      viewSort={null}
      entries={ENTRIES}
      allEntries={ENTRIES}
      views={VIEWS}
      boardView={BOARD}
      locale="en"
      onUpdateFrontmatter={vi.fn().mockResolvedValue(undefined)}
      onDeleteProperty={vi.fn().mockResolvedValue(undefined)}
      onOpenInList={vi.fn()}
      onCreateNote={extra.withCreate === false ? undefined : onCreateNote}
    />,
  )
  return { onCreateNote }
}

const region = (name: string) => screen.getByRole('region', { name })

describe('BoardWorkspace top bar and quick filter', () => {
  it('shows the board name and the card count', () => {
    renderWorkspace()
    expect(screen.getByRole('heading', { name: 'Tasks Board' })).toBeInTheDocument()
    expect(screen.getByText('3 cards')).toBeInTheDocument()
  })

  it('narrows cards by the typed text but keeps each column’s real count', () => {
    renderWorkspace()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter cards' }), { target: { value: 'login' } })
    expect(within(region('To do')).getByText('Fix login')).toBeInTheDocument()
    expect(within(region('To do')).queryByText('Plan offsite')).not.toBeInTheDocument()
    expect(within(region('To do')).getByText('2')).toBeInTheDocument()
    expect(within(region('Done')).getByText('No matching cards')).toBeInTheDocument()
    expect(screen.getByText('1 of 3 cards')).toBeInTheDocument()
  })

  it('filters by a property value chip and by the overdue shortcut', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'team' }))
    expect(within(region('To do')).queryByText('Fix login')).not.toBeInTheDocument()
    expect(within(region('To do')).getByText('Plan offsite')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Overdue' }))
    expect(within(region('To do')).getByText('Fix login')).toBeInTheDocument()
    expect(within(region('To do')).queryByText('Plan offsite')).not.toBeInTheDocument()
  })
})

describe('BoardWorkspace creating cards', () => {
  it('creates a card in the column with what that column’s View requires, without opening it', () => {
    const { onCreateNote } = renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Add card to Done' }))
    const input = within(region('Done')).getByRole('textbox', { name: 'Card title' })
    fireEvent.change(input, { target: { value: 'Write notes' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreateNote).toHaveBeenCalledWith('Write notes', 'Task', 'plus_button', { initialProperties: { Stage: 'done' }, openTab: false })
    expect(within(region('Done')).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('starts the new card in the first column that can take one from the top bar', () => {
    renderWorkspace(['hard.yml', 'todo.yml', 'done.yml'])
    fireEvent.click(screen.getByRole('button', { name: 'New card' }))
    expect(within(region('To do')).getByRole('textbox', { name: 'Card title' })).toBeInTheDocument()
  })

  it('clears the filter when a card is created so it cannot vanish from view', () => {
    renderWorkspace()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter cards' }), { target: { value: 'login' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add card to To do' }))
    const input = within(region('To do')).getByRole('textbox', { name: 'Card title' })
    fireEvent.change(input, { target: { value: 'Brand new' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('searchbox', { name: 'Filter cards' })).toHaveValue('')
  })

  it('offers no + on columns a card cannot be written into', () => {
    renderWorkspace(['hard.yml', 'todo.yml'])
    expect(within(region('Hard')).queryByRole('button', { name: /Add card/ })).not.toBeInTheDocument()
    expect(within(region('To do')).getByRole('button', { name: 'Add card to To do' })).toBeInTheDocument()
  })

  it('disables New card and shows no + when no column can take one', () => {
    renderWorkspace(['hard.yml'])
    expect(screen.getByRole('button', { name: 'New card' })).toBeDisabled()
  })

  it('offers no creating at all when the app does not provide it', () => {
    renderWorkspace(['todo.yml'], { withCreate: false })
    expect(screen.getByRole('button', { name: 'New card' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Add card/ })).not.toBeInTheDocument()
  })
})
