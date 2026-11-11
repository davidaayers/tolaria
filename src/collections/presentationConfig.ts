import type { ViewDefinition } from '../types'
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

function isChipColor(value: unknown): value is BoardChipColor {
  return typeof value === 'string' && (BOARD_CHIP_COLORS as readonly string[]).includes(value.trim().toLowerCase())
}

function chipColor(value: unknown): BoardChipColor | null {
  return isChipColor(value) ? (value.trim().toLowerCase() as BoardChipColor) : null
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function boardColumn(value: unknown): BoardColumnConfig | null {
  const source = typeof value === 'string' ? { view: value } : value
  if (!isRecord(source)) return null
  const view = nullableString(source.view)?.trim()
  if (!view) return null
  return {
    view,
    limit: positiveInteger(source.limit),
    max: positiveInteger(source.max),
    stamp: nullableString(source.stamp)?.trim() ?? null,
  }
}

function boardColumns(value: unknown): BoardColumnConfig[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const columns: BoardColumnConfig[] = []
  for (const raw of value) {
    const column = boardColumn(raw)
    if (!column || seen.has(column.view.toLowerCase())) continue
    seen.add(column.view.toLowerCase())
    columns.push(column)
  }
  return columns
}

function chipColors(value: unknown): Record<string, BoardChipColor> {
  if (!isRecord(value)) return {}
  const colors: Record<string, BoardChipColor> = {}
  for (const [key, color] of Object.entries(value)) {
    const accent = chipColor(color)
    if (accent) colors[key.trim().toLowerCase()] = accent
  }
  return colors
}

function boardPresentation(source: UnknownRecord): BoardCollectionPresentationConfig | null {
  const columns = boardColumns(source.columns)
  if (columns.length === 0) return null
  return {
    type: COLLECTION_PRESENTATION_BOARD,
    properties: stringArray(source.properties),
    columns,
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
