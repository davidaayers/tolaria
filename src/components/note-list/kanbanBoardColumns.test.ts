import { describe, expect, it } from 'vitest'
import type { KanbanColumnConfig } from '../../collections/collectionTypes'
import { buildViewColumns } from '../../collections/kanbanViewColumns'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { FilterGroup, ViewFile } from '../../types'
import { groupBoardColumns, settleViewMoves, viewBoardColumns, type ViewPendingMoves } from './kanbanBoardColumns'

const stageIs = (value: string): FilterGroup => ({ all: [{ field: 'Stage', op: 'equals', value }] })
const view = (filename: string, value: string, name = filename): ViewFile => ({
  filename, definition: { name, icon: null, color: null, sort: null, filters: stageIs(value) },
})
const col = (name: string, extra: Partial<KanbanColumnConfig> = {}): KanbanColumnConfig => ({ view: name, wipLimit: null, show: null, stamp: null, ...extra })
const note = (title: string, stage: string) => makeEntry({ path: `/v/${title}.md`, title, properties: { Stage: stage } })
const VIEWS = [view('todo.yml', 'todo', 'To do'), view('done.yml', 'done', 'Done')]
const titles = (cards: Array<{ title: string }>) => cards.map((card) => card.title)

describe('groupBoardColumns', () => {
  it('orders group-by columns and titles the empty one "No value"', () => {
    const entries = [note('a', 'todo'), makeEntry({ path: '/v/b.md', title: 'b' })]
    const columns = groupBoardColumns(entries, 'Stage', new Map(), [], 'en')
    expect(columns.map((column) => [column.key, column.title, column.count])).toEqual([['todo', 'todo', 1], ['', 'No value', 1]])
    expect(columns.every((column) => column.reorderable)).toBe(true)
  })
})

describe('viewBoardColumns', () => {
  const built = (entries = [note('a', 'todo'), note('b', 'done'), note('c', 'mystery')], configs = [col('todo.yml'), col('done.yml')]) =>
    buildViewColumns(entries, configs, VIEWS)

  it('titles missing views and keeps every column reorderable', () => {
    const columns = viewBoardColumns(built(undefined, [col('todo.yml'), col('gone.yml')]), new Map(), 'en')
    expect(columns.map((column) => column.title)).toEqual(['To do', 'gone (View not found)'])
    expect(columns.map((column) => column.reorderable)).toEqual([true, true])
    expect(columns[1].missing).toBe(true)
  })

  it('caps cards at show and counts what is hidden', () => {
    const entries = ['a', 'b', 'c'].map((title) => note(title, 'todo'))
    const [todo] = viewBoardColumns(built(entries, [col('todo.yml', { show: 2, wipLimit: 2 })]), new Map(), 'en')
    expect(titles(todo.cards)).toEqual(['a', 'b'])
    expect(todo).toMatchObject({ count: 3, hiddenCount: 1, wipLimit: 2, overLimit: true })
  })

  it('shows a dropped card in its new column right away, leaving only its origin', () => {
    const columns = built()
    const moved = note('a', 'todo')
    const pending: ViewPendingMoves = new Map([[moved.path, { entry: moved, from: 'todo.yml', to: 'done.yml' }]])
    const [todo, done] = viewBoardColumns(columns, pending, 'en')
    expect(titles(todo.cards)).toEqual([])
    expect(titles(done.cards)).toEqual(['a', 'b'])
  })

  it('leaves other columns that still match the card untouched', () => {
    const both = [view('todo.yml', 'todo'), view('also.yml', 'todo')]
    const entry = note('a', 'todo')
    const columns = buildViewColumns([entry], [col('todo.yml'), col('also.yml'), col('done.yml')], [...both, VIEWS[1]])
    const pending: ViewPendingMoves = new Map([[entry.path, { entry, from: 'todo.yml', to: 'done.yml' }]])
    const [todo, also, done] = viewBoardColumns(columns, pending, 'en')
    expect(titles(todo.cards)).toEqual([])
    expect(titles(also.cards)).toEqual(['a'])
    expect(titles(done.cards)).toEqual(['a'])
  })
})

describe('settleViewMoves', () => {
  it('drops a pending move once the target column reports the card, and keeps it until then', () => {
    const moved = note('a', 'todo')
    const pending: ViewPendingMoves = new Map([[moved.path, { entry: moved, from: 'todo.yml', to: 'done.yml' }]])
    expect(settleViewMoves(pending, buildViewColumns([moved], [col('todo.yml'), col('done.yml')], VIEWS))).toBe(pending)
    const confirmed = note('a', 'done')
    expect(settleViewMoves(pending, buildViewColumns([confirmed], [col('todo.yml'), col('done.yml')], VIEWS)).size).toBe(0)
  })

  it('drops a move whose target column no longer exists', () => {
    const moved = note('a', 'todo')
    const pending: ViewPendingMoves = new Map([[moved.path, { entry: moved, from: 'todo.yml', to: 'gone.yml' }]])
    expect(settleViewMoves(pending, buildViewColumns([moved], [col('todo.yml')], VIEWS)).size).toBe(0)
  })
})
