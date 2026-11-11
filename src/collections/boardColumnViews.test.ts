import { describe, expect, it } from 'vitest'
import type { FilterNode, ViewFile } from '../types'
import { columnColorsFromViews } from './boardColumnViews'

function view(filename: string, color: string | null, nodes: FilterNode[], group: 'all' | 'any' = 'all', rootPath?: string): ViewFile {
  const filters = group === 'all' ? { all: nodes } : { any: nodes }
  return { filename, rootPath, definition: { name: filename, icon: null, color, sort: null, filters } }
}

const status = (value: string): FilterNode => ({ field: 'status', op: 'equals', value })
const type = (value: string): FilterNode => ({ field: 'type', op: 'equals', value })
const columns = [{ key: 'in-progress', value: 'In-Progress' }, { key: 'done', value: 'done' }, { key: '__other__', value: null }]

describe('columnColorsFromViews', () => {
  it('uses the colour of the View that filters on the column value, ignoring case and extra conditions', () => {
    const views = [view('ip.yml', 'orange', [type('Task'), status('in-progress')]), view('done.yml', 'Green', [status('DONE')])]
    expect(columnColorsFromViews({ views, groupBy: 'Status', columns })).toEqual({ 'in-progress': 'orange', done: 'green' })
  })

  it('skips the board View itself, Views without a valid colour, and filters that are not a plain equals', () => {
    const views = [
      view('board.yml', 'red', [status('done')]),
      view('nocolor.yml', null, [status('in-progress')]),
      view('badcolor.yml', 'chartreuse', [status('in-progress')]),
      view('not.yml', 'blue', [{ field: 'status', op: 'not_equals', value: 'done' }]),
      view('other-field.yml', 'blue', [{ field: 'area', op: 'equals', value: 'done' }]),
    ]
    const result = columnColorsFromViews({ views, groupBy: 'status', columns, exclude: views[0] })
    expect(result).toEqual({})
  })

  it('only looks at top-level all conditions, not any-groups or nested groups', () => {
    const views = [
      view('any.yml', 'blue', [status('done')], 'any'),
      view('nested.yml', 'pink', [{ any: [status('in-progress')] }]),
    ]
    expect(columnColorsFromViews({ views, groupBy: 'status', columns })).toEqual({})
  })

  it('prefers the first matching View and never colours Other', () => {
    const views = [view('a.yml', 'teal', [status('done')]), view('b.yml', 'pink', [status('done')])]
    const result = columnColorsFromViews({ views, groupBy: 'status', columns })
    expect(result).toEqual({ done: 'teal' })
    expect(result).not.toHaveProperty('__other__')
  })
})
