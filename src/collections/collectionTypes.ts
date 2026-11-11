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
  /** Filename of the saved View this column shows, for example `tasks-backlog.yml`. */
  view: string
  /** Work-in-progress limit (`wipLimit`); warns, never blocks. */
  wipLimit: number | null
  /** Cards shown (`show`) before the "+N more" footer. */
  show: number | null
  /** Property stamped with today's date when a card enters the column. */
  stamp: string | null
}

export interface BoardCollectionPresentationConfig {
  type: typeof COLLECTION_PRESENTATION_BOARD
  properties: string[]
  /** One column per referenced saved View; name, icon, colour, sort and filter come from that View. */
  columns: BoardColumnConfig[]
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
