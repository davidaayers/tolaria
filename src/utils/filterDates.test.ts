import { afterEach, describe, expect, it, vi } from 'vitest'
import { format } from 'date-fns'
import { parseDateFilterInput, toDateFilterTimestamp } from './filterDates'

describe('filterDates', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('parses absolute ISO dates', () => {
    const parsed = parseDateFilterInput('2026-04-01')
    expect(parsed && format(parsed, 'yyyy-MM-dd')).toBe('2026-04-01')
  })

  it('parses numeric relative day phrases', () => {
    const reference = new Date('2026-04-07T12:00:00Z')
    const parsed = parseDateFilterInput('10 days ago', reference)
    expect(parsed && format(parsed, 'yyyy-MM-dd')).toBe('2026-03-28')
  })

  it('parses numeric relative year phrases', () => {
    const reference = new Date('2026-04-08T12:00:00Z')
    const parsed = parseDateFilterInput('10 years ago', reference)
    expect(parsed && format(parsed, 'yyyy-MM-dd')).toBe('2016-04-08')
  })

  it('parses word-based relative week phrases', () => {
    const reference = new Date('2026-04-07T12:00:00Z')
    const parsed = parseDateFilterInput('one week ago', reference)
    expect(parsed && format(parsed, 'yyyy-MM-dd')).toBe('2026-03-31')
  })

  it('parses start of week as the Monday of the reference week', () => {
    const day = (value: string) => {
      const parsed = parseDateFilterInput('start of week', new Date(value))
      return parsed && format(parsed, 'yyyy-MM-dd')
    }
    expect(day('2026-04-08T12:00:00')).toBe('2026-04-06')
    expect(day('2026-04-06T09:00:00')).toBe('2026-04-06')
    expect(day('2026-04-12T23:00:00')).toBe('2026-04-06')
  })

  it('parses start of month', () => {
    const parsed = parseDateFilterInput('Start of Month', new Date('2026-04-08T12:00:00'))
    expect(parsed && format(parsed, 'yyyy-MM-dd')).toBe('2026-04-01')
  })

  it('returns null for unsupported date phrases', () => {
    expect(parseDateFilterInput('eventually')).toBeNull()
  })

  it('converts parsed filter values into timestamps', () => {
    const reference = new Date('2026-04-07T12:00:00Z')
    const timestamp = toDateFilterTimestamp('yesterday', reference)
    expect(timestamp).not.toBeNull()
    expect(format(new Date(timestamp!), 'yyyy-MM-dd')).toBe('2026-04-06')
  })
})
