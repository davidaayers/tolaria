import type { FilterNode, VaultEntry, ViewFile } from '../types'
import { evaluateView } from '../utils/viewFilters'
import type { BoardColumn } from './boardColumns'
import { applyWrites, writesFor, type BoardMovePlan, type Scalar } from './boardMove'

export interface BoardCreatePlan {
  /** The note type to create. */
  type: string
  /** Frontmatter to write into the new note, besides its type. */
  properties: Record<string, Scalar>
}

interface BoardCreateRequest {
  target: BoardColumn
  /** The board's own View: a new card must match it too, or it would vanish from the board. */
  boardView?: ViewFile | null
  /** ISO date (YYYY-MM-DD) written to the column's `stamp` property. */
  today: string
}

const DEFAULT_TYPE = 'Note'

function blankEntry(): VaultEntry {
  return {
    path: '', filename: '', title: '', isA: null, aliases: [], belongsTo: [], relatedTo: [], status: null,
    archived: false, modifiedAt: null, createdAt: null, fileSize: 0, snippet: '', wordCount: 0, relationships: {},
    icon: null, color: null, order: null, outgoingLinks: [], template: null, sort: null, sidebarLabel: null,
    view: null, visible: null, properties: {}, organized: false, favorite: false, favoriteIndex: null,
    listPropertiesDisplay: [], hasH1: false,
  }
}

function conditionsOf(view: ViewFile | null | undefined): FilterNode[] {
  return view && 'all' in view.definition.filters ? view.definition.filters.all : []
}

function matches(view: ViewFile, entry: VaultEntry): boolean {
  return evaluateView(view.definition, [entry]).length === 1
}

function toPlan(writes: BoardMovePlan['writes']): BoardCreatePlan {
  const properties: Record<string, Scalar> = {}
  let type = DEFAULT_TYPE
  for (const { key, value } of writes) {
    if (key.toLowerCase() === 'type') type = String(value)
    else Reflect.set(properties, key, value)
  }
  return { type, properties }
}

/**
 * Work out what a new card created in a column must contain (ADR-0301): every plain `equals` condition
 * of the board View and of the column's View, plus the column's `stamp`. Null when the column cannot be
 * written into, or the result would not appear on the board in that column.
 */
export function planBoardCreate({ target, boardView, today }: BoardCreateRequest): BoardCreatePlan | null {
  const view = target.view
  if (!view || !('all' in view.definition.filters)) return null
  const stamp = target.config?.stamp

  let entry = blankEntry()
  const writes: BoardMovePlan['writes'] = []
  for (const node of [...conditionsOf(boardView), ...view.definition.filters.all]) {
    const next = writesFor(entry, [node], stamp)
    if (!next) return null
    entry = applyWrites(entry, next)
    writes.push(...next)
  }
  if (stamp) {
    const stamped = { key: stamp, value: today }
    entry = applyWrites(entry, [stamped])
    writes.push(stamped)
  }
  if (!matches(view, entry) || (boardView && !matches(boardView, entry))) return null
  return toPlan(writes)
}
