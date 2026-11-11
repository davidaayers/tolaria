import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { BoardCollectionPresentationConfig, BoardColumnConfig } from '../../collections/collectionTypes'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { FilterGroup, VaultEntry, ViewFile } from '../../types'
import { BoardWorkspace } from './BoardWorkspace'

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  })
})

function savedView(filename: string, filters: FilterGroup, extra: Partial<ViewFile['definition']> = {}): ViewFile {
  return { filename, definition: { name: filename.replace('.yml', ''), icon: null, color: null, sort: null, filters, ...extra } }
}

const stageIs = (value: string): FilterGroup => ({ all: [{ field: 'Stage', op: 'equals', value }] })
const col = (view: string, overrides: Partial<BoardColumnConfig> = {}): BoardColumnConfig => ({ view, limit: null, max: null, stamp: null, ...overrides })

const presentation = (columns: BoardColumnConfig[]): BoardCollectionPresentationConfig => ({
  type: 'board', properties: [], columns, staleAfterDays: null, staleFrom: null, colors: {},
})

const note = (title: string, properties: VaultEntry['properties'], extra: Partial<VaultEntry> = {}) =>
  makeEntry({ path: `/vault/${title}.md`, title, properties, ...extra })

const VIEWS = [savedView('todo.yml', stageIs('todo')), savedView('done.yml', stageIs('done'))]

function renderWorkspace(entries: VaultEntry[], columns: BoardColumnConfig[], options: { viewSort?: string | null; views?: ViewFile[] } = {}) {
  const props = {
    onUpdateFrontmatter: vi.fn().mockResolvedValue(undefined),
    onDeleteProperty: vi.fn().mockResolvedValue(undefined),
    onOpenInList: vi.fn(),
  }
  render(
    <BoardWorkspace
      presentation={presentation(columns)}
      viewSort={options.viewSort ?? null}
      entries={entries}
      allEntries={entries}
      views={options.views ?? VIEWS}
      locale="en"
      {...props}
    />,
  )
  return props
}

describe('BoardWorkspace', () => {
  const entries = [note('Alpha', { Stage: 'todo', Area: 'Home' }, { snippet: 'First note body' }), note('Beta', { Stage: 'done' })]
  const columns = [col('todo.yml'), col('done.yml', { stamp: 'completed' })]

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

  it('moves a note by writing what the target View requires, stamping in order', async () => {
    const { onUpdateFrontmatter, onDeleteProperty } = renderWorkspace(entries, columns)
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Move to column' }))
    fireEvent.click(await screen.findByRole('option', { name: 'done' }))
    await vi.waitFor(() => expect(onUpdateFrontmatter).toHaveBeenCalledTimes(2))
    expect(onUpdateFrontmatter).toHaveBeenNthCalledWith(1, '/vault/Alpha.md', 'Stage', 'done')
    expect(onUpdateFrontmatter).toHaveBeenNthCalledWith(2, '/vault/Alpha.md', 'completed', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    expect(onDeleteProperty).not.toHaveBeenCalled()
  })

  it('offers only the columns the note can be moved into', async () => {
    const views = [...VIEWS, savedView('hard.yml', { any: [{ field: 'Stage', op: 'equals', value: 'x' }] })]
    renderWorkspace(entries, [...columns, col('hard.yml')], { views })
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Move to column' }))
    expect(await screen.findByRole('option', { name: 'done' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('option', { name: 'hard' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('locks the control when no column can receive the note', () => {
    const views = [savedView('hard.yml', { any: [{ field: 'Stage', op: 'equals', value: 'x' }] })]
    renderWorkspace([note('Solo', { Stage: 'x' })], [col('hard.yml')], { views })
    fireEvent.click(screen.getByRole('button', { name: /Solo/ }))
    expect(screen.getByRole('combobox', { name: 'Move to column' })).toBeDisabled()
    expect(screen.getByText("This note can't be moved from the board")).toBeInTheDocument()
  })

  it('orders cards by the board View sort when the column View has none', () => {
    renderWorkspace([note('b', { Stage: 'todo' }), note('a', { Stage: 'todo' })], [col('todo.yml')], { viewSort: 'title:asc' })
    const cards = within(screen.getByRole('region', { name: 'todo' })).getAllByRole('button').map((b) => b.textContent)
    expect(cards).toEqual(['a', 'b'])
  })
})
