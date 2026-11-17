import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VaultEntry, ViewDefinition } from '../types'
import { evaluateView } from './viewFilters'

const BASE_ENTRY: VaultEntry = {
  path: '/vault/test.md',
  filename: 'test.md',
  title: 'Test',
  isA: null,
  aliases: [],
  belongsTo: [],
  relatedTo: [],
  status: null,
  archived: false,
  modifiedAt: 1,
  createdAt: 1,
  fileSize: 100,
  snippet: '',
  wordCount: 0,
  relationships: {},
  icon: null,
  color: null,
  order: null,
  sidebarLabel: null,
  template: null,
  sort: null,
  view: null,
  visible: null,
  favorite: false,
  favoriteIndex: null,
  outgoingLinks: [],
  properties: {},
  listPropertiesDisplay: [],
}

function makeEntry(title: string, date: string): VaultEntry {
  return {
    ...BASE_ENTRY,
    path: `/vault/${title.toLowerCase()}.md`,
    filename: `${title.toLowerCase()}.md`,
    title,
    properties: { date },
  }
}

function dateEqualsView(value: string): ViewDefinition {
  return {
    name: 'Relative date',
    icon: null,
    color: null,
    sort: null,
    filters: { all: [{ field: 'date', op: 'equals', value }] },
  }
}

describe('relative date view filters', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('matches today against date frontmatter at query time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T12:00:00Z'))

    const result = evaluateView(dateEqualsView('today'), [
      makeEntry('Yesterday', '2026-04-06'),
      makeEntry('Today', '2026-04-07'),
      makeEntry('Tomorrow', '2026-04-08'),
    ])

    expect(result.map((entry) => entry.title)).toEqual(['Today'])
  })

  it('matches future relative expressions against date frontmatter', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T12:00:00Z'))

    const result = evaluateView(dateEqualsView('in 1 week'), [
      makeEntry('Today', '2026-04-07'),
      makeEntry('Next Week', '2026-04-14'),
      makeEntry('Later', '2026-04-15'),
    ])

    expect(result.map((entry) => entry.title)).toEqual(['Next Week'])
  })

  it('keeps unsupported calendar tokens from matching arbitrary dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T12:00:00Z'))

    expect(evaluateView(dateEqualsView('this month'), [
      makeEntry('April Entry', '2026-04-15'),
    ])).toEqual([])
  })

  describe('period starts', () => {
    // 2026-04-08 is a Wednesday, so the week starts Monday 2026-04-06 and the month on 2026-04-01.
    const entries = () => [
      makeEntry('Sunday', '2026-04-05'),
      makeEntry('Monday', '2026-04-06'),
      makeEntry('Wednesday', '2026-04-08'),
    ]
    const dateView = (op: 'after' | 'before', value: string): ViewDefinition => ({
      name: 'Period',
      icon: null,
      color: null,
      sort: null,
      filters: { all: [{ field: 'date', op, value }] },
    })
    const titles = (view: ViewDefinition) => evaluateView(view, entries()).map((entry) => entry.title)

    it('includes a note dated on Monday in "after start of week"', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-08T12:00:00'))

      expect(titles(dateView('after', 'start of week'))).toEqual(['Monday', 'Wednesday'])
    })

    it('keeps Monday out of "before start of week"', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-08T12:00:00'))

      expect(titles(dateView('before', 'start of week'))).toEqual(['Sunday'])
    })

    it('includes the first of the month in "after start of month"', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-08T12:00:00'))

      const result = evaluateView(dateView('after', 'start of month'), [
        makeEntry('March', '2026-03-31'),
        makeEntry('First', '2026-04-01'),
      ])

      expect(result.map((entry) => entry.title)).toEqual(['First'])
    })

    it('keeps "after" strict for other dates', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-08T12:00:00'))

      expect(titles(dateView('after', 'yesterday'))).toEqual(['Wednesday'])
      expect(titles(dateView('after', '2026-04-06'))).toEqual(['Wednesday'])
    })
  })
})
