import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildBoardColumns } from '../../collections/boardColumns'
import type { BoardCollectionPresentationConfig, BoardColumnConfig } from '../../collections/collectionTypes'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { VaultEntry } from '../../types'
import { BoardView } from './BoardView'

function column(value: string, overrides: Partial<BoardColumnConfig> = {}): BoardColumnConfig {
  return { value, label: null, limit: null, max: null, sort: null, filter: null, stamp: null, ...overrides }
}

function config(columns: BoardColumnConfig[] | null): BoardCollectionPresentationConfig {
  return { type: 'board', groupBy: 'Stage', properties: [], columns, staleAfterDays: null, staleFrom: null, colors: {} }
}

function note(title: string, stage?: string): VaultEntry {
  return makeEntry({ path: `/vault/${title}.md`, title, properties: stage ? { Stage: stage } : {} })
}

function renderBoard(
  entries: VaultEntry[],
  columns: BoardColumnConfig[] | null,
  props: Partial<React.ComponentProps<typeof BoardView>> = {},
) {
  const built = buildBoardColumns(entries, config(columns))
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

const columnRegion = (name: string) => screen.getByRole('region', { name: new RegExp(name) })

describe('BoardView', () => {
  it('renders one labelled region per column with its cards and count', () => {
    renderBoard([note('Alpha', 'todo'), note('Beta', 'todo'), note('Gamma', 'done')], [column('todo', { label: 'To do' }), column('done')])
    const todo = columnRegion('To do')
    expect(within(todo).getByText('Alpha')).toBeInTheDocument()
    expect(within(todo).getByText('Beta')).toBeInTheDocument()
    expect(within(todo).getByText('2')).toBeInTheDocument()
    expect(within(columnRegion('done')).getByText('Gamma')).toBeInTheDocument()
  })

  it('shows empty columns with an empty message', () => {
    renderBoard([], [column('todo')])
    expect(within(columnRegion('todo')).getByText('No notes')).toBeInTheDocument()
  })

  it('localizes the Other column heading', () => {
    renderBoard([note('Loose')], [column('todo')])
    expect(within(columnRegion('Other')).getByText('Loose')).toBeInTheDocument()
  })

  it('selects a card on click and marks the selected one', () => {
    const entries = [note('Alpha', 'todo'), note('Beta', 'todo')]
    const { onSelectCard } = renderBoard(entries, [column('todo')], { selectedPath: '/vault/Beta.md' })
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    expect(onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ path: '/vault/Alpha.md' }))
    expect(screen.getByRole('button', { name: /Beta/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Alpha/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows n/limit and a warning when a column is over its limit, and plain count otherwise', () => {
    renderBoard([note('a', 'todo'), note('b', 'todo'), note('c', 'todo'), note('d', 'done')], [column('todo', { limit: 2 }), column('done', { limit: 2 })])
    const todo = columnRegion('todo')
    expect(within(todo).getByText('3/2')).toBeInTheDocument()
    expect(within(todo).getByTitle('Over the limit of 2')).toHaveTextContent('3/2')
    expect(within(todo).queryByText('Over the limit of 2')).not.toBeInTheDocument()
    const done = columnRegion('done')
    expect(within(done).getByText('1/2')).toBeInTheDocument()
    expect(within(done).queryByTitle(/Over the limit/)).not.toBeInTheDocument()
  })

  it('caps cards at max, offers "+N more", and expands and collapses it', () => {
    renderBoard(['a', 'b', 'c', 'd'].map((t) => note(t, 'todo')), [column('todo', { max: 2 })])
    const region = columnRegion('todo')
    expect(within(region).queryByText('c')).not.toBeInTheDocument()
    fireEvent.click(within(region).getByRole('button', { name: '+2 more' }))
    expect(within(region).getByText('d')).toBeInTheDocument()
    fireEvent.click(within(region).getByRole('button', { name: 'Show fewer' }))
    expect(within(region).queryByText('c')).not.toBeInTheDocument()
  })

  it('tells the reader how many cards a column filter hides', () => {
    const filter = { all: [{ field: 'completed', op: 'after' as const, value: '2026-02-01' }] }
    renderBoard([note('old', 'done'), note('older', 'done')], [column('done', { filter })])
    expect(within(columnRegion('done')).getByText('2 hidden by filter')).toBeInTheDocument()
  })

  it('renders an empty-board message when there are no columns', () => {
    renderBoard([], null)
    expect(screen.getByText('No notes to show on this board')).toBeInTheDocument()
  })

  it('hides the empty message when a column filter is hiding cards', () => {
    const filter = { all: [{ field: 'completed', op: 'after' as const, value: '2026-02-01' }] }
    renderBoard([note('old', 'done')], [column('done', { filter })])
    const region = columnRegion('done')
    expect(within(region).queryByText('No notes')).not.toBeInTheDocument()
    expect(within(region).getByText('1 hidden by filter')).toBeInTheDocument()
  })

  it('gives each card an accent chip per scalar property, shared by equal values', () => {
    const entries = [
      makeEntry({ path: '/v/a.md', title: 'a', properties: { Stage: 'todo', area: 'ops' } }),
      makeEntry({ path: '/v/b.md', title: 'b', properties: { Stage: 'todo', area: 'ops' } }),
    ]
    renderBoard(entries, [column('todo')], { properties: ['area'] })
    const chips = screen.getAllByText('ops')
    expect(chips).toHaveLength(2)
    expect(chips[0].getAttribute('style')).toBe(chips[1].getAttribute('style'))
    expect(chips[0].getAttribute('style')).toContain('--accent-')
  })

  it('shows due dates as urgency chips and marks overdue ones', () => {
    const day = (offset: number) => {
      const date = new Date()
      date.setDate(date.getDate() + offset)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }
    const entries = [
      makeEntry({ path: '/v/a.md', title: 'late', properties: { Stage: 'todo', due: day(-2) } }),
      makeEntry({ path: '/v/b.md', title: 'now', properties: { Stage: 'todo', due: day(0) } }),
    ]
    renderBoard(entries, [column('todo')], { properties: ['due'] })
    expect(screen.getByText('2d overdue')).toHaveAttribute('data-urgency', 'overdue')
    expect(screen.getByText('Due today')).toHaveAttribute('data-urgency', 'soon')
  })

  it('keeps each column in its own scroll area', () => {
    renderBoard(['a', 'b'].map((t) => note(t, 'todo')), [column('todo')])
    expect(screen.getByTestId('board-column-todo-notes').className).toContain('overflow-y-auto')
  })

  it('hides the chip for the value most cards in a column share, keeping the odd ones out', () => {
    const entries = ['team', 'team', 'team', 'ops'].map((area, index) =>
      makeEntry({ path: `/v/${index}.md`, title: `n${index}`, properties: { Stage: 'todo', area } }))
    renderBoard(entries, [column('todo')], { properties: ['area'] })
    expect(screen.queryByText('team')).not.toBeInTheDocument()
    expect(screen.getByText('ops')).toBeInTheDocument()
  })

  it('lets columns share the width instead of a fixed size, and fades the scroll edge', () => {
    renderBoard([note('a', 'todo')], [column('todo')])
    expect(screen.getByTestId('board-column-todo').className).not.toContain('w-72')
    expect(screen.getByTestId('board-column-todo-notes').className).toContain('mask-image')
  })

  it('uses the colour configured for a value instead of the automatic one', () => {
    const entries = [
      makeEntry({ path: '/v/a.md', title: 'a', properties: { Stage: 'todo', area: 'Ops' } }),
      makeEntry({ path: '/v/b.md', title: 'b', properties: { Stage: 'todo', area: 'jc' } }),
    ]
    renderBoard(entries, [column('todo')], { properties: ['area'], colors: { ops: 'pink' } })
    expect(screen.getByText('Ops').getAttribute('style')).toContain('--accent-pink')
    expect(screen.getByText('jc').getAttribute('style')).not.toContain('--accent-pink')
  })
})
