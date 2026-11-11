import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildBoardColumns } from '../../collections/boardColumns'
import type { BoardColumnConfig } from '../../collections/collectionTypes'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { FilterGroup, VaultEntry, ViewFile } from '../../types'
import { BoardView } from './BoardView'

function savedView(filename: string, filters: FilterGroup, extra: Partial<ViewFile['definition']> = {}): ViewFile {
  return { filename, definition: { name: filename.replace('.yml', ''), icon: null, color: null, sort: null, filters, ...extra } }
}

const stageIs = (value: string): FilterGroup => ({ all: [{ field: 'Stage', op: 'equals', value }] })

function col(view: string, overrides: Partial<BoardColumnConfig> = {}): BoardColumnConfig {
  return { view, wipLimit: null, show: null, stamp: null, ...overrides }
}

function note(title: string, stage?: string, properties: VaultEntry['properties'] = {}): VaultEntry {
  return makeEntry({ path: `/vault/${title}.md`, title, properties: stage ? { Stage: stage, ...properties } : properties })
}

const DEFAULT_VIEWS = [
  savedView('todo.yml', stageIs('todo'), { name: 'To do' }),
  savedView('done.yml', stageIs('done'), { name: 'Done' }),
]

function renderBoard(
  entries: VaultEntry[],
  columns: BoardColumnConfig[],
  props: Partial<React.ComponentProps<typeof BoardView>> = {},
  views: ViewFile[] = DEFAULT_VIEWS,
) {
  const built = buildBoardColumns(entries, { type: 'board', properties: [], columns, staleAfterDays: null, staleFrom: null, colors: {} }, views)
  const onSelectCard = vi.fn()
  render(
    <BoardView
      columns={built}
      properties={[]}
      allEntries={entries}
      typeEntryMap={{}}
      selectedPath={null}
      locale="en"
      onSelectCard={onSelectCard}
      {...props}
    />,
  )
  return { onSelectCard }
}

const region = (name: string) => screen.getByRole('region', { name: new RegExp(name) })

