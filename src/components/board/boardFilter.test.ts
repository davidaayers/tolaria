import { describe, expect, it } from 'vitest'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import type { VaultEntry } from '../../types'
import {
  boardFilterOptions,
  EMPTY_BOARD_FILTER,
  entryMatchesBoardFilter,
  isBoardFilterActive,
  toggleBoardFilterValue,
  type BoardFilter,
} from './boardFilter'

const NOW = new Date(2026, 10, 10, 12, 0, 0) // 10 Nov 2026
const PROPS = ['area', 'due']

const task = (title: string, properties: VaultEntry['properties'] = {}) =>
  makeEntry({ path: `/v/${title}.md`, title, properties })

const filter = (overrides: Partial<BoardFilter> = {}): BoardFilter => ({ ...EMPTY_BOARD_FILTER, ...overrides })
const matches = (entry: VaultEntry, f: BoardFilter) => entryMatchesBoardFilter(entry, f, PROPS, NOW)

describe('isBoardFilterActive', () => {
  it('is off for the empty filter and for whitespace only', () => {
    expect(isBoardFilterActive(EMPTY_BOARD_FILTER)).toBe(false)
    expect(isBoardFilterActive(filter({ text: '   ' }))).toBe(false)
  })

  it('is on for text, a chosen value or a due shortcut', () => {
    expect(isBoardFilterActive(filter({ text: 'x' }))).toBe(true)
    expect(isBoardFilterActive(filter({ values: { area: ['ops'] } }))).toBe(true)
    expect(isBoardFilterActive(filter({ due: 'overdue' }))).toBe(true)
  })
})

describe('entryMatchesBoardFilter', () => {
  it('matches everything when the filter is empty', () => {
    expect(matches(task('a'), EMPTY_BOARD_FILTER)).toBe(true)
  })

  it('matches text against the title and the shown property values, ignoring case', () => {
    const entry = task('Fix Login Bug', { area: 'Platform', secret: 'hidden' })
    expect(matches(entry, filter({ text: 'login' }))).toBe(true)
    expect(matches(entry, filter({ text: ' PLATFORM ' }))).toBe(true)
    expect(matches(entry, filter({ text: 'hidden' }))).toBe(false)
    expect(matches(entry, filter({ text: 'nope' }))).toBe(false)
  })

  it('requires every word of the text to match somewhere', () => {
    const entry = task('Fix Login Bug', { area: 'Platform' })
    expect(matches(entry, filter({ text: 'login platform' }))).toBe(true)
    expect(matches(entry, filter({ text: 'login ops' }))).toBe(false)
  })

  it('matches any chosen value of a property, and all properties together', () => {
    const entry = task('a', { area: 'Ops', team: 'x' })
    expect(matches(entry, filter({ values: { area: ['ops', 'strategy'] } }))).toBe(true)
    expect(matches(entry, filter({ values: { area: ['strategy'] } }))).toBe(false)
    expect(matches(entry, filter({ values: { area: ['ops'], team: ['y'] } }))).toBe(false)
    expect(matches(task('b'), filter({ values: { area: ['ops'] } }))).toBe(false)
  })

  it('filters by due date: overdue, or due within the coming week', () => {
    const overdue = task('late', { due: '2026-11-08' })
    const today = task('today', { due: '2026-11-10' })
    const inFive = task('soon', { due: '2026-11-15' })
    const later = task('far', { due: '2026-12-25' })
    const none = task('none')

    const lateOnly = filter({ due: 'overdue' })
    expect([overdue, today, inFive, later, none].map((e) => matches(e, lateOnly))).toEqual([true, false, false, false, false])

    const week = filter({ due: 'week' })
    expect([overdue, today, inFive, later, none].map((e) => matches(e, week))).toEqual([false, true, true, false, false])
  })

  it('never matches a due shortcut when the board shows no due property', () => {
    expect(entryMatchesBoardFilter(task('x', { due: '2026-11-01' }), filter({ due: 'overdue' }), ['area'], NOW)).toBe(false)
  })
})

describe('toggleBoardFilterValue', () => {
  it('adds a value, keeps others, and removes it again', () => {
    const one = toggleBoardFilterValue(EMPTY_BOARD_FILTER, 'Area', 'Ops')
    expect(one.values).toEqual({ area: ['ops'] })
    const two = toggleBoardFilterValue(one, 'area', 'team')
    expect(two.values).toEqual({ area: ['ops', 'team'] })
    expect(toggleBoardFilterValue(two, 'area', 'OPS').values).toEqual({ area: ['team'] })
    expect(toggleBoardFilterValue(toggleBoardFilterValue(one, 'area', 'ops'), 'area', 'ops').values).toEqual({ area: ['ops'] })
  })

  it('drops a property with no chosen values left', () => {
    const one = toggleBoardFilterValue(EMPTY_BOARD_FILTER, 'area', 'ops')
    expect(toggleBoardFilterValue(one, 'area', 'ops').values).toEqual({})
  })
})

describe('boardFilterOptions', () => {
  it('lists each shown property’s values by frequency with their original spelling', () => {
    const entries = [task('a', { area: 'Ops' }), task('b', { area: 'ops' }), task('c', { area: 'Team' }), task('d', { area: 'Team' }), task('e', { area: 'Team' }), task('f', { area: 'jc' })]
    expect(boardFilterOptions(entries, ['area'])).toEqual([
      { property: 'area', values: [{ value: 'team', label: 'Team', count: 3 }, { value: 'ops', label: 'Ops', count: 2 }, { value: 'jc', label: 'jc', count: 1 }] },
    ])
  })

  it('skips due-like properties, properties with fewer than two distinct values, and non-scalar values', () => {
    const entries = [task('a', { area: 'ops', kind: 'x', due: '2026-11-01', tags: ['a', 'b'] }), task('b', { area: 'team', kind: 'x', due: '2026-11-02', tags: ['c'] })]
    expect(boardFilterOptions(entries, ['area', 'kind', 'due', 'tags']).map((group) => group.property)).toEqual(['area'])
  })

  it('caps the values per property at the most frequent ones', () => {
    const entries = Array.from({ length: 12 }, (_, index) => task(`n${index}`, { area: `v${index}` }))
    expect(boardFilterOptions(entries, ['area'])[0].values).toHaveLength(8)
  })
})
