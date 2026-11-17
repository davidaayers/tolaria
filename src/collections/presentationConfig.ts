import type { ViewDefinition } from '../types'
import {
  COLLECTION_PRESENTATION_KANBAN,
  COLLECTION_PRESENTATION_LIST,
  type CollectionPresentationConfig,
  type KanbanCollectionPresentationConfig,
  type KanbanColumnConfig,
  type ListCollectionPresentationConfig,
} from './collectionTypes'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function listPresentation(source: UnknownRecord, fallback: ListCollectionPresentationConfig): ListCollectionPresentationConfig {
  return {
    type: COLLECTION_PRESENTATION_LIST,
    sort: nullableString(source.sort) ?? fallback.sort,
    properties: stringArray(source.properties).length > 0 ? stringArray(source.properties) : fallback.properties,
  }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function kanbanColumn(value: unknown): KanbanColumnConfig | null {
  const source = typeof value === 'string' ? { view: value } : value
  if (!isRecord(source)) return null
  const view = nullableString(source.view)?.trim()
  if (!view) return null
  return {
    view,
    wipLimit: positiveInteger(source.wipLimit),
    show: positiveInteger(source.show),
    stamp: nullableString(source.stamp)?.trim() ?? null,
  }
}

/** Columns that reference saved Views; malformed entries and repeated Views are dropped. */
function kanbanColumns(value: unknown): KanbanColumnConfig[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const columns: KanbanColumnConfig[] = []
  for (const raw of value) {
    const column = kanbanColumn(raw)
    if (!column || seen.has(column.view.toLowerCase())) continue
    seen.add(column.view.toLowerCase())
    columns.push(column)
  }
  return columns
}

function kanbanPresentation(source: UnknownRecord): KanbanCollectionPresentationConfig {
  return {
    type: COLLECTION_PRESENTATION_KANBAN,
    groupBy: nullableString(source.groupBy),
    properties: stringArray(source.properties),
    columnOrder: stringArray(source.columnOrder),
    columns: kanbanColumns(source.columns),
  }
}

export function defaultListPresentation(): ListCollectionPresentationConfig {
  return { type: COLLECTION_PRESENTATION_LIST, sort: null, properties: [] }
}

export function presentationFromViewDefinition(definition: ViewDefinition): CollectionPresentationConfig {
  const fallback: ListCollectionPresentationConfig = {
    type: COLLECTION_PRESENTATION_LIST,
    sort: nullableString(definition.sort),
    properties: stringArray(definition.listPropertiesDisplay),
  }
  const rawPresentation = Reflect.get(definition as unknown as UnknownRecord, 'presentation')
  if (!isRecord(rawPresentation)) return fallback
  if (rawPresentation.type === COLLECTION_PRESENTATION_KANBAN) return kanbanPresentation(rawPresentation)
  if (rawPresentation.type === COLLECTION_PRESENTATION_LIST) return listPresentation(rawPresentation, fallback)
  return fallback
}
