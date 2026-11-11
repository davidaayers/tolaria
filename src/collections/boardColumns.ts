import type { VaultEntry, ViewFile } from '../types'
import { getSortComparator } from '../utils/noteListHelpers'
import { parseSortConfig } from '../utils/noteSort'
import { evaluateView } from '../utils/viewFilters'
import {
  BOARD_CHIP_COLORS,
  type BoardChipColor,
  type BoardCollectionPresentationConfig,
  type BoardColumnConfig,
} from './collectionTypes'

export const OTHER_COLUMN_KEY = '__other__'

export interface BoardCard {
  entry: VaultEntry
}

export interface BoardColumn {
  /** The referenced View's filename, or `OTHER_COLUMN_KEY`. */
  key: string
  /** The View's name (the filename without extension when the View is missing). Other is labelled by the UI. */
  label: string
  /** The View's `icon`: emoji, icon name or image URL. */
  icon: string | null
  /** The View's `color`, when it is a known accent. */
  color: BoardChipColor | null
  view: ViewFile | null
  /** True when the column references a View that does not exist. */
  missing: boolean
  isOther: boolean
  config: BoardColumnConfig | null
  cards: BoardCard[]
  visibleCards: BoardCard[]
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

function viewColor(view: ViewFile | null): BoardChipColor | null {
  const color = view?.definition.color?.trim().toLowerCase() ?? ''
  return (BOARD_CHIP_COLORS as readonly string[]).includes(color) ? (color as BoardChipColor) : null
}

function sortedBy(entries: VaultEntry[], sort: string | null | undefined): VaultEntry[] {
  const config = parseSortConfig(sort)
  if (!config) return entries
  return [...entries].sort(getSortComparator(config.option, config.direction))
}

type ColumnIdentity = Pick<BoardColumn, 'key' | 'label' | 'icon' | 'color' | 'view' | 'missing' | 'isOther'>

function finishColumn(identity: ColumnIdentity, config: BoardColumnConfig | null, entries: VaultEntry[]): BoardColumn {
  const cards = entries.map((entry) => ({ entry }))
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

function viewColumn(config: BoardColumnConfig, view: ViewFile | null, entries: VaultEntry[]): BoardColumn {
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

function otherColumn(entries: VaultEntry[], placed: Set<string>): BoardColumn[] {
  const rest = entries.filter((entry) => !placed.has(entry.path))
  if (rest.length === 0) return []
  const identity = { key: OTHER_COLUMN_KEY, label: 'Other', icon: null, color: null, view: null, missing: false, isOther: true }
  return [finishColumn(identity, null, rest)]
}

/**
 * Turn a board View's filtered notes into columns (ADR-0301). Each column is a saved View: a note
 * shows in every column whose View it matches, and in Other when it matches none. Pure: no I/O.
 */
export function buildBoardColumns(
  entries: VaultEntry[],
  config: BoardCollectionPresentationConfig,
  views: ViewFile[],
  boardView?: ViewFile | null,
): BoardColumn[] {
  const columns = config.columns.map((column) => viewColumn(column, findView(views, column.view, boardView), entries))
  const placed = new Set(columns.flatMap((column) => column.cards.map((card) => card.entry.path)))
  return [...columns, ...otherColumn(entries, placed)]
}
