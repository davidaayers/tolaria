import { describe, expect, it } from 'vitest'
import { makeEntry } from '../test-utils/noteListTestUtils'
import type { VaultEntry } from '../types'
import { buildBoardColumns } from './boardColumns'
import { applyBoardMovePlan, planBoardMove } from './boardMove'
import type { BoardCollectionPresentationConfig, BoardColumnConfig } from './collectionTypes'

const TODAY = '2026-11-10'

function column(value: string, overrides: Partial<BoardColumnConfig> = {}): BoardColumnConfig {
  return { value, label: null, limit: null, max: null, sort: null, filter: null, stamp: null, ...overrides }
}

function plan(entry: VaultEntry, columns: BoardColumnConfig[], target: string | null, groupBy = 'Stage') {
  const config: BoardCollectionPresentationConfig = {
    type: 'board', groupBy, properties: [], columns, staleAfterDays: null, staleFrom: null,
  }
  const built = buildBoardColumns([entry], config)
  const targetColumn = built.find((candidate) => (target === null ? candidate.isOther : candidate.key === target))
  if (!targetColumn) throw new Error('missing target column')
  return planBoardMove({ entry, groupBy, columns: built, target: targetColumn, today: TODAY })
}

const note = (properties: VaultEntry['properties'], extra: Partial<VaultEntry> = {}) =>
  makeEntry({ path: '/vault/a.md', title: 'a', properties, ...extra })

describe('planBoardMove', () => {
  it('writes the target column value to the existing property key, keeping its casing', () => {
    expect(plan(note({ Stage: 'todo' }), [column('todo'), column('Done')], 'done'))
      .toEqual({ writes: [{ key: 'Stage', value: 'Done' }], removals: [] })
  })

  it('uses the group-by name when the note has no value yet', () => {
    expect(plan(note({}), [column('todo')], 'todo')).toEqual({ writes: [{ key: 'Stage', value: 'todo' }], removals: [] })
  })

  it('writes built-in status and maps type onto the type key', () => {
    const entry = note({}, { status: 'Active' })
    expect(plan(entry, [column('active'), column('paused')], 'paused', 'status').writes).toEqual([{ key: 'status', value: 'paused' }])
    expect(plan(note({}, { isA: 'Task' }), [column('task'), column('note')], 'note', 'isA').writes).toEqual([{ key: 'type', value: 'note' }])
  })

  it('does nothing when the card is already in the target column', () => {
    expect(plan(note({ Stage: 'todo' }), [column('todo')], 'todo')).toBeNull()
  })

  it('refuses to move into Other, which has no value to write', () => {
    expect(plan(note({ Stage: 'mystery' }), [column('todo')], null)).toBeNull()
  })

  it('refuses to move cards whose group-by value is a list', () => {
    expect(plan(note({ Stage: ['x', 'y'] }), [column('todo')], 'todo')).toBeNull()
  })

  it('stamps today on entering a column that has a stamp', () => {
    expect(plan(note({ Stage: 'todo' }), [column('todo'), column('done', { stamp: 'completed' })], 'done'))
      .toEqual({ writes: [{ key: 'Stage', value: 'done' }, { key: 'completed', value: TODAY }], removals: [] })
  })

  it('removes the source column stamp when leaving, and keeps it when the target stamps the same property', () => {
    const columns = [column('done', { stamp: 'completed' }), column('todo'), column('shipped', { stamp: 'completed' })]
    const entry = note({ Stage: 'done', completed: '2026-11-01' })
    expect(plan(entry, columns, 'todo')).toEqual({ writes: [{ key: 'Stage', value: 'todo' }], removals: ['completed'] })
    expect(plan(entry, columns, 'shipped')?.removals).toEqual([])
  })
})

describe('applyBoardMovePlan', () => {
  it('writes every property, then removes stamps, in order', async () => {
    const calls: string[] = []
    await applyBoardMovePlan('/vault/a.md', { writes: [{ key: 'Stage', value: 'done' }, { key: 'completed', value: TODAY }], removals: ['started'] }, {
      updateProperty: async (_path, key, value) => { calls.push(`set ${key}=${value}`) },
      deleteProperty: async (_path, key) => { calls.push(`delete ${key}`) },
    })
    expect(calls).toEqual(['set Stage=done', `set completed=${TODAY}`, 'delete started'])
  })

  it('stops at the first failed write so later edits are not applied', async () => {
    const calls: string[] = []
    const result = applyBoardMovePlan('/vault/a.md', { writes: [{ key: 'Stage', value: 'done' }, { key: 'completed', value: TODAY }], removals: [] }, {
      updateProperty: async (_path, key) => { calls.push(key); throw new Error('write failed') },
      deleteProperty: async () => undefined,
    })
    await expect(result).rejects.toThrow('write failed')
    expect(calls).toEqual(['Stage'])
  })
})
