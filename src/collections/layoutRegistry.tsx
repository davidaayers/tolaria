import type { MouseEvent, ReactNode } from 'react'
import { Kanban, ListBullets, type Icon } from '@phosphor-icons/react'
import { KanbanLayout } from '../components/note-list/KanbanLayout'
import type { AppLocale, TranslationKey } from '../lib/i18n'
import type { VaultEntry, ViewFile } from '../types'
import { COLLECTION_PRESENTATION_KANBAN, COLLECTION_PRESENTATION_LIST, type CollectionPresentationType, type KanbanColumnConfig } from './collectionTypes'
import type { ViewColumnCreatePlan } from './kanbanViewColumnCreate'
import type { ViewColumnMovePlan } from './kanbanViewColumnMove'

export interface CollectionLayoutRendererProps {
  listContent: ReactNode
  entries: VaultEntry[]
  /** Every vault entry, so card property chips resolve links exactly like list rows. */
  allEntries: VaultEntry[]
  groupBy: string
  properties: string[]
  columnOrder: string[]
  onColumnOrderChange: (order: string[]) => void
  /** Saved-View columns; when non-empty they replace group-by columns. */
  columns?: KanbanColumnConfig[]
  views?: ViewFile[]
  /** The saved View being shown as a board, which never serves as its own column. */
  boardView?: ViewFile | null
  onColumnsChange?: (columns: KanbanColumnConfig[]) => void
  /** Applies the frontmatter edits that move a card into a View-driven column. */
  onApplyMove?: (entry: VaultEntry, plan: ViewColumnMovePlan) => Promise<void>
  /** Creates a card in a View-driven column; absent means the board cannot create notes. */
  onCreateCard?: (title: string, plan: ViewColumnCreatePlan) => void
  locale: AppLocale
  typeEntryMap: Record<string, VaultEntry>
  displayPropsOverride?: string[] | null
  selectedNotePath?: string | null
  onOpen: (entry: VaultEntry, event: MouseEvent) => void
  onMove: (entry: VaultEntry, value: string | null) => void
}

export interface CollectionLayoutRegistration {
  type: CollectionPresentationType
  labelKey: TranslationKey
  icon: Icon
  /** Header controls this layout adds next to the shared note-list actions. */
  controls: readonly 'groupBy'[]
  requiredProperties: (config: Record<string, unknown>) => string[]
  render: (props: CollectionLayoutRendererProps) => ReactNode
}

const registrations: CollectionLayoutRegistration[] = [
  {
    type: COLLECTION_PRESENTATION_LIST,
    labelKey: 'layout.list',
    icon: ListBullets,
    controls: [],
    requiredProperties: () => [],
    render: ({ listContent }) => listContent,
  },
  {
    type: COLLECTION_PRESENTATION_KANBAN,
    labelKey: 'layout.kanban',
    icon: Kanban,
    controls: ['groupBy'],
    requiredProperties: (config) => typeof config.groupBy === 'string' ? [config.groupBy] : [],
    render: (props) => <KanbanLayout {...props} />,
  },
]

export function getCollectionLayouts(): readonly CollectionLayoutRegistration[] {
  return registrations
}

export function getCollectionLayout(type: CollectionPresentationType): CollectionLayoutRegistration {
  return registrations.find((layout) => layout.type === type) ?? registrations[0]
}
