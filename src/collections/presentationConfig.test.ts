import { describe, expect, it } from 'vitest'
import type { ViewDefinition } from '../types'
import { presentationFromViewDefinition } from './presentationConfig'

function view(presentation: unknown, extra: Partial<ViewDefinition> = {}): ViewDefinition {
  return {
    name: 'Tasks Board',
    icon: null,
    color: null,
    sort: 'modified:desc',
    filters: { all: [] },
    presentation,
    ...extra,
  }
}

const board = (extra: Record<string, unknown> = {}) => ({
  type: 'board',
  columns: [{ view: 'backlog.yml' }],
  ...extra,
})

describe('presentationFromViewDefinition', () => {
  it('falls back to a list built from the view sort and display properties', () => {
    const result = presentationFromViewDefinition(view(undefined, { listPropertiesDisplay: ['status'] }))
    expect(result).toEqual({ type: 'list', sort: 'modified:desc', properties: ['status'] })
  })

  it('parses a full board presentation with columns that reference saved views', () => {
    const result = presentationFromViewDefinition(view(board({
      properties: ['area', 'due'],
      staleAfterDays: 180,
      staleFrom: 'added',
      colors: { Team: 'purple', ops: 'green', odd: 'chartreuse', bad: 3 },
      columns: [
        { view: 'backlog.yml', show: 5 },
        { view: 'this-week.yml', wipLimit: 3 },
        { view: 'done-this-week.yml', stamp: 'completed' },
      ],
    })))
    expect(result).toEqual({
      type: 'board',
      properties: ['area', 'due'],
      staleAfterDays: 180,
      staleFrom: 'added',
      colors: { team: 'purple', ops: 'green' },
      columns: [
        { view: 'backlog.yml', wipLimit: null, show: 5, stamp: null },
        { view: 'this-week.yml', wipLimit: 3, show: null, stamp: null },
        { view: 'done-this-week.yml', wipLimit: null, show: null, stamp: 'completed' },
      ],
    })
  })

  it('accepts a bare filename as shorthand for a column', () => {
    const result = presentationFromViewDefinition(view(board({ columns: ['backlog.yml', { view: 'done.yml' }] })))
    expect(result).toMatchObject({ columns: [{ view: 'backlog.yml' }, { view: 'done.yml' }] })
  })

  it.each([
    ['no columns', { type: 'board' }],
    ['non-array columns', { type: 'board', columns: 'backlog.yml' }],
    ['only malformed columns', { type: 'board', columns: [{}, { view: '' }, { view: 3 }, null, 7] }],
  ])('falls back to the list for a board with %s', (_label, presentation) => {
    expect(presentationFromViewDefinition(view(presentation)).type).toBe('list')
  })

  it('falls back to the list for an unknown presentation type or a non-object block', () => {
    expect(presentationFromViewDefinition(view({ type: 'calendar', columns: [{ view: 'a.yml' }] })).type).toBe('list')
    expect(presentationFromViewDefinition(view('board')).type).toBe('list')
    expect(presentationFromViewDefinition(view(['board'])).type).toBe('list')
  })

  it('drops malformed and duplicate columns, keeping the first of each view', () => {
    const result = presentationFromViewDefinition(view(board({
      columns: [{ view: 'a.yml' }, { label: 'no view' }, 'A.yml', { view: ' b.yml ', wipLimit: 0, show: -2, stamp: ' ' }, null],
    })))
    expect(result).toMatchObject({
      columns: [
        { view: 'a.yml', wipLimit: null, show: null, stamp: null },
        { view: 'b.yml', wipLimit: null, show: null, stamp: null },
      ],
    })
  })

  it('ignores non-positive or non-integer numbers', () => {
    const result = presentationFromViewDefinition(view(board({
      staleAfterDays: 0,
      columns: [{ view: 'a.yml', show: 2.5, wipLimit: '3' }],
    })))
    expect(result).toMatchObject({ staleAfterDays: null, columns: [{ view: 'a.yml', show: null, wipLimit: null }] })
  })

  it('keeps only known accent names in colors, lowercasing the keys, and ignores a non-object value', () => {
    expect(presentationFromViewDefinition(view(board({ colors: { ' Team ': 'Blue', x: 'nope', y: ['red'] } }))))
      .toMatchObject({ colors: { team: 'blue' } })
    expect(presentationFromViewDefinition(view(board({ colors: 'blue' })))).toMatchObject({ colors: {} })
  })
})
