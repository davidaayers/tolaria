import type { FilterGroup, SidebarSelection, VaultEntry, ViewFile } from '../types'

export const COLLECTION_PRESENTATION_LIST = 'list'
export const COLLECTION_PRESENTATION_BOARD = 'board'

export type CollectionPresentationType = typeof COLLECTION_PRESENTATION_LIST | typeof COLLECTION_PRESENTATION_BOARD

export interface ListCollectionPresentationConfig {
  type: typeof COLLECTION_PRESENTATION_LIST
  sort: string | null
  properties: string[]
}

export const BOARD_CHIP_COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'pink', 'yellow', 'red', 'gray'] as const
export type BoardChipColor = typeof BOARD_CHIP_COLORS[number]

export interface BoardColumnConfig {
  /** Matched against the group-by property, case-insensitively after trimming. */
  value: string
  label: string | null
  /** Emoji, icon name or image URL shown in the column heading (same values as a View's `icon`). */
  icon: string | null
  /** Work-in-progress limit; warns, never blocks. */
  limit: number | null
  /** Cards shown before the "+N more" footer. */
  max: number | null
  sort: string | null
  filter: FilterGroup | null
  /** Property stamped with today's date when a card enters the column. */
  stamp: string | null
}

export interface BoardCollectionPresentationConfig {
  type: typeof COLLECTION_PRESENTATION_BOARD
  groupBy: string
  properties: string[]
  /** `null` derives one column per distinct value present. */
  columns: BoardColumnConfig[] | null
  staleAfterDays: number | null
  staleFrom: string | null
  /** Chip colour per property value (lowercase key); values without an entry get an automatic colour. */
  colors: Record<string, BoardChipColor>
}

export type CollectionPresentationConfig = ListCollectionPresentationConfig | BoardCollectionPresentationConfig

export type CollectionOrigin = 'builtin' | 'type' | 'folder' | 'saved-view' | 'neighborhood'

export interface CollectionDefinition {
  id: string
  label: string
  origin: CollectionOrigin
  selection: SidebarSelection
  presentation: CollectionPresentationConfig
  filter?: FilterGroup
  entry?: VaultEntry
  view?: ViewFile
}
