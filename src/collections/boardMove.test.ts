import { describe, expect, it } from 'vitest'
import { makeEntry } from '../test-utils/noteListTestUtils'
import type { FilterGroup, FilterNode, VaultEntry, ViewFile } from '../types'
import { buildBoardColumns } from './boardColumns'
import { applyBoardMovePlan, planBoardMove } from './boardMove'
import type { BoardColumnConfig } from './collectionTypes'

const TODAY = '2026-11-10'

function savedView(filename: string, nodes: FilterNode[] | FilterGroup): ViewFile {
  const filters = Array.isArray(nodes) ? { all: nodes } : nodes
  return { filename, definition: { name: filename, icon: null, color: null, sort: null, filters } }
}

const eq = (field: string, value: unknown): FilterNode => ({ field, op: 'equals', value })
const col = (view: string, overrides: Partial<BoardColumnConfig> = {}): BoardColumnConfig => ({ view, limit: null, max: null, stamp: null, ...overrides })

function plan(entry: VaultEntry, views: ViewFile[], configs: BoardColumnConfig[], target: string) {
  const columns = buildBoardColumns([entry], { type: 'board', properties: [], columns: configs, staleAfterDays: null, staleFrom: null, colors: {} }, views)
  const targetColumn = columns.find((column) => column.key === target)
  if (!targetColumn) throw new Error('missing target column')
  return planBoardMove({ entry, columns, target: targetColumn, today: TODAY })
}

const task = (properties: VaultEntry['properties'], extra: Partial<VaultEntry> = {}) =>
  makeEntry({ path: '/v/a.md', title: 'a', isA: 'Task', properties, ...extra })

const VIEWS = [
  savedView('todo.yml', [eq('type', 'Task'), eq('Stage', 'todo')]),
  savedView('done.yml', [eq('type', 'Task'), eq('Stage', 'done')]),
]
const COLS = [col('todo.yml'), col('done.yml')]

describe('planBoardMove', () => {
  it('writes only the target view conditions the note does not already meet', () => {
    expect(plan(task({ Stage: 'todo' }), VIEWS, COLS, 'done.yml')).toEqual({ writes: [{ key: 'Stage', value: 'done' }], removals: [] })
  })

  it('keeps the existing property casing and handles built-in status and type', () => {
    expect(plan(task({ stage: 'todo' }), VIEWS, COLS, 'done.yml')?.writes).toEqual([{ key: 'stage', value: 'done' }])
    const views = [savedView('a.yml', [eq('status', 'active')]), savedView('b.yml', [eq('status', 'paused')])]
    expect(plan(task({}, { status: 'active' }), views, [col('a.yml'), col('b.yml')], 'b.yml')?.writes).toEqual([{ key: 'status', value: 'paused' }])
    const typeViews = [savedView('t.yml', [eq('type', 'Task')]), savedView('n.yml', [eq('isA', 'Note')])]
    expect(plan(task({}), typeViews, [col('t.yml'), col('n.yml')], 'n.yml')?.writes).toEqual([{ key: 'type', value: 'Note' }])
  })

  it('writes several unmet conditions and keeps boolean values typed', () => {
    const views = [savedView('a.yml', [eq('Stage', 'a')]), savedView('b.yml', [eq('Stage', 'b'), eq('size', 'large'), eq('flagged', true)])]
    expect(plan(task({ Stage: 'a' }), views, [col('a.yml'), col('b.yml')], 'b.yml')?.writes)
      .toEqual([{ key: 'Stage', value: 'b' }, { key: 'size', value: 'large' }, { key: 'flagged', value: true }])
  })

  it('does nothing when the note is already in the target column', () => {
    expect(plan(task({ Stage: 'todo' }), VIEWS, COLS, 'todo.yml')).toBeNull()
  })

  it('refuses Other, missing views and target views it cannot satisfy by writing', () => {
    const columns = buildBoardColumns([task({ Stage: 'mystery' })], { type: 'board', properties: [], columns: COLS, staleAfterDays: null, staleFrom: null, colors: {} }, VIEWS)
    const other = columns.find((c) => c.isOther)!
    expect(planBoardMove({ entry: task({ Stage: 'mystery' }), columns, target: other, today: TODAY })).toBeNull()

    expect(plan(task({}), VIEWS, [col('todo.yml'), col('gone.yml')], 'gone.yml')).toBeNull()

    const hard = [
      savedView('any.yml', { any: [eq('Stage', 'x'), eq('Stage', 'y')] }),
      savedView('nested.yml', [{ any: [eq('Stage', 'x')] }]),
      savedView('range.yml', [{ field: 'due', op: 'before', value: 'today' }]),
      savedView('rel.yml', [eq('Owner', 'me')]),
      savedView('conflict.yml', [eq('Stage', 'x'), eq('Stage', 'y')]),
      savedView('title.yml', [eq('title', 'Fixed')]),
    ]
    const entry = task({ Stage: 'todo' }, { relationships: { Owner: ['[[me]]'] } })
    for (const view of hard) {
      expect(plan(entry, [...VIEWS, view], [col('todo.yml'), col(view.filename)], view.filename)).toBeNull()
    }
  })

  it('stamps today on entering a column that has a stamp', () => {
    expect(plan(task({ Stage: 'todo' }), VIEWS, [col('todo.yml'), col('done.yml', { stamp: 'completed' })], 'done.yml'))
      .toEqual({ writes: [{ key: 'Stage', value: 'done' }, { key: 'completed', value: TODAY }], removals: [] })
  })

  it('removes the source column stamp when leaving, and keeps it when the target stamps the same property', () => {
    const views = [...VIEWS, savedView('shipped.yml', [eq('Stage', 'shipped')])]
    const cols = [col('done.yml', { stamp: 'completed' }), col('todo.yml'), col('shipped.yml', { stamp: 'completed' })]
    const entry = task({ Stage: 'done', completed: '2026-11-01' })
    expect(plan(entry, views, cols, 'todo.yml')).toEqual({ writes: [{ key: 'Stage', value: 'todo' }], removals: ['completed'] })
    expect(plan(entry, views, cols, 'shipped.yml')?.removals).toEqual([])
  })
})

