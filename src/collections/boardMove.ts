import type { VaultEntry } from '../types'
import type { BoardColumn } from './boardColumns'

export interface BoardMovePlan {
  /** Frontmatter properties to set, group-by value first. */
  writes: Array<{ key: string; value: string }>
  /** Frontmatter properties to delete. */
  removals: string[]
}

interface BoardMoveRequest {
  entry: VaultEntry
  groupBy: string
  columns: BoardColumn[]
  target: BoardColumn
  /** ISO date (YYYY-MM-DD) written to a column's `stamp` property. */
  today: string
}

function frontmatterKey(entry: VaultEntry, groupBy: string): string {
  const lower = groupBy.toLowerCase()
  const existing = Object.keys(entry.properties).find((key) => key.toLowerCase() === lower)
  if (existing) return existing
  return lower === 'isa' ? 'type' : groupBy
}

function currentColumn(entry: VaultEntry, columns: BoardColumn[]): BoardColumn | null {
  return columns.find((column) => column.cards.some((card) => card.entry.path === entry.path)) ?? null
}

function currentCard(entry: VaultEntry, column: BoardColumn | null) {
  return column?.cards.find((card) => card.entry.path === entry.path) ?? null
}

function stampRemovals(source: BoardColumn | null, target: BoardColumn): string[] {
  const sourceStamp = source?.config?.stamp
  if (!sourceStamp || sourceStamp === target.config?.stamp) return []
  return [sourceStamp]
}

/**
 * Work out the frontmatter edits that move a card to another column (ADR-0301).
 * Returns null when the move is not allowed or would change nothing.
 */
export function planBoardMove({ entry, groupBy, columns, target, today }: BoardMoveRequest): BoardMovePlan | null {
  if (target.value === null) return null
  const source = currentColumn(entry, columns)
  if (source?.key === target.key) return null
  if (currentCard(entry, source)?.draggable === false) return null

  const writes = [{ key: frontmatterKey(entry, groupBy), value: target.value }]
  const stamp = target.config?.stamp
  if (stamp) writes.push({ key: stamp, value: today })
  return { writes, removals: stampRemovals(source, target) }
}

export interface BoardMoveWriters {
  updateProperty: (path: string, key: string, value: string) => Promise<unknown>
  deleteProperty: (path: string, key: string) => Promise<unknown>
}

/** Apply a move plan through the existing frontmatter write path, one edit at a time. */
export async function applyBoardMovePlan(path: string, plan: BoardMovePlan, writers: BoardMoveWriters): Promise<void> {
  for (const { key, value } of plan.writes) await writers.updateProperty(path, key, value)
  for (const key of plan.removals) await writers.deleteProperty(path, key)
}
