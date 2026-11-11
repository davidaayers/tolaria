import { describe, expect, it } from 'vitest'
import type { FilterGroup, FilterNode, ViewFile } from '../types'
import { buildBoardColumns } from './boardColumns'
import { planBoardCreate } from './boardCreate'
import type { BoardColumnConfig } from './collectionTypes'

const TODAY = '2026-11-10'

function savedView(filename: string, nodes: FilterNode[] | FilterGroup): ViewFile {
  const filters = Array.isArray(nodes) ? { all: nodes } : nodes
  return { filename, definition: { name: filename, icon: null, color: null, sort: null, filters } }
}

const eq = (field: string, value: unknown): FilterNode => ({ field, op: 'equals', value })
const col = (view: string, overrides: Partial<BoardColumnConfig> = {}): BoardColumnConfig => ({ view, wipLimit: null, show: null, stamp: null, ...overrides })

const BOARD = savedView('board.yml', [eq('type', 'Task')])
const VIEWS = [
  savedView('todo.yml', [eq('type', 'Task'), eq('Stage', 'todo')]),
  savedView('done.yml', [eq('type', 'Task'), eq('Stage', 'done'), eq('flagged', true)]),
]

function plan(views: ViewFile[], configs: BoardColumnConfig[], target: string, boardView: ViewFile | null = BOARD) {
  const columns = buildBoardColumns([], { type: 'board', properties: [], columns: configs, staleAfterDays: null, staleFrom: null, colors: {} }, views, boardView)
  const column = columns.find((candidate) => candidate.key === target)
  if (!column) throw new Error('missing target column')
  return planBoardCreate({ target: column, boardView, today: TODAY })
}

describe('planBoardCreate', () => {
  it('gives a new card the type and every property its column View requires', () => {
    expect(plan(VIEWS, [col('todo.yml'), col('done.yml')], 'done.yml')).toEqual({
      type: 'Task',
      properties: { Stage: 'done', flagged: true },
    })
  })

  it('counts the board View’s own conditions and asks for each only once', () => {
    const board = savedView('board.yml', [eq('type', 'Task'), eq('area', 'ops')])
    expect(plan(VIEWS, [col('todo.yml')], 'todo.yml', board)).toEqual({ type: 'Task', properties: { area: 'ops', Stage: 'todo' } })
  })

  it('falls back to a plain Note when nothing names a type', () => {
    const views = [savedView('a.yml', [eq('Stage', 'a')])]
    expect(plan(views, [col('a.yml')], 'a.yml', savedView('board.yml', []))).toEqual({ type: 'Note', properties: { Stage: 'a' } })
  })

  it('writes the built-in status as a property named status', () => {
    const views = [savedView('open.yml', [eq('type', 'Task'), eq('status', 'open')])]
    expect(plan(views, [col('open.yml')], 'open.yml')).toEqual({ type: 'Task', properties: { status: 'open' } })
  })

  it('stamps today when the column has a stamp, and lets it satisfy a date condition', () => {
    const week = savedView('week.yml', [eq('type', 'Task'), eq('Stage', 'done'), { field: 'completed', op: 'after', value: 'start of week' }])
    expect(plan([...VIEWS, week], [col('week.yml', { stamp: 'completed' })], 'week.yml')).toEqual({
      type: 'Task',
      properties: { Stage: 'done', completed: TODAY },
    })
  })

  it('refuses a column whose date condition nothing can satisfy', () => {
    const week = savedView('week.yml', [eq('type', 'Task'), { field: 'completed', op: 'after', value: 'start of week' }])
    expect(plan([week], [col('week.yml')], 'week.yml')).toBeNull()
  })

  it('refuses columns a card cannot be written into', () => {
    const views = [
      savedView('any.yml', { any: [eq('Stage', 'x'), eq('Stage', 'y')] }),
      savedView('title.yml', [eq('type', 'Task'), eq('title', 'Fixed')]),
      savedView('clash.yml', [eq('type', 'Note')]),
    ]
    for (const name of ['any.yml', 'title.yml', 'clash.yml']) {
      expect(plan(views, [col(name)], name)).toBeNull()
    }
  })

  it('refuses the missing-View and Other columns', () => {
    const columns = buildBoardColumns([], { type: 'board', properties: [], columns: [col('gone.yml')], staleAfterDays: null, staleFrom: null, colors: {} }, VIEWS, BOARD)
    expect(planBoardCreate({ target: columns[0], boardView: BOARD, today: TODAY })).toBeNull()
  })
})
