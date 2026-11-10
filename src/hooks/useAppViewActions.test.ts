import { describe, expect, it } from 'vitest'
import type { ViewDefinition } from '../types'
import { buildViewOrderUpdates } from '../utils/viewOrdering'
import { availableViewFields, savedViewDefinition } from './useAppViewActions'

const boardPresentation = { type: 'board', groupBy: 'status', columns: [{ value: 'done', stamp: 'completed' }] }

function boardView(): ViewDefinition {
  return {
    name: 'Tasks Board',
    icon: null,
    color: null,
    sort: null,
    filters: { all: [{ field: 'type', op: 'equals', value: 'Task' }] },
    presentation: boardPresentation,
  }
}

describe('availableViewFields', () => {
  it('offers archived as a built-in saved-view field', () => {
    expect(availableViewFields([])).toContain('archived')
  })
})

describe('saved view presentation preservation', () => {
  it('keeps the presentation block when the edit dialog saves a view', () => {
    const dialogDefinition: ViewDefinition = { ...boardView(), name: 'Renamed', presentation: undefined }
    delete dialogDefinition.presentation

    const saved = savedViewDefinition(dialogDefinition, { definition: boardView() }, [])

    expect(saved.name).toBe('Renamed')
    expect(saved.presentation).toEqual(boardPresentation)
  })

  it('keeps the presentation block when sidebar reordering saves views', () => {
    const [update] = buildViewOrderUpdates([{ filename: 'board.yml', definition: boardView() }])

    expect(update.definition.presentation).toEqual(boardPresentation)
  })
})
