import { describe, expect, it } from 'vitest'
import { makeEntry } from '../test-utils/noteListTestUtils'
import type { FilterGroup, VaultEntry, ViewFile } from '../types'
import { buildBoardColumns, OTHER_COLUMN_KEY } from './boardColumns'
import type { BoardCollectionPresentationConfig, BoardColumnConfig } from './collectionTypes'

function savedView(filename: string, filters: FilterGroup, extra: Partial<ViewFile['definition']> = {}, rootPath?: string): ViewFile {
  return { filename, rootPath, definition: { name: filename.replace('.yml', ''), icon: null, color: null, sort: null, filters, ...extra } }
}

const stageIs = (value: string): FilterGroup => ({ all: [{ field: 'Stage', op: 'equals', value }] })

function col(view: string, overrides: Partial<BoardColumnConfig> = {}): BoardColumnConfig {
  return { view, wipLimit: null, show: null, stamp: null, ...overrides }
}

function board(columns: BoardColumnConfig[]): BoardCollectionPresentationConfig {
  return { type: 'board', properties: [], columns, staleAfterDays: null, staleFrom: null, colors: {} }
}

const note = (title: string, stage?: string, extra: Partial<VaultEntry> = {}) =>
  makeEntry({ path: `/v/${title}.md`, title, properties: stage === undefined ? {} : { Stage: stage }, ...extra })

const VIEWS = [
  savedView('todo.yml', stageIs('todo'), { name: 'To do', icon: 'tray', color: 'gray' }),
  savedView('done.yml', stageIs('done'), { name: 'Done', icon: '✅', color: 'green' }),
]

const titles = (columns: ReturnType<typeof buildBoardColumns>, key: string) =>
  columns.find((c) => c.key === key)?.cards.map((card) => card.entry.title) ?? []

describe('buildBoardColumns', () => {
  it('builds one column per referenced view, in order, taking name, icon and colour from the view', () => {
    const result = buildBoardColumns([note('a', 'todo'), note('b', 'done')], board([col('done.yml'), col('todo.yml')]), VIEWS)
    expect(result.map((c) => c.key)).toEqual(['done.yml', 'todo.yml'])
    expect(result[0]).toMatchObject({ label: 'Done', icon: '✅', color: 'green', missing: false, isOther: false })
    expect(result[1]).toMatchObject({ label: 'To do', icon: 'tray', color: 'gray' })
    expect(titles(result, 'todo.yml')).toEqual(['a'])
    expect(titles(result, 'done.yml')).toEqual(['b'])
  })

  it('ignores an invalid view colour', () => {
    const views = [savedView('todo.yml', stageIs('todo'), { color: 'chartreuse' })]
    expect(buildBoardColumns([], board([col('todo.yml')]), views)[0].color).toBeNull()
  })

  it('keeps empty columns', () => {
    const result = buildBoardColumns([], board([col('todo.yml')]), VIEWS)
    expect(result[0].cards).toEqual([])
  })

  it('puts notes that match no column in Other, shown only when non-empty', () => {
    const none = buildBoardColumns([note('a', 'todo')], board([col('todo.yml')]), VIEWS)
    expect(none.map((c) => c.key)).toEqual(['todo.yml'])

    const result = buildBoardColumns([note('a', 'todo'), note('b', 'mystery'), note('c')], board([col('todo.yml')]), VIEWS)
    expect(result.map((c) => c.key)).toEqual(['todo.yml', OTHER_COLUMN_KEY])
    expect(titles(result, OTHER_COLUMN_KEY)).toEqual(['b', 'c'])
    expect(result[1]).toMatchObject({ isOther: true, view: null })
  })

  it('shows a note in every column whose view it matches', () => {
    const views = [
      savedView('todo.yml', stageIs('todo')),
      savedView('tagged.yml', { all: [{ field: 'area', op: 'equals', value: 'ops' }] }),
    ]
    const entry = makeEntry({ path: '/v/a.md', title: 'a', properties: { Stage: 'todo', area: 'ops' } })
    const result = buildBoardColumns([entry], board([col('todo.yml'), col('tagged.yml')]), views)
    expect(titles(result, 'todo.yml')).toEqual(['a'])
    expect(titles(result, 'tagged.yml')).toEqual(['a'])
    expect(result.some((c) => c.isOther)).toBe(false)
  })

  it('marks a column missing when its view does not exist, and keeps it in place', () => {
    const result = buildBoardColumns([note('a', 'todo')], board([col('gone.yml'), col('todo.yml')]), VIEWS)
    expect(result[0]).toMatchObject({ key: 'gone.yml', missing: true, label: 'gone', view: null, cards: [] })
    expect(titles(result, 'todo.yml')).toEqual(['a'])
  })

  it('never uses the board view as its own column, and prefers a view from the board vault', () => {
    const boardView = savedView('board.yml', { all: [] })
    const own = savedView('todo.yml', stageIs('todo'), { name: 'Own' }, '/vault-a')
    const foreign = savedView('todo.yml', stageIs('todo'), { name: 'Foreign' }, '/vault-b')
    const sameName = buildBoardColumns([], board([col('board.yml')]), [boardView], boardView)
    expect(sameName[0].missing).toBe(true)
    const picked = buildBoardColumns([], board([col('todo.yml')]), [foreign, own], { ...boardView, rootPath: '/vault-a' })
    expect(picked[0].label).toBe('Own')
  })

  it("orders a column by its view's sort, and otherwise keeps the incoming order", () => {
    const entries = ['c', 'a', 'b'].map((t) => note(t, 'todo'))
    const sorted = [savedView('todo.yml', stageIs('todo'), { sort: 'title:asc' })]
    expect(titles(buildBoardColumns(entries, board([col('todo.yml')]), sorted), 'todo.yml')).toEqual(['a', 'b', 'c'])
    expect(titles(buildBoardColumns(entries, board([col('todo.yml')]), VIEWS), 'todo.yml')).toEqual(['c', 'a', 'b'])
  })

  it('caps visible cards at show and reports how many are hidden', () => {
    const entries = ['a', 'b', 'c', 'd'].map((t) => note(t, 'todo'))
    const [todo] = buildBoardColumns(entries, board([col('todo.yml', { show: 3 })]), VIEWS)
    expect(todo.cards).toHaveLength(4)
    expect(todo.visibleCards.map((c) => c.entry.title)).toEqual(['a', 'b', 'c'])
    expect(todo.hiddenCount).toBe(1)
    const [uncapped] = buildBoardColumns(entries, board([col('todo.yml')]), VIEWS)
    expect(uncapped).toMatchObject({ hiddenCount: 0 })
    expect(uncapped.visibleCards).toHaveLength(4)
  })

  it('flags a column over its WIP limit only when the count exceeds it', () => {
    const entries = ['a', 'b', 'c'].map((t) => note(t, 'todo'))
    expect(buildBoardColumns(entries, board([col('todo.yml', { wipLimit: 2 })]), VIEWS)[0]).toMatchObject({ wipLimit: 2, overLimit: true })
    expect(buildBoardColumns(entries, board([col('todo.yml', { wipLimit: 3 })]), VIEWS)[0].overLimit).toBe(false)
    expect(buildBoardColumns(entries, board([col('todo.yml')]), VIEWS)[0]).toMatchObject({ wipLimit: null, overLimit: false })
  })
})