describe('planBoardMove with a stamp', () => {
  const doneThisWeek = savedView('week.yml', [eq('Stage', 'done'), { field: 'completed', op: 'after', value: '2000-01-01' }])
  const views = [...VIEWS, doneThisWeek]

  it('lets the stamp satisfy a condition on the stamped property', () => {
    const result = plan(task({ Stage: 'todo' }), views, [col('todo.yml'), col('week.yml', { stamp: 'completed' })], 'week.yml')
    expect(result).toEqual({ writes: [{ key: 'Stage', value: 'done' }, { key: 'completed', value: TODAY }], removals: [] })
  })

  it('refuses the same column without a stamp, since nothing can set the date', () => {
    expect(plan(task({ Stage: 'todo' }), views, [col('todo.yml'), col('week.yml')], 'week.yml')).toBeNull()
  })

  it('refuses when the stamp still would not satisfy the condition', () => {
    const before = savedView('old.yml', [eq('Stage', 'done'), { field: 'completed', op: 'before', value: '2000-01-01' }])
    expect(plan(task({ Stage: 'todo' }), [...VIEWS, before], [col('todo.yml'), col('old.yml', { stamp: 'completed' })], 'old.yml')).toBeNull()
  })
})

describe('applyBoardMovePlan', () => {
  it('writes every property, then removes stamps, in order', async () => {
    const calls: string[] = []
    await applyBoardMovePlan('/v/a.md', { writes: [{ key: 'Stage', value: 'done' }, { key: 'completed', value: TODAY }], removals: ['started'] }, {
      updateProperty: async (_path, key, value) => { calls.push(`set ${key}=${value}`) },
      deleteProperty: async (_path, key) => { calls.push(`delete ${key}`) },
    })
    expect(calls).toEqual(['set Stage=done', `set completed=${TODAY}`, 'delete started'])
  })

  it('stops at the first failed write so later edits are not applied', async () => {
    const calls: string[] = []
    const result = applyBoardMovePlan('/v/a.md', { writes: [{ key: 'Stage', value: 'done' }, { key: 'completed', value: TODAY }], removals: [] }, {
      updateProperty: async (_path, key) => { calls.push(key); throw new Error('write failed') },
      deleteProperty: async () => undefined,
    })
    await expect(result).rejects.toThrow('write failed')
    expect(calls).toEqual(['Stage'])
  })
})
