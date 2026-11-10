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
  return { type: 'board', groupBy: 'Stage', properties: [], columns, staleAfterDays: null, staleFrom: null }
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
    expect(within(todo).getByText('Over the limit of 2')).toBeInTheDocument()
    const done = columnRegion('done')
    expect(within(done).getByText('1/2')).toBeInTheDocument()
    expect(within(done).queryByText(/Over the limit/)).not.toBeInTheDocument()
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
})
