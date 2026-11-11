import type { FilterNode, ViewFile } from '../types'
import { BOARD_CHIP_COLORS, type BoardChipColor } from './collectionTypes'

interface ColumnRef {
  key: string
  /** The column's group-by value; null for Other. */
  value: string | null
}

interface ColumnColorOptions {
  views: ViewFile[]
  groupBy: string
  columns: ColumnRef[]
  /** The board View itself, which never colours its own columns. */
  exclude?: ViewFile | null
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function viewColor(view: ViewFile): BoardChipColor | null {
  const color = normalized(view.definition.color)
  return (BOARD_CHIP_COLORS as readonly string[]).includes(color) ? (color as BoardChipColor) : null
}

function topLevelConditions(view: ViewFile): FilterNode[] {
  const filters = view.definition.filters
  return 'all' in filters ? filters.all : []
}

function filtersOnValue(view: ViewFile, groupBy: string, value: string): boolean {
  return topLevelConditions(view).some((node) =>
    'field' in node
      && node.op === 'equals'
      && normalized(node.field) === groupBy
      && normalized(node.value) === value,
  )
}

/**
 * Column colours borrowed from the saved Views that filter on a column's value (for example the
 * "In Progress" View for the `in-progress` column), so a board matches the sidebar without extra config.
 */
export function columnColorsFromViews({ views, groupBy, columns, exclude }: ColumnColorOptions): Record<string, BoardChipColor> {
  const group = normalized(groupBy)
  const candidates = views.filter((view) => view !== exclude && viewColor(view) !== null)
  const colors: Record<string, BoardChipColor> = {}
  for (const column of columns) {
    if (column.value === null) continue
    const value = normalized(column.value)
    const match = candidates.find((view) => filtersOnValue(view, group, value))
    const color = match ? viewColor(match) : null
    if (color) colors[column.key] = color
  }
  return colors
}
