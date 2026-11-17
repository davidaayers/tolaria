import { describe, expect, it } from 'vitest'
import type { KanbanColumnConfig } from '../../collections/collectionTypes'
import type { ViewDefinition, ViewFile } from '../../types'
import {
  effectiveLayout,
  type LayoutPersistenceTarget,
  type LayoutSettings,
  persistedViewLayout,
  persistLayoutSettings,
  readStoredLayout,
  isWritableGroupKey,
} from './collectionLayoutConfig'

describe('collectionLayoutConfig', () => {
  it('only writes Kanban drops to single-line keys the board notes already carry', () => {
    expect(isWritableGroupKey('status', ['status', 'owner'])).toBe(true)
    expect(isWritableGroupKey('priority', ['status'])).toBe(false)
    expect(isWritableGroupKey('', [''])).toBe(false)
    expect(isWritableGroupKey(' status', [' status'])).toBe(false)
    expect(isWritableGroupKey('status\nowner: x', ['status\nowner: x'])).toBe(false)
    expect(isWritableGroupKey('Due date', ['Due date'])).toBe(true)
    expect(isWritableGroupKey('belongs_to', ['belongs_to'])).toBe(true)
    for (const yamlSyntax of ['owner: x', '[status]', '{status}', '#status', 'status # note', '&anchor', '*alias', "'status'", '"status"', 'a|b', 'a>b', '-status']) {
      expect(isWritableGroupKey(yamlSyntax, [yamlSyntax])).toBe(false)
    }
    for (const lineBreak of ['\u0085', '\u2028', '\u2029']) {
      const key = `status${lineBreak}owner: x`
      expect(isWritableGroupKey(key, [key])).toBe(false)
    }
  })

  it('reads stored layout files defensively', () => {
    expect(readStoredLayout({ type: 'kanban', groupBy: 7, properties: ['owner', 3], columnOrder: 'Done' })).toEqual({
      layout: 'kanban', groupBy: 'status', properties: ['owner'], columnOrder: [], columns: [],
    })
    expect(readStoredLayout({ type: 'calendar' })).toBeUndefined()
    expect(readStoredLayout(['kanban'])).toBeUndefined()
  })

})

const column = (view: string, extra: Partial<KanbanColumnConfig> = {}): KanbanColumnConfig => ({ view, wipLimit: null, show: null, stamp: null, ...extra })

function viewFile(presentation: Record<string, unknown> | undefined): ViewFile {
  const definition: ViewDefinition = { name: 'Tasks', icon: null, color: null, sort: null, filters: { all: [] } }
  return { filename: 'tasks.yml', definition: { ...definition, presentation } as ViewDefinition }
}

function targetFor(view: ViewFile, onUpdateViewDefinition: LayoutPersistenceTarget['onUpdateViewDefinition']): LayoutPersistenceTarget {
  return {
    selection: { kind: 'view', filename: 'tasks.yml' },
    views: [view],
    presentation: { type: 'kanban', groupBy: null, properties: [], columnOrder: [], columns: [] },
    onUpdateViewDefinition,
  }
}

const settings = (extra: Partial<LayoutSettings> = {}): LayoutSettings => ({
  layout: 'kanban', groupBy: 'status', properties: [], columnOrder: [], columns: [], ...extra,
})

describe('View-driven Kanban columns', () => {
  it('writes columns compactly, leaving out unset limits', () => {
    const saved: Array<Partial<ViewDefinition>> = []
    const columns = [column('todo.yml'), column('done.yml', { show: 5, wipLimit: 3, stamp: 'completed' })]
    persistLayoutSettings(targetFor(viewFile(undefined), (_file, patch) => saved.push(patch)), settings({ columns }))
    expect(saved[0].presentation).toMatchObject({
      type: 'kanban',
      columns: [{ view: 'todo.yml' }, { view: 'done.yml', show: 5, wipLimit: 3, stamp: 'completed' }],
    })
    const written = (saved[0].presentation as { columns: Array<Record<string, unknown>> }).columns
    expect(Object.keys(written[0])).toEqual(['view'])
  })

  it('keeps unknown keys of the View presentation block when layout settings change', () => {
    const saved: Array<Partial<ViewDefinition>> = []
    const view = viewFile({ type: 'kanban', colors: { team: 'purple' }, columns: ['todo.yml'] })
    persistLayoutSettings(targetFor(view, (_file, patch) => saved.push(patch)), settings({ columnOrder: ['x'], columns: [column('todo.yml')] }))
    expect(saved[0].presentation).toMatchObject({ colors: { team: 'purple' }, columnOrder: ['x'] })
  })

  it('stashes columns when switching to List and restores them on the way back', () => {
    const saved: Array<Partial<ViewDefinition>> = []
    const view = viewFile({ type: 'kanban', groupBy: 'status', columns: [{ view: 'todo.yml', show: 4 }] })
    persistLayoutSettings(targetFor(view, (_file, patch) => saved.push(patch)), settings({ layout: 'list', columns: [column('todo.yml', { show: 4 })] }))
    const stashed = viewFile(saved[0].presentation as Record<string, unknown>)
    expect(persistedViewLayout({ ...targetFor(stashed, undefined), presentation: { type: 'list', sort: null, properties: [] } })?.columns)
      .toEqual([column('todo.yml', { show: 4 })])
  })

  it('reads columns from a stored layout and from the presentation', () => {
    expect(readStoredLayout({ type: 'kanban', columns: [{ view: 'a.yml', show: 2 }, 3] })?.columns).toEqual([column('a.yml', { show: 2 })])
    const fromPresentation = effectiveLayout({ type: 'kanban', groupBy: null, properties: [], columnOrder: [], columns: [column('a.yml')] }, undefined)
    expect(fromPresentation.columns).toEqual([column('a.yml')])
  })
})
