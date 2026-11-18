import type { KanbanColumnColor } from '../../collections/collectionTypes'
import type { KanbanViewColumn } from '../../collections/kanbanViewColumns'
import { type AppLocale, translate } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import { columnTitle, groupEntries, orderColumns, type PendingMoves } from './kanbanModel'

/** What the board renders for one column, whether it comes from a group-by value or a saved View. */
export interface KanbanBoardColumn {
  /** Group value, saved-View filename or the Other key; unique within a board. */
  key: string
  title: string
  icon: string | null
  color: KanbanColumnColor | null
  /** Cards to render, after the `show` cap. */
  cards: VaultEntry[]
  /** Every card in the column. */
  count: number
  hiddenCount: number
  wipLimit: number | null
  overLimit: boolean
  /** The column's saved View does not exist. */
  missing: boolean
  /** Columns can be dragged into a new order. */
  reorderable: boolean
  /** A new card can be created in this column. */
  canCreate: boolean
}

/** A drop that the vault has not confirmed yet: the card shows in its new column until it does. */
export interface ViewPendingMove {
  entry: VaultEntry
  from: string
  to: string
}
export type ViewPendingMoves = ReadonlyMap<string, ViewPendingMove>

export function groupBoardColumns(
  entries: VaultEntry[],
  groupBy: string,
  pending: PendingMoves,
  columnOrder: string[],
  locale: AppLocale,
): KanbanBoardColumn[] {
  const grouped = groupEntries(entries, groupBy, pending)
  return orderColumns(grouped.keys(), columnOrder).map((key) => {
    const cards = grouped.get(key) ?? []
    return {
      key, title: columnTitle(key, locale), icon: null, color: null, cards, count: cards.length,
      hiddenCount: 0, wipLimit: null, overLimit: false, missing: false, reorderable: true, canCreate: false,
    }
  })
}

function cardsWithPending(column: KanbanViewColumn, pending: ViewPendingMoves): VaultEntry[] {
  const moves = [...pending.values()]
  const present = new Set(column.cards.map((card) => card.path))
  const incoming = moves.filter((move) => move.to === column.key && !present.has(move.entry.path)).map((move) => move.entry)
  const outgoing = new Set(moves.filter((move) => move.from === column.key && move.to !== move.from).map((move) => move.entry.path))
  return [...incoming, ...column.cards.filter((card) => !outgoing.has(card.path))]
}

function viewColumnTitle(column: KanbanViewColumn, locale: AppLocale): string {
  if (column.isOther) return translate(locale, 'layout.otherColumn')
  if (column.missing) return translate(locale, 'layout.viewMissing', { view: column.label })
  return column.label
}

export function viewBoardColumns(columns: KanbanViewColumn[], pending: ViewPendingMoves, locale: AppLocale, creatable: ReadonlySet<string> = new Set()): KanbanBoardColumn[] {
  return columns.map((column) => {
    const all = cardsWithPending(column, pending)
    const show = column.config?.show ?? null
    const cards = show === null ? all : all.slice(0, show)
    const wipLimit = column.wipLimit
    return {
      key: column.key,
      title: viewColumnTitle(column, locale),
      icon: column.icon,
      color: column.color,
      cards,
      count: all.length,
      hiddenCount: all.length - cards.length,
      wipLimit,
      overLimit: wipLimit !== null && all.length > wipLimit,
      missing: column.missing,
      reorderable: !column.isOther,
      canCreate: creatable.has(column.key),
    }
  })
}

/** Drops pending moves once the target column reports the card. */
export function settleViewMoves(pending: ViewPendingMoves, columns: KanbanViewColumn[]): ViewPendingMoves {
  if (pending.size === 0) return pending
  const next = new Map(pending)
  for (const [path, move] of pending) {
    const target = columns.find((column) => column.key === move.to)
    if (!target || target.cards.some((card) => card.path === path)) next.delete(path)
  }
  return next.size === pending.size ? pending : next
}
