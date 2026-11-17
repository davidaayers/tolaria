import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { KanbanColumnConfig } from '../../collections/collectionTypes'
import { buildViewColumns } from '../../collections/kanbanViewColumns'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { FilterGroup, ViewFile } from '../../types'
import { todayIso, useViewCardMoves } from './useKanbanMoves'

const stageIs = (value: string): FilterGroup => ({ all: [{ field: 'Stage', op: 'equals', value }] })
const view = (filename: string, value: string): ViewFile => ({ filename, definition: { name: filename, icon: null, color: null, sort: null, filters: stageIs(value) } })
const col = (name: string, extra: Partial<KanbanColumnConfig> = {}): KanbanColumnConfig => ({ view: name, wipLimit: null, show: null, stamp: null, ...extra })
const VIEWS = [view('todo.yml', 'todo'), view('done.yml', 'done'), view('week.yml', 'week')]
const note = makeEntry({ path: '/v/a.md', title: 'A', properties: { Stage: 'todo' } })

function setup(onApplyMove = vi.fn().mockResolvedValue(undefined)) {
  const columns = buildViewColumns([note], [col('todo.yml'), col('done.yml', { stamp: 'completed' })], VIEWS)
  const hook = renderHook(() => useViewCardMoves({ columns, onApplyMove }))
  return { hook, onApplyMove }
}

describe('useViewCardMoves', () => {
  it('plans the write from the target View and shows the card there until confirmed', () => {
    const { hook, onApplyMove } = setup()
    let accepted = false
    act(() => { accepted = hook.result.current.onCardDrop(note, 'todo.yml', 'done.yml') })
    expect(accepted).toBe(true)
    expect(onApplyMove).toHaveBeenCalledWith(note, {
      writes: [{ key: 'Stage', value: 'done' }, { key: 'completed', value: todayIso() }],
      removals: [],
    })
    expect(hook.result.current.pending.get(note.path)).toMatchObject({ from: 'todo.yml', to: 'done.yml' })
  })

  it('refuses drops on its own column, on Other and on columns it cannot satisfy', () => {
    const { hook, onApplyMove } = setup()
    expect(hook.result.current.canDrop(note, 'done.yml')).toBe(true)
    expect(hook.result.current.canDrop(note, 'missing.yml')).toBe(false)
    let accepted = true
    act(() => { accepted = hook.result.current.onCardDrop(note, 'todo.yml', 'todo.yml') })
    expect(accepted).toBe(false)
    act(() => { accepted = hook.result.current.onCardDrop(note, 'todo.yml', 'missing.yml') })
    expect(accepted).toBe(false)
    expect(onApplyMove).not.toHaveBeenCalled()
  })

  it('snaps the card back when the write fails', async () => {
    const { hook } = setup(vi.fn().mockRejectedValue(new Error('write failed')))
    await act(async () => { hook.result.current.onCardDrop(note, 'todo.yml', 'done.yml') })
    expect(hook.result.current.pending.size).toBe(0)
  })
})

describe('todayIso', () => {
  it('formats the local calendar date', () => {
    expect(todayIso(new Date(2026, 10, 16, 23, 59))).toBe('2026-11-16')
  })
})
