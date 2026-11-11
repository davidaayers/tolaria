import type { FilterGroup, ViewDefinition } from '../types'
import {
  COLLECTION_PRESENTATION_BOARD,
  COLLECTION_PRESENTATION_LIST,
  BOARD_CHIP_COLORS,
  type BoardChipColor,
  type BoardCollectionPresentationConfig,
  type BoardColumnConfig,
  type CollectionPresentationConfig,
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

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function filterGroup(value: unknown): FilterGroup | null {
  if (!isRecord(value)) return null
  return Array.isArray(value.all) || Array.isArray(value.any) ? (value as FilterGroup) : null
}

function boardColumn(value: unknown): BoardColumnConfig | null {
  if (!isRecord(value)) return null
  const columnValue = nullableString(value.value)
  if (columnValue === null) return null
  return {
    value: columnValue,
    label: nullableString(value.label),
    icon: nullableString(value.icon)?.trim() ?? null,
    limit: positiveInteger(value.limit),
    max: positiveInteger(value.max),
    sort: nullableString(value.sort),
    filter: filterGroup(value.filter),
    stamp: nullableString(value.stamp),
  }
}

function normalizedColumnValue(column: BoardColumnConfig): string {
  return column.value.trim().toLowerCase()
}

function boardColumns(value: unknown): BoardColumnConfig[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<string>()
  const columns: BoardColumnConfig[] = []
  for (const raw of value) {
    const column = boardColumn(raw)
    if (!column || seen.has(normalizedColumnValue(column))) continue
    seen.add(normalizedColumnValue(column))
    columns.push(column)
  }
  return columns
}

function isChipColor(value: unknown): value is BoardChipColor {
  return typeof value === 'string' && (BOARD_CHIP_COLORS as readonly string[]).includes(value.toLowerCase())
}

function chipColors(value: unknown): Record<string, BoardChipColor> {
  if (!isRecord(value)) return {}
  const colors: Record<string, BoardChipColor> = {}
  for (const [key, color] of Object.entries(value)) {
    if (isChipColor(color)) colors[key.trim().toLowerCase()] = color.toLowerCase() as BoardChipColor
  }
  return colors
}

function boardPresentation(source: UnknownRecord): BoardCollectionPresentationConfig | null {
  const groupBy = nullableString(source.groupBy)
  if (groupBy === null) return null
  return {
    type: COLLECTION_PRESENTATION_BOARD,
    groupBy,
    properties: stringArray(source.properties),
    columns: boardColumns(source.columns),
    staleAfterDays: positiveInteger(source.staleAfterDays),
    staleFrom: nullableString(source.staleFrom),
    colors: chipColors(source.colors),
  }
}

function listPresentation(source: UnknownRecord, fallback: ListCollectionPresentationConfig): ListCollectionPresentationConfig {
  return {
    type: COLLECTION_PRESENTATION_LIST,
    sort: nullableString(source.sort) ?? fallback.sort,
    properties: stringArray(source.properties).length > 0 ? stringArray(source.properties) : fallback.properties,
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
  const rawPresentation = definition.presentation
  if (!isRecord(rawPresentation)) return fallback
  if (rawPresentation.type === COLLECTION_PRESENTATION_BOARD) return boardPresentation(rawPresentation) ?? fallback
  if (rawPresentation.type !== COLLECTION_PRESENTATION_LIST) return fallback
  return listPresentation(rawPresentation, fallback)
}
