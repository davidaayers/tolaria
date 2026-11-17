import { describe, expect, it } from 'vitest'
import type { ViewDefinition } from '../types'
import { presentationFromViewDefinition } from './presentationConfig'

function view(presentation: unknown, extra: Partial<ViewDefinition> = {}): ViewDefinition {
  return { name: 'Tasks Board', icon: null, color: null, sort: 'modified:desc', filters: { all: [] }, presentation, ...extra }
}

const kanban = (extra: Record<string, unknown> = {}) => ({ type: 'kanban', ...extra })

describe('presentationFromViewDefinition', () => {
  it('falls back to a list built from the view sort and display properties', () => {
    const result = presentationFromViewDefinition(view(undefined, { listPropertiesDisplay: ['status'] }))
    expect(result).toEqual({ type: 'list', sort: 'modified:desc', properties: ['status'] })
  })

  it('keeps a group-by Kanban with no columns', () => {
    expect(presentationFromViewDefinition(view(kanban({ groupBy: 'status', columnOrder: ['done'] })))).toEqual({
      type: 'kanban', groupBy: 'status', properties: [], columnOrder: ['done'], columns: [],
    })
  })

  it('parses columns that reference saved views', () => {
    const result = presentationFromViewDefinition(view(kanban({
      columns: [
        { view: 'backlog.yml', show: 5 },
        { view: 'this-week.yml', wipLimit: 3 },
        { view: 'done-this-week.yml', stamp: 'completed' },
      ],
    })))
    expect(result).toMatchObject({
      type: 'kanban',
      columns: [
        { view: 'backlog.yml', wipLimit: null, show: 5, stamp: null },
        { view: 'this-week.yml', wipLimit: 3, show: null, stamp: null },
        { view: 'done-this-week.yml', wipLimit: null, show: null, stamp: 'completed' },
      ],
    })
  })

  it('accepts a bare filename as shorthand for a column', () => {
    const result = presentationFromViewDefinition(view(kanban({ columns: ['backlog.yml', { view: 'done.yml' }] })))
    expect(result).toMatchObject({ columns: [{ view: 'backlog.yml' }, { view: 'done.yml' }] })
  })

  it.each([
    ['absent columns', {}],
    ['non-array columns', { columns: 'backlog.yml' }],
    ['only malformed columns', { columns: [{}, { view: '' }, { view: 3 }, null, 7] }],
  ])('has no columns for %s', (_label, extra) => {
    expect(presentationFromViewDefinition(view(kanban(extra)))).toMatchObject({ type: 'kanban', columns: [] })
  })

  it('drops malformed and duplicate columns, keeping the first of each view', () => {
    const result = presentationFromViewDefinition(view(kanban({
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
    const result = presentationFromViewDefinition(view(kanban({ columns: [{ view: 'a.yml', show: 2.5, wipLimit: '3' }] })))
    expect(result).toMatchObject({ columns: [{ view: 'a.yml', show: null, wipLimit: null }] })
  })
})
