import type { VaultEntry, ViewFile } from '../types'
import { getSortComparator } from '../utils/noteListHelpers'
import { parseSortConfig } from '../utils/noteSort'
import { evaluateView } from '../utils/viewFilters'
import {
  KANBAN_COLUMN_COLORS,
  type KanbanColumnColor,
  type KanbanColumnConfig,
} from './collectionTypes'

export const OTHER_COLUMN_KEY = '__other__'

export interface KanbanViewColumn {
  /** The referenced View's filename, or `OTHER_COLUMN_KEY`. */
  key: string
  /** The View's name (the filename without extension when the View is missing). Other is labelled by the UI. */
  label: string
  /** The View's `icon`: emoji, icon name or image URL. */
  icon: string | null
  /** The View's `color`, when it is a known accent. */
  color: KanbanColumnColor | null
  view: ViewFile | null
  /** True when the column references a View that does not exist. */
  missing: boolean
  isOther: boolean
  config: KanbanColumnConfig | null
  cards: VaultEntry[]
  visibleCards: VaultEntry[]
  hiddenCount: number
  /** The column's WIP limit, when it has one. */
  wipLimit: number | null
  overLimit: boolean
}

function findView(views: ViewFile[], filename: string, boardView: ViewFile | null | undefined): ViewFile | null {
  const candidates = views.filter((view) => view.filename === filename && view !== boardView && view.filename !== boardView?.filename)
  const sameRoot = candidates.find((view) => (view.rootPath ?? '') === (boardView?.rootPath ?? ''))
  return sameRoot ?? candidates[0] ?? null
}

function viewColor(view: ViewFile | null): KanbanColumnColor | null {
  const color = view?.definition.color?.trim().toLowerCase() ?? ''
  return (KANBAN_COLUMN_COLORS as readonly string[]).includes(color) ? (color as KanbanColumnColor) : null
}

function sortedBy(entries: VaultEntry[], sort: string | null | undefined): VaultEntry[] {
  const config = parseSortConfig(sort)
  if (!config) return entries
  return [...entries].sort(getSortComparator(config.option, config.direction))
}

type ColumnIdentity = Pick<KanbanViewColumn, 'key' | 'label' | 'icon' | 'color' | 'view' | 'missing' | 'isOther'>

function finishColumn(identity: ColumnIdentity, config: KanbanColumnConfig | null, entries: VaultEntry[]): KanbanViewColumn {
  const cards = entries
  const show = config?.show ?? null
  const wipLimit = config?.wipLimit ?? null
  const visibleCards = show === null ? cards : cards.slice(0, show)
  return {
    ...identity,
    config,
    cards,
    visibleCards,
    hiddenCount: cards.length - visibleCards.length,
    wipLimit,
    overLimit: wipLimit !== null && cards.length > wipLimit,
  }
}

function fileLabel(filename: string): string {
  return filename.replace(/\.ya?ml$/i, '')
}

function viewColumn(config: KanbanColumnConfig, view: ViewFile | null, entries: VaultEntry[]): KanbanViewColumn {
  if (!view) {
    return finishColumn(
      { key: config.view, label: fileLabel(config.view), icon: null, color: null, view: null, missing: true, isOther: false },
      config,
      [],
    )
  }
  const matching = sortedBy(evaluateView(view.definition, entries), view.definition.sort)
  return finishColumn(
    { key: config.view, label: view.definition.name, icon: view.definition.icon, color: viewColor(view), view, missing: false, isOther: false },
    config,
    matching,
  )
}

function otherColumn(entries: VaultEntry[], placed: Set<string>): KanbanViewColumn[] {
  const rest = entries.filter((entry) => !placed.has(entry.path))
  if (rest.length === 0) return []
  const identity = { key: OTHER_COLUMN_KEY, label: 'Other', icon: null, color: null, view: null, missing: false, isOther: true }
  return [finishColumn(identity, null, rest)]
}

/**
 * Turn notes into columns (ADR-0303). Each column is a saved View: a note shows in every column whose
 * View it matches. Columns draw from `pool` (the whole vault when the caller passes it), so the board
 * View's own filter does not limit them; Other holds the board's `entries` that match no column.
 * Pure: no I/O.
 */
export function buildViewColumns(
  entries: VaultEntry[],
  configs: KanbanColumnConfig[],
  views: ViewFile[],
  boardView?: ViewFile | null,
  pool: VaultEntry[] = entries,
): KanbanViewColumn[] {
  const columns = configs.map((column) => viewColumn(column, findView(views, column.view, boardView), pool))
  const placed = new Set(columns.flatMap((column) => column.cards.map((card) => card.path)))
  return [...columns, ...otherColumn(entries, placed)]
}
