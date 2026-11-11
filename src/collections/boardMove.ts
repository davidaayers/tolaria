import type { FilterCondition, FilterNode, VaultEntry } from '../types'
import { evaluateView } from '../utils/viewFilters'
import type { BoardColumn } from './boardColumns'

type Scalar = string | number | boolean

export interface BoardMovePlan {
  /** Frontmatter properties to set: the target View's unmet conditions, then the column stamp. */
  writes: Array<{ key: string; value: Scalar }>
  /** Frontmatter properties to delete. */
  removals: string[]
}

interface BoardMoveRequest {
  entry: VaultEntry
  columns: BoardColumn[]
  target: BoardColumn
  /** ISO date (YYYY-MM-DD) written to a column's `stamp` property. */
  today: string
}

/** Fields a filter can read but a card move cannot write. */
const UNWRITABLE_FIELDS = new Set(['title', 'filename', 'body', 'archived', 'favorite'])

function matchesNode(node: FilterNode, entry: VaultEntry): boolean {
  const view = { name: '', icon: null, color: null, sort: null, filters: { all: [node] } }
  return evaluateView(view, [entry]).length === 1
}

function isScalar(value: unknown): value is Scalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isWritableEquals(node: FilterNode): node is FilterCondition & { value: Scalar } {
  return 'field' in node
    && node.op === 'equals'
    && node.regex !== true
    && isScalar(node.value)
    && !UNWRITABLE_FIELDS.has(node.field.toLowerCase())
}

function hasRelationship(entry: VaultEntry, field: string): boolean {
  return Object.keys(entry.relationships).some((key) => key.toLowerCase() === field.toLowerCase())
}

function frontmatterKey(entry: VaultEntry, field: string): string {
  const lower = field.toLowerCase()
  const existing = Object.keys(entry.properties).find((key) => key.toLowerCase() === lower)
  if (existing) return existing
  return lower === 'isa' ? 'type' : field
}

function isStampedBy(node: FilterNode, stamp: string | null | undefined): boolean {
  return !!stamp && 'field' in node && node.field.toLowerCase() === stamp.toLowerCase()
}

function writesFor(entry: VaultEntry, nodes: FilterNode[], stamp: string | null | undefined): BoardMovePlan['writes'] | null {
  const writes: BoardMovePlan['writes'] = []
  for (const node of nodes) {
    if (matchesNode(node, entry) || isStampedBy(node, stamp)) continue
    if (!isWritableEquals(node) || hasRelationship(entry, node.field)) return null
    writes.push({ key: frontmatterKey(entry, node.field), value: node.value })
  }
  return writes
}

function applyWrites(entry: VaultEntry, writes: BoardMovePlan['writes']): VaultEntry {
  const next: VaultEntry = { ...entry, properties: { ...entry.properties } }
  for (const { key, value } of writes) {
    const lower = key.toLowerCase()
    if (lower === 'status') next.status = String(value)
    else if (lower === 'type' || lower === 'isa') next.isA = String(value)
    else Reflect.set(next.properties, key, value)
  }
  return next
}

function containingColumns(entry: VaultEntry, columns: BoardColumn[]): BoardColumn[] {
  return columns.filter((column) => column.cards.some((card) => card.entry.path === entry.path))
}

function stampRemovals(sources: BoardColumn[], target: BoardColumn): string[] {
  const targetStamp = target.config?.stamp ?? null
  const stamps = sources.map((source) => source.config?.stamp).filter((stamp): stamp is string => !!stamp && stamp !== targetStamp)
  return [...new Set(stamps)]
}

/**
 * Work out the frontmatter edits that move a card into a column (ADR-0301): set whatever the target
 * View requires that the note does not already meet. Null when the move is not possible, would change
 * nothing, or would not actually make the note match the target View.
 */
export function planBoardMove({ entry, columns, target, today }: BoardMoveRequest): BoardMovePlan | null {
  const view = target.view
  if (!view || !('all' in view.definition.filters)) return null
  const sources = containingColumns(entry, columns)
  if (sources.some((source) => source.key === target.key)) return null

  const stamp = target.config?.stamp
  const writes = writesFor(entry, view.definition.filters.all, stamp)
  if (!writes) return null
  if (stamp) writes.push({ key: stamp, value: today })
  if (evaluateView(view.definition, [applyWrites(entry, writes)]).length === 0) return null
  return { writes, removals: stampRemovals(sources, target) }
}

export interface BoardMoveWriters {
  updateProperty: (path: string, key: string, value: Scalar) => Promise<unknown>
  deleteProperty: (path: string, key: string) => Promise<unknown>
}

/** Apply a move plan through the existing frontmatter write path, one edit at a time. */
export function applyBoardMovePlan(path: string, plan: BoardMovePlan, writers: BoardMoveWriters): Promise<void> {
  const steps = [
    ...plan.writes.map(({ key, value }) => () => writers.updateProperty(path, key, value)),
    ...plan.removals.map((key) => () => writers.deleteProperty(path, key)),
  ]
  return steps.reduce<Promise<unknown>>((chain, step) => chain.then(step), Promise.resolve()).then(() => undefined)
}
