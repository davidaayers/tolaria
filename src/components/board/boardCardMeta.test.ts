import { describe, expect, it } from 'vitest'
import { accentForValue, dueUrgency, isDueProperty } from './boardCardMeta'

const NOW = new Date(2026, 10, 10, 15, 30)

describe('dueUrgency', () => {
  it.each([
    ['2026-11-07', { tone: 'overdue', key: 'board.due.overdue', count: 3 }],
    ['2026-11-09', { tone: 'overdue', key: 'board.due.overdue', count: 1 }],
    ['2026-11-10', { tone: 'soon', key: 'board.due.today', count: 0 }],
    ['2026-11-11', { tone: 'soon', key: 'board.due.tomorrow', count: 1 }],
    ['2026-11-13', { tone: 'soon', key: 'board.due.inDays', count: 3 }],
    ['2026-11-14', { tone: 'later', key: null, count: 4 }],
    ['2026-11-10T23:00:00Z', { tone: 'soon', key: 'board.due.today', count: 0 }],
  ])('classifies %s', (value, expected) => {
    expect(dueUrgency(value, NOW)).toEqual(expected)
  })

  it('ignores values that are not ISO dates', () => {
    expect(dueUrgency('next week', NOW)).toBeNull()
    expect(dueUrgency('', NOW)).toBeNull()
    expect(dueUrgency('2026-13-45', NOW)).toBeNull()
  })
})

describe('isDueProperty', () => {
  it('matches due-style property names case-insensitively', () => {
    expect(['due', 'Due Date', 'deadline', 'Deadline'].every(isDueProperty)).toBe(true)
    expect(['added', 'area', 'overdue-reason'].some(isDueProperty)).toBe(false)
  })
})

describe('accentForValue', () => {
  it('is stable for a value and ignores case and surrounding space', () => {
    expect(accentForValue('Team')).toBe(accentForValue(' team '))
  })

  it('spreads different values over more than one accent', () => {
    const accents = new Set(['team', 'ops', 'strategy', 'governance', 'jc'].map(accentForValue))
    expect(accents.size).toBeGreaterThan(2)
  })
})
