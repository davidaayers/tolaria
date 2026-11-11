import { describe, expect, it } from 'vitest'
import { workspaceScenarioForId } from '../fixtures/workspaceFixtures'
import { parseMobileSavedViewFile, serializeMobileSavedViewDefinition } from './mobileSavedViews'
import { applyMobileWorkspaceEditWithWrites } from './mobileWorkspaceEditing'
import type { MobileWorkspaceSnapshot } from './mobileWorkspaceModel'

const boardPresentation = {
  type: 'board',
  groupBy: 'status',
  columns: [
    { value: 'in-progress', label: 'In Progress', limit: 5 },
    { value: 'done', label: 'Done this week', stamp: 'completed' },
  ],
}

const boardViewYaml = `name: Tasks Board
filters:
  all:
    - field: type
      op: equals
      value: Task
presentation:
  type: board
  groupBy: status
  columns:
    - value: in-progress
      label: In Progress
      limit: 5
    - value: done
      label: Done this week
      stamp: completed
`

function parseView(content: string) {
  return parseMobileSavedViewFile({ content, relativePath: 'views/tasks-board.yml' }, 0)
}

function snapshotWithBoardPresentation(): MobileWorkspaceSnapshot {
  const snapshot = workspaceScenarioForId('default')
  return {
    ...snapshot,
    views: (snapshot.views ?? []).map((view) => (
      view.id === 'view-active-procedures'
        ? { ...view, definition: { ...view.definition, presentation: boardPresentation } }
        : view
    )),
  }
}

describe('saved view presentation on mobile', () => {
  it('reads the presentation block from saved-view YAML', () => {
    expect(parseView(boardViewYaml)?.definition.presentation).toEqual(boardPresentation)
  })

  it('writes the presentation block back so a save does not erase it', () => {
    const parsed = parseView(boardViewYaml)
    if (!parsed) throw new Error('the board view did not parse')
    const reparsed = parseView(serializeMobileSavedViewDefinition(parsed.definition))

    expect(reparsed?.definition.presentation).toEqual(boardPresentation)
  })

  it('writes no presentation block for views without one', () => {
    const content = serializeMobileSavedViewDefinition({
      filters: { all: [] }, icon: null, color: null, name: 'Plain', sort: null,
    })

    expect(content).not.toContain('presentation')
  })

  it('keeps the presentation block when the view editor saves a definition without it', () => {
    const result = applyMobileWorkspaceEditWithWrites(snapshotWithBoardPresentation(), {
      definition: {
        color: 'purple',
        filters: { all: [{ field: 'type', op: 'equals', value: 'Procedure' }] },
        icon: 'folder',
        name: 'Active Workflows',
        sort: null,
      },
      type: 'updateView',
      viewId: 'view-active-procedures',
    })

    const write = result.writes.find((candidate) => candidate.kind === 'saveView')
    const updated = result.snapshot.views?.find((view) => view.id === 'view-active-procedures')
    expect(write?.content).toContain('presentation:')
    expect(updated?.definition.presentation).toEqual(boardPresentation)
  })
})
