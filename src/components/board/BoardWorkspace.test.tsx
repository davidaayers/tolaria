import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { BoardCollectionPresentationConfig, BoardColumnConfig } from '../../collections/collectionTypes'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { VaultEntry } from '../../types'
import { BoardWorkspace } from './BoardWorkspace'

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  })
})

function column(value: string, overrides: Partial<BoardColumnConfig> = {}): BoardColumnConfig {
  return { value, label: null, limit: null, max: null, sort: null, filter: null, stamp: null, ...overrides }
}

const presentation = (columns: BoardColumnConfig[]): BoardCollectionPresentationConfig => ({
  type: 'board', groupBy: 'Stage', properties: [], columns, staleAfterDays: null, staleFrom: null,
})

const note = (title: string, properties: VaultEntry['properties'], snippet = '') =>
  makeEntry({ path: `/vault/${title}.md`, title, properties, snippet })

function renderWorkspace(entries: VaultEntry[], columns: BoardColumnConfig[], viewSort: string | null = null) {
  const props = {
    onUpdateFrontmatter: vi.fn().mockResolvedValue(undefined),
    onDeleteProperty: vi.fn().mockResolvedValue(undefined),
    onOpenInList: vi.fn(),
  }
  render(
    <BoardWorkspace
      presentation={presentation(columns)}
      viewSort={viewSort}
      entries={entries}
      allEntries={entries}
      locale="en"
      {...props}
    />,
  )
  return props
}

describe('BoardWorkspace', () => {
  const entries = [note('Alpha', { Stage: 'todo', Area: 'Home' }, 'First note body'), note('Beta', { Stage: 'done' })]
  const columns = [column('todo'), column('done', { stamp: 'completed' })]

  it('shows the board without a side panel until a card is selected', () => {
    renderWorkspace(entries, columns)
    expect(screen.getByRole('region', { name: 'todo' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Note details' })).not.toBeInTheDocument()
  })

  it('opens a side panel with the note title, properties and body, and closes it again', () => {
    renderWorkspace(entries, columns)
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    const panel = screen.getByRole('complementary', { name: 'Note details' })
    expect(within(panel).getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
    expect(within(panel).getByText('Home')).toBeInTheDocument()
    expect(within(panel).getByText('First note body')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Close panel' }))
    expect(screen.queryByRole('complementary', { name: 'Note details' })).not.toBeInTheDocument()
  })

  it('returns to the normal layout with the selected note open', () => {
    const { onOpenInList } = renderWorkspace(entries, columns)
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }))
    expect(onOpenInList).toHaveBeenCalledWith(expect.objectContaining({ path: '/vault/Alpha.md' }))
  })

  it('moves a note to another column from the panel, stamping and clearing in order', async () => {
    const { onUpdateFrontmatter, onDeleteProperty } = renderWorkspace(entries, columns)
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Move to column' }))
    fireEvent.click(await screen.findByRole('option', { name: 'done' }))
    await vi.waitFor(() => expect(onUpdateFrontmatter).toHaveBeenCalledTimes(2))
    expect(onUpdateFrontmatter).toHaveBeenNthCalledWith(1, '/vault/Alpha.md', 'Stage', 'done')
    expect(onUpdateFrontmatter).toHaveBeenNthCalledWith(2, '/vault/Alpha.md', 'completed', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    expect(onDeleteProperty).not.toHaveBeenCalled()
  })

  it('locks the control for a note whose group-by value is a list', () => {
    renderWorkspace([note('Listy', { Stage: ['a', 'b'] })], columns)
    fireEvent.click(screen.getByRole('button', { name: /Listy/ }))
    expect(screen.getByRole('combobox', { name: 'Move to column' })).toBeDisabled()
    expect(screen.getByText("This note's value can't be changed from the board")).toBeInTheDocument()
  })

  it('applies the view sort to cards when no column sort is set', () => {
    const sorted = [note('b', { Stage: 'todo' }), note('a', { Stage: 'todo' })]
    renderWorkspace(sorted, [column('todo')], 'title:asc')
    const cards = within(screen.getByRole('region', { name: 'todo' })).getAllByRole('button').map((b) => b.textContent)
    expect(cards).toEqual(['a', 'b'])
  })
})