describe('BoardView', () => {
  it('renders one labelled region per column with its cards and count', () => {
    renderBoard([note('Alpha', 'todo'), note('Beta', 'todo'), note('Gamma', 'done')], [col('todo.yml'), col('done.yml')])
    const todo = region('To do')
    expect(within(todo).getByText('Alpha')).toBeInTheDocument()
    expect(within(todo).getByText('Beta')).toBeInTheDocument()
    expect(within(todo).getByText('2')).toBeInTheDocument()
    expect(within(region('Done')).getByText('Gamma')).toBeInTheDocument()
  })

  it('shows empty columns with an empty message', () => {
    renderBoard([], [col('todo.yml')])
    expect(within(region('To do')).getByText('No notes')).toBeInTheDocument()
  })

  it('shows a message for a column whose View no longer exists', () => {
    renderBoard([], [col('gone.yml')])
    const gone = region('gone')
    expect(within(gone).getByText('View not found')).toBeInTheDocument()
    expect(within(gone).queryByText('No notes')).not.toBeInTheDocument()
  })

  it('localizes the Other column heading and lists unmatched notes there', () => {
    renderBoard([note('Loose')], [col('todo.yml')])
    expect(within(region('Other')).getByText('Loose')).toBeInTheDocument()
  })

  it('selects a card on click and marks the selected one', () => {
    const entries = [note('Alpha', 'todo'), note('Beta', 'todo')]
    const { onSelectCard } = renderBoard(entries, [col('todo.yml')], { selectedPath: '/vault/Beta.md' })
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    expect(onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ path: '/vault/Alpha.md' }))
    expect(screen.getByRole('button', { name: /Beta/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Alpha/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows n/limit with the WIP limit warning in the count pill when over the limit, and a plain count otherwise', () => {
    renderBoard([note('a', 'todo'), note('b', 'todo'), note('c', 'todo'), note('d', 'done')], [col('todo.yml', { wipLimit: 2 }), col('done.yml', { wipLimit: 2 })])
    const todo = region('To do')
    expect(within(todo).getByTitle('WIP limit: 2')).toHaveTextContent('3/2')
    expect(within(todo).queryByText('WIP limit: 2')).not.toBeInTheDocument()
    const done = region('Done')
    expect(within(done).getByText('1/2')).toBeInTheDocument()
    expect(within(done).queryByTitle(/WIP limit/)).not.toBeInTheDocument()
  })

  it('caps cards at show, offers "+N more", and expands and collapses it', () => {
    renderBoard(['a', 'b', 'c', 'd'].map((t) => note(t, 'todo')), [col('todo.yml', { show: 2 })])
    const todo = region('To do')
    expect(within(todo).queryByText('c')).not.toBeInTheDocument()
    fireEvent.click(within(todo).getByRole('button', { name: '+2 more' }))
    expect(within(todo).getByText('d')).toBeInTheDocument()
    fireEvent.click(within(todo).getByRole('button', { name: 'Show fewer' }))
    expect(within(todo).queryByText('c')).not.toBeInTheDocument()
  })

  it('renders an empty-board message when there are no columns', () => {
    renderBoard([], [])
    expect(screen.getByText('No notes to show on this board')).toBeInTheDocument()
  })

  it('gives each card an accent chip per scalar property, shared by equal values', () => {
    const entries = [note('a', 'todo', { area: 'ops' }), note('b', 'todo', { area: 'ops' })]
    renderBoard(entries, [col('todo.yml')], { properties: ['area'] })
    const chips = screen.getAllByText('ops')
    expect(chips).toHaveLength(2)
    expect(chips[0].getAttribute('style')).toBe(chips[1].getAttribute('style'))
    expect(chips[0].getAttribute('style')).toContain('--accent-')
  })

  it('uses the colour configured for a value instead of the automatic one', () => {
    const entries = [note('a', 'todo', { area: 'Ops' }), note('b', 'todo', { area: 'jc' })]
    renderBoard(entries, [col('todo.yml')], { properties: ['area'], colors: { ops: 'pink' } })
    expect(screen.getByText('Ops').getAttribute('style')).toContain('--accent-pink')
    expect(screen.getByText('jc').getAttribute('style')).not.toContain('--accent-pink')
  })

  it('shows due dates as urgency chips and marks overdue ones', () => {
    const day = (offset: number) => {
      const date = new Date()
      date.setDate(date.getDate() + offset)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }
    renderBoard([note('late', 'todo', { due: day(-2) }), note('now', 'todo', { due: day(0) })], [col('todo.yml')], { properties: ['due'] })
    expect(screen.getByText('2d overdue')).toHaveAttribute('data-urgency', 'overdue')
    expect(screen.getByText('Due today')).toHaveAttribute('data-urgency', 'soon')
  })

  it('hides the chip for the value most cards in a column share, keeping the odd ones out', () => {
    const entries = ['team', 'team', 'team', 'ops'].map((area, index) => note(`n${index}`, 'todo', { area }))
    renderBoard(entries, [col('todo.yml')], { properties: ['area'] })
    expect(screen.queryByText('team')).not.toBeInTheDocument()
    expect(screen.getByText('ops')).toBeInTheDocument()
  })

  it('keeps each column in its own scroll area with a faded edge, sized to share the width', () => {
    renderBoard([note('a', 'todo')], [col('todo.yml')])
    const notes = screen.getByTestId('board-column-todo.yml-notes')
    expect(notes.className).toContain('overflow-y-auto')
    expect(notes.className).toContain('mask-image')
    expect(screen.getByTestId('board-column-todo.yml').className).not.toContain('w-72')
  })

  it("shows the View's icon in the column heading, tinted with the View's colour, and a dot when there is none", () => {
    const views = [
      savedView('a.yml', stageIs('a'), { icon: '🔥' }),
      savedView('b.yml', stageIs('b'), { icon: 'hammer', color: 'orange' }),
      savedView('c.yml', stageIs('c'), { icon: 'not-a-real-icon' }),
      savedView('d.yml', stageIs('d'), { color: 'green' }),
      savedView('e.yml', stageIs('e'), { icon: '🔥', color: 'orange' }),
    ]
    renderBoard([], ['a', 'b', 'c', 'd', 'e'].map((v) => col(`${v}.yml`)), {}, views)
    expect(screen.getByTestId('board-column-icon-a.yml')).toHaveTextContent('🔥')
    const named = screen.getByTestId('board-column-icon-b.yml')
    expect(named.querySelector('svg')).not.toBeNull()
    expect(named.getAttribute('style')).toContain('--accent-orange')
    expect(screen.getByTestId('board-column-dot-c.yml')).toBeInTheDocument()
    expect(screen.getByTestId('board-column-dot-d.yml').getAttribute('style')).toContain('--accent-green')
    expect(screen.getByTestId('board-column-icon-e.yml').getAttribute('style') ?? '').not.toContain('--accent-orange')
    expect(screen.queryByTestId('board-column-dot-a.yml')).not.toBeInTheDocument()
  })
})
