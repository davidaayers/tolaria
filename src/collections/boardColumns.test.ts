import { describe, expect, it } from 'vitest'
import type { VaultEntry } from '../types'
import { buildBoardColumns, OTHER_COLUMN_KEY } from './boardColumns'
import type { BoardCollectionPresentationConfig, BoardColumnConfig } from './collectionTypes'

function entry(title: string, overrides: Partial<VaultEntry> = {}): VaultEntry {
  return {
    path: `/vault/${title}.md`, filename: `${title}.md`, title, isA: null,
    aliases: [], belongsTo: [], relatedTo: [], status: null,
    archived: false,
    modifiedAt: 0, createdAt: 0, fileSize: 100, snippet: '',
    wordCount: 0, relationships: {}, icon: null, color: null,
    order: null, sidebarLabel: null, template: null, sort: null, view: null,
    visible: null, favorite: false, favoriteIndex: null,
    outgoingLinks: [], properties: {}, listPropertiesDisplay: [],
    ...overrides,
  } as VaultEntry
}

function column(value: string, overrides: Partial<BoardColumnConfig> = {}): BoardColumnConfig {
  return { value, label: null, limit: null, max: null, sort: null, filter: null, stamp: null, ...overrides }
}

function board(
  columns: BoardColumnConfig[] | null,
  overrides: Partial<BoardCollectionPresentationConfig> = {},
): BoardCollectionPresentationConfig {
  return { type: 'board', groupBy: 'Stage', properties: [], columns, staleAfterDays: null, staleFrom: null, ...overrides }
}

const withStatus = (title: string, status: unknown, extra: Partial<VaultEntry> = {}) =>
  entry(title, { properties: { Stage: status as never }, ...extra })

function titles(result: ReturnType<typeof buildBoardColumns>, key: string): string[] {
  return result.find((c) => c.key === key)?.cards.map((card) => card.entry.title) ?? []
}

