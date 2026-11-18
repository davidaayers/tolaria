import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { ViewFile } from '../../types'
import { KanbanLayout } from './KanbanLayout'

const entries = [
  makeEntry({ path: '/vault/a.md', title: 'Alpha', status: 'Doing', properties: { owner: 'Ada' } }),
  makeEntry({ path: '/vault/b.md', title: 'Beta', status: null }),
]

function renderBoard(overrides: Partial<Parameters<typeof KanbanLayout>[0]> = {}) {
  const props = {
    entries,
    allEntries: entries,
    groupBy: 'status',
    properties: ['owner'],
    columnOrder: [],
    onColumnOrderChange: vi.fn(),
    onOpen: vi.fn(),
    onMove: vi.fn(),
    locale: 'en' as const,
    typeEntryMap: {},
    selectedNotePath: '/vault/a.md',
    ...overrides,
  }
  render(<KanbanLayout {...props} />)
  return props
}

describe('KanbanLayout', () => {
  it('shows every value as a column, including notes without a value', () => {
    renderBoard()
    const columns = screen.getAllByTestId('kanban-column')
    expect(columns.map((column) => column.dataset.kanbanColumn)).toEqual(['Doing', ''])
    expect(within(columns[1]).getByText('No value')).toBeInTheDocument()
    expect(within(columns[1]).getByText('Beta')).toBeInTheDocument()
  })

  it('renders card fields with the note-list property chips', () => {
    renderBoard()
    const alphaCard = screen.getByRole('button', { name: 'Alpha' })
    expect(within(alphaCard).getByText('Ada')).toBeInTheDocument()
    expect(alphaCard).toHaveAttribute('data-selected', 'true')
  })

  it('shows due dates as urgency chips and other plain values as coloured chips', () => {
    const iso = (offset: number) => {
      const day = new Date()
      day.setDate(day.getDate() + offset)
      return [day.getFullYear(), day.getMonth() + 1, day.getDate()].map((part) => String(part).padStart(2, '0')).join('-')
    }
    const late = makeEntry({ path: '/vault/late.md', title: 'Late', status: 'Doing', properties: { due: iso(-3), owner: 'Ada' } })
    const soon = makeEntry({ path: '/vault/soon.md', title: 'Soon', status: 'Doing', properties: { due: iso(1) } })
    renderBoard({ entries: [late, soon], allEntries: [late, soon], properties: ['due', 'owner'] })
    const lateCard = screen.getByRole('button', { name: 'Late' })
    expect(within(lateCard).getByText('3d overdue')).toHaveAttribute('data-urgency', 'overdue')
    expect(within(lateCard).getByText('Ada')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: 'Soon' })).getByText('Due tomorrow')).toHaveAttribute('data-urgency', 'soon')
  })

  it('resolves linked card fields against the whole vault, like list rows', () => {
    const person = makeEntry({ path: '/vault/person-ada.md', filename: 'person-ada.md', title: 'Ada Lovelace', isA: 'Person' })
    const linked = makeEntry({ path: '/vault/c.md', title: 'Gamma', status: 'Doing', relationships: { owner: ['[[person-ada]]'] } })
    renderBoard({ entries: [linked], allEntries: [linked, person] })
    const chips = within(screen.getByRole('button', { name: 'Gamma' })).getByTestId('property-chips')
    expect(chips).toHaveTextContent('Ada Lovelace')
    expect(chips).not.toHaveTextContent('person-ada')
  })

  it('opens a card on click from a native, keyboard-focusable button', () => {
    const props = renderBoard()
    const alphaCard = screen.getByRole('button', { name: 'Alpha' })
    expect(alphaCard.tagName).toBe('BUTTON')
    fireEvent.click(alphaCard)
    expect(props.onOpen).toHaveBeenCalledWith(entries[0], expect.anything())
    expect(screen.getByRole('button', { name: 'No value' }).tagName).toBe('BUTTON')
  })

  it('hides board and column scrollbars without disabling scrolling', () => {
    renderBoard({ columnOrder: ['', 'Doing'] })
    const board = screen.getByTestId('kanban-board')
    expect(board).toHaveClass('kanban-scroll', 'overflow-x-auto')
    expect(screen.getAllByTestId('kanban-column').map((column) => column.dataset.kanbanColumn)).toEqual(['', 'Doing'])
  })

  it('announces the board, columns and cards in English with note counts', () => {
    const twoDoing = [...entries, makeEntry({ path: '/vault/c.md', title: 'Gamma', status: 'Doing' })]
    renderBoard({ entries: twoDoing, allEntries: twoDoing })
    expect(screen.getByTestId('kanban-board')).toHaveAccessibleName('Kanban grouped by status')
    expect(screen.getByRole('region', { name: 'Doing, 2 notes' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'No value, 1 note' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Doing' })).toHaveAttribute('aria-roledescription', 'column')
    expect(screen.getByRole('button', { name: 'Gamma' })).toHaveAttribute('aria-roledescription', 'card')
  })

  it('announces the board, columns and cards in the active locale', () => {
    renderBoard({ locale: 'it-IT' })
    expect(screen.getByTestId('kanban-board')).toHaveAccessibleName('Kanban raggruppato per status')
    expect(screen.getByRole('region', { name: 'Doing, 1 nota' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Nessun valore, 1 nota' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Doing' })).toHaveAttribute('aria-roledescription', 'colonna')
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-roledescription', 'scheda')
  })

  describe('with saved-View columns', () => {
    const stageIs = (value: string): ViewFile['definition']['filters'] => ({ all: [{ field: 'Stage', op: 'equals', value }] })
    const savedView = (filename: string, name: string, value: string, extra: Partial<ViewFile['definition']> = {}): ViewFile => ({
      filename, definition: { name, icon: null, color: null, sort: null, filters: stageIs(value), ...extra },
    })
    const staged = (title: string, stage: string) => makeEntry({ path: `/vault/${title}.md`, title, properties: { Stage: stage } })
    const views = [savedView('todo.yml', 'To do', 'todo'), savedView('done.yml', 'Done', 'done')]
    const col = (view: string, extra = {}) => ({ view, wipLimit: null, show: null, stamp: null, ...extra })
    const cards = [staged('a', 'todo'), staged('b', 'todo'), staged('c', 'todo'), staged('d', 'done'), staged('e', 'mystery')]

    function renderViewBoard(overrides: Partial<Parameters<typeof KanbanLayout>[0]> = {}) {
      return renderBoard({ entries: cards, allEntries: cards, columns: [col('todo.yml'), col('done.yml')], views, selectedNotePath: null, ...overrides })
    }

    it('renders one column per View, plus Other for notes that match none', () => {
      renderViewBoard()
      const columns = screen.getAllByTestId('kanban-column')
      expect(columns.map((column) => column.dataset.kanbanColumn)).toEqual(['todo.yml', 'done.yml', '__other__'])
      expect(screen.getByRole('region', { name: 'To do, 3 notes' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Other, 1 note' })).toBeInTheDocument()
      expect(screen.getByTestId('kanban-board')).toHaveAccessibleName('Kanban with saved View columns')
    })

    it('follows the configured column order, not alphabetical order', () => {
      renderViewBoard({ columns: [col('done.yml'), col('todo.yml')] })
      expect(screen.getAllByTestId('kanban-column').map((column) => column.dataset.kanbanColumn)).toEqual(['done.yml', 'todo.yml', '__other__'])
    })

    it('shows a WIP count against the limit and a "+N more" footer for capped columns', () => {
      renderViewBoard({ columns: [col('todo.yml', { show: 2, wipLimit: 2 })] })
      const todo = screen.getByRole('region', { name: 'To do, 3 notes' })
      expect(within(todo).getByText('3/2')).toHaveAttribute('data-over-limit', 'true')
      expect(within(todo).getByTestId('kanban-more-cards')).toHaveTextContent('+1 more')
      expect(within(todo).getAllByTestId('kanban-card').length).toBeGreaterThan(0)
      expect(within(todo).queryByText('c')).not.toBeInTheDocument()
    })

    it('keeps a column whose View is missing, labelled as such', () => {
      renderViewBoard({ columns: [col('gone.yml'), col('todo.yml')] })
      expect(screen.getByRole('region', { name: 'gone (View not found), 0 notes' })).toBeInTheDocument()
    })

    it('shows a note in every column whose View it matches', () => {
      const both = [savedView('todo.yml', 'To do', 'todo'), savedView('any.yml', 'Everything', 'todo')]
      renderViewBoard({ entries: [cards[0]], allEntries: [cards[0]], views: both, columns: [col('todo.yml'), col('any.yml')] })
      expect(screen.getAllByRole('button', { name: 'a' })).toHaveLength(2)
    })

    describe('board scope', () => {
      const outside = staged('outside', 'done')
      const board = { filename: 'board.yml', definition: { name: 'Board', icon: null, color: null, sort: null, filters: { all: [{ field: 'Stage', op: 'contains' as const, value: 'o' }] } } }

      it('fills columns from every note a column View matches, not only the board View result', () => {
        renderViewBoard({ entries: [cards[0]], allEntries: [...cards, outside], boardView: board, columns: [col('done.yml')] })
        const done = screen.getByRole('region', { name: 'Done, 2 notes' })
        expect(within(done).getByText('outside')).toBeInTheDocument()
      })

      it('limits Other to the board View result', () => {
        renderViewBoard({ entries: [cards[4]], allEntries: cards, boardView: board, columns: [col('todo.yml')] })
        expect(screen.getByRole('region', { name: 'Other, 1 note' })).toBeInTheDocument()
      })

      it('does not let the board View filter block new cards', () => {
        renderViewBoard({ entries: [], allEntries: cards, boardView: board, columns: [col('todo.yml')], onCreateCard: vi.fn() })
        expect(screen.getByRole('button', { name: 'Add card to To do' })).toBeInTheDocument()
      })
    })

    describe('new cards', () => {
      it('offers a new-card button on columns a card can be written into, not Other or missing ones', () => {
        renderViewBoard({ columns: [col('gone.yml'), col('todo.yml'), col('done.yml')], onCreateCard: vi.fn() })
        expect(screen.getByRole('button', { name: 'Add card to To do' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Add card to Done' })).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: /^Add card to/ })).toHaveLength(2)
      })

      it('offers nothing when the board cannot create notes', () => {
        renderViewBoard()
        expect(screen.queryByRole('button', { name: /^Add card to/ })).not.toBeInTheDocument()
      })

      it('creates a card with what the column View requires once a title is entered', () => {
        const props = renderViewBoard({ onCreateCard: vi.fn() })
        fireEvent.click(screen.getByRole('button', { name: 'Add card to Done' }))
        const input = screen.getByRole('textbox', { name: 'Card title' })
        fireEvent.change(input, { target: { value: 'Ship it' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(props.onCreateCard).toHaveBeenCalledWith('Ship it', { type: 'Note', properties: { Stage: 'done' } })
        expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument()
      })

      it('ignores a blank title and closes the composer on Escape', () => {
        const props = renderViewBoard({ onCreateCard: vi.fn() })
        fireEvent.click(screen.getByRole('button', { name: 'Add card to To do' }))
        const input = screen.getByRole('textbox', { name: 'Card title' })
        fireEvent.change(input, { target: { value: '   ' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(props.onCreateCard).not.toHaveBeenCalled()
        fireEvent.keyDown(input, { key: 'Escape' })
        expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument()
      })
    })
  })
})
