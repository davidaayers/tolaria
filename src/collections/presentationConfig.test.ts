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

describe('presentationFromViewDefinition', () => {
  it('falls back to a list built from the view sort and display properties', () => {
    const result = presentationFromViewDefinition(view(undefined, { listPropertiesDisplay: ['status'] }))
    expect(result).toEqual({ type: 'list', sort: 'modified:desc', properties: ['status'] })
  })

  it('parses a full board presentation', () => {
    const filter = { all: [{ field: 'completed', op: 'after', value: 'start of week' }] }
    const result = presentationFromViewDefinition(view({
      type: 'board',
      groupBy: 'status',
      properties: ['area', 'due'],
      staleAfterDays: 180,
      staleFrom: 'added',
      colors: { Team: 'purple', ops: 'green', odd: 'chartreuse', bad: 3 },
      columns: [
        { value: 'backlog', label: 'Backlog', max: 5 },
        { value: 'in-progress', limit: 3, sort: 'property:due:asc' },
        { value: 'done', label: 'Done this week', stamp: 'completed', filter },
      ],
    }))
    expect(result).toEqual({
      type: 'board',
      groupBy: 'status',
      properties: ['area', 'due'],
      staleAfterDays: 180,
      staleFrom: 'added',
      colors: { team: 'purple', ops: 'green' },
      columns: [
        { value: 'backlog', label: 'Backlog', limit: null, max: 5, sort: null, filter: null, stamp: null },
        { value: 'in-progress', label: null, limit: 3, max: null, sort: 'property:due:asc', filter: null, stamp: null },
        { value: 'done', label: 'Done this week', limit: null, max: null, sort: null, filter, stamp: 'completed' },
      ],
    })
  })

  it('derives columns when none are declared', () => {
    const result = presentationFromViewDefinition(view({ type: 'board', groupBy: 'status' }))
    expect(result).toMatchObject({ type: 'board', groupBy: 'status', columns: null, properties: [], staleAfterDays: null, staleFrom: null, colors: {} })
  })

  it.each([
    ['missing groupBy', { type: 'board' }],
    ['blank groupBy', { type: 'board', groupBy: '  ' }],
    ['non-string groupBy', { type: 'board', groupBy: 3 }],
  ])('falls back to the list for a board with %s', (_label, presentation) => {
    expect(presentationFromViewDefinition(view(presentation)).type).toBe('list')
  })

  it('falls back to the list for an unknown presentation type or a non-object block', () => {
    expect(presentationFromViewDefinition(view({ type: 'calendar', groupBy: 'status' })).type).toBe('list')
    expect(presentationFromViewDefinition(view('board')).type).toBe('list')
    expect(presentationFromViewDefinition(view(['board'])).type).toBe('list')
  })

  it('drops malformed columns and keeps the valid ones', () => {
    const result = presentationFromViewDefinition(view({
      type: 'board',
      groupBy: 'status',
      columns: [{ value: 'todo' }, { label: 'No value' }, 'done', { value: '' }, null, { value: 'doing', limit: 0, max: -2 }],
    }))
    expect(result).toMatchObject({
      columns: [
        { value: 'todo', limit: null, max: null },
        { value: 'doing', limit: null, max: null },
      ],
    })
  })

  it('drops duplicate column values, comparing case-insensitively after trimming', () => {
    const result = presentationFromViewDefinition(view({
      type: 'board',
      groupBy: 'status',
      columns: [{ value: 'Todo' }, { value: ' todo ' }, { value: 'done' }],
    }))
    expect(result).toMatchObject({ columns: [{ value: 'Todo' }, { value: 'done' }] })
  })

  it('treats a non-array columns value as derived columns', () => {
    const result = presentationFromViewDefinition(view({ type: 'board', groupBy: 'status', columns: 'todo' }))
    expect(result).toMatchObject({ columns: null })
  })

  it('ignores invalid column filters and non-positive or non-integer numbers', () => {
    const result = presentationFromViewDefinition(view({
      type: 'board',
      groupBy: 'status',
      staleAfterDays: 0,
      columns: [{ value: 'todo', filter: { nope: [] }, max: 2.5, limit: '3' }],
    }))
    expect(result).toMatchObject({
      staleAfterDays: null,
      columns: [{ value: 'todo', filter: null, max: null, limit: null }],
    })
  })

  it('keeps only known accent names in colors, lowercasing the keys, and ignores a non-object value', () => {
    const result = presentationFromViewDefinition(view({ type: 'board', groupBy: 'status', colors: { ' Team ': 'Blue', x: 'nope', y: ['red'] } }))
    expect(result).toMatchObject({ colors: { team: 'blue' } })
    expect(presentationFromViewDefinition(view({ type: 'board', groupBy: 'status', colors: 'blue' }))).toMatchObject({ colors: {} })
  })
})