describe('buildBoardColumns', () => {
  it('places notes in declared columns in declared order, matching case-insensitively after trimming', () => {
    const result = buildBoardColumns(
      [withStatus('a', 'Todo'), withStatus('b', ' DONE '), withStatus('c', 'todo')],
      board([column('todo'), column('done')]),
    )
    expect(result.map((c) => c.key)).toEqual(['todo', 'done'])
    expect(titles(result, 'todo')).toEqual(['a', 'c'])
    expect(titles(result, 'done')).toEqual(['b'])
  })

  it('keeps declared columns even when empty and uses the label, falling back to the value', () => {
    const result = buildBoardColumns([], board([column('todo', { label: 'To do' }), column('done')]))
    expect(result.map((c) => c.label)).toEqual(['To do', 'done'])
    expect(result.every((c) => c.cards.length === 0)).toBe(true)
  })

  it('derives one alphabetical column per distinct value when none are declared', () => {
    const result = buildBoardColumns(
      [withStatus('a', 'Waiting'), withStatus('b', 'backlog'), withStatus('c', 'waiting'), withStatus('d', 'Done')],
      board(null),
    )
    expect(result.map((c) => c.key)).toEqual(['backlog', 'done', 'waiting'])
    expect(result.map((c) => c.label)).toEqual(['backlog', 'Done', 'Waiting'])
    expect(titles(result, 'waiting')).toEqual(['a', 'c'])
  })

  it('collects unmatched, empty and unsupported values in Other, shown only when non-empty', () => {
    const none = buildBoardColumns([withStatus('a', 'todo')], board([column('todo')]))
    expect(none.map((c) => c.key)).toEqual(['todo'])

    const result = buildBoardColumns(
      [withStatus('a', 'todo'), withStatus('b', 'mystery'), entry('c'), withStatus('d', ''), withStatus('e', ['x', 'y'])],
      board([column('todo')]),
    )
    expect(result.map((c) => c.key)).toEqual(['todo', OTHER_COLUMN_KEY])
    expect(titles(result, OTHER_COLUMN_KEY)).toEqual(['b', 'c', 'd', 'e'])
    expect(result[1]).toMatchObject({ isOther: true, value: null })
  })

  it('marks notes with list or wikilink values as not draggable, and scalar or empty values as draggable', () => {
    const result = buildBoardColumns(
      [
        withStatus('scalar', 'todo'),
        entry('empty'),
        withStatus('list', ['x']),
        entry('link', { relationships: { Stage: ['[[todo]]'] } }),
      ],
      board([column('todo')]),
    )
    const draggable = Object.fromEntries(result.flatMap((c) => c.cards).map((card) => [card.entry.title, card.draggable]))
    expect(draggable).toEqual({ scalar: true, empty: true, list: false, link: false })
    expect(titles(result, OTHER_COLUMN_KEY)).toContain('link')
  })

  it('reads built-in fields and treats numbers and booleans as scalar values', () => {
    const builtIn = buildBoardColumns(
      [entry('a', { status: 'Active' }), entry('b', { status: 'Paused' })],
      board([column('active'), column('paused')], { groupBy: 'status' }),
    )
    expect(titles(builtIn, 'active')).toEqual(['a'])

    const typed = buildBoardColumns(
      [entry('a', { properties: { Priority: 2 } }), entry('b', { properties: { Priority: true } })],
      board([column('2'), column('true')], { groupBy: 'priority' }),
    )
    expect(titles(typed, '2')).toEqual(['a'])
    expect(titles(typed, 'true')).toEqual(['b'])
  })

  it('preserves incoming order unless the column declares a sort', () => {
    const entries = [
      withStatus('c', 'todo', { properties: { Stage: 'todo', due: '2026-03-01' } }),
      withStatus('a', 'todo', { properties: { Stage: 'todo', due: '2026-01-01' } }),
      withStatus('b', 'todo', { properties: { Stage: 'todo', due: '2026-02-01' } }),
    ]
    expect(titles(buildBoardColumns(entries, board([column('todo')])), 'todo')).toEqual(['c', 'a', 'b'])
    expect(titles(buildBoardColumns(entries, board([column('todo', { sort: 'property:due:asc' })])), 'todo'))
      .toEqual(['a', 'b', 'c'])
    expect(titles(buildBoardColumns(entries, board([column('todo', { sort: 'garbage' })])), 'todo'))
      .toEqual(['c', 'a', 'b'])
  })

  it('applies a column filter only to that column and hides cards it rejects', () => {
    const filter = { all: [{ field: 'completed', op: 'after' as const, value: '2026-02-01' }] }
    const result = buildBoardColumns(
      [
        withStatus('old', 'done', { properties: { Stage: 'done', completed: '2026-01-10' } }),
        withStatus('new', 'done', { properties: { Stage: 'done', completed: '2026-02-10' } }),
        withStatus('open', 'todo', { properties: { Stage: 'todo', completed: '2026-01-10' } }),
      ],
      board([column('todo'), column('done', { filter })]),
    )
    expect(titles(result, 'done')).toEqual(['new'])
    expect(titles(result, 'todo')).toEqual(['open'])
    expect(result.some((c) => c.isOther)).toBe(false)
  })

  it('caps visible cards at max and reports how many are hidden', () => {
    const entries = ['a', 'b', 'c', 'd'].map((t) => withStatus(t, 'todo'))
    const [todo] = buildBoardColumns(entries, board([column('todo', { max: 3 })]))
    expect(todo.cards).toHaveLength(4)
    expect(todo.visibleCards.map((c) => c.entry.title)).toEqual(['a', 'b', 'c'])
    expect(todo.hiddenCount).toBe(1)

    const [uncapped] = buildBoardColumns(entries, board([column('todo')]))
    expect(uncapped.visibleCards).toHaveLength(4)
    expect(uncapped.hiddenCount).toBe(0)
  })

  it('flags a column as over its work-in-progress limit only when the count exceeds it', () => {
    const entries = ['a', 'b', 'c'].map((t) => withStatus(t, 'todo'))
    expect(buildBoardColumns(entries, board([column('todo', { limit: 2 })]))[0])
      .toMatchObject({ limit: 2, overLimit: true })
    expect(buildBoardColumns(entries, board([column('todo', { limit: 3 })]))[0].overLimit).toBe(false)
    expect(buildBoardColumns(entries, board([column('todo')]))[0]).toMatchObject({ limit: null, overLimit: false })
  })

  it('returns no columns for an empty derived board', () => {
    expect(buildBoardColumns([], board(null))).toEqual([])
  })
})
