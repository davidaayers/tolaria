import type { FilterGroup, SidebarSelection, VaultEntry, ViewFile } from '../types'

export const COLLECTION_PRESENTATION_LIST = 'list'
export const COLLECTION_PRESENTATION_KANBAN = 'kanban'

export type CollectionPresentationType = typeof COLLECTION_PRESENTATION_LIST | typeof COLLECTION_PRESENTATION_KANBAN

export interface ListCollectionPresentationConfig {
  type: typeof COLLECTION_PRESENTATION_LIST
  sort: string | null
  properties: string[]
}

export const KANBAN_COLUMN_COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'pink', 'yellow', 'red', 'gray'] as const
export type KanbanColumnColor = typeof KANBAN_COLUMN_COLORS[number]

/** One Kanban column driven by a saved View (ADR-0303). */
export interface KanbanColumnConfig {
  /** Filename of the saved View this column shows, for example `tasks-backlog.yml`. */
  view: string
  /** Work-in-progress limit; warns, never blocks. */
  wipLimit: number | null
  /** Cards shown before the "+N more" footer. */
  show: number | null
  /** Property stamped with today's date when a card enters the column. */
  stamp: string | null
}

export interface KanbanCollectionPresentationConfig {
  type: typeof COLLECTION_PRESENTATION_KANBAN
  groupBy: string | null
  properties: string[]
  columnOrder: string[]
  /** When non-empty, columns come from these saved Views and `groupBy` is ignored. */
  columns: KanbanColumnConfig[]
}

export type CollectionPresentationConfig = ListCollectionPresentationConfig | KanbanCollectionPresentationConfig

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
