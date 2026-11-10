import type { VaultEntry, VaultPropertyValue } from '../types'
import { getSortComparator } from '../utils/noteListHelpers'
import { parseSortConfig } from '../utils/noteSort'
import { evaluateView } from '../utils/viewFilters'
import type { BoardCollectionPresentationConfig, BoardColumnConfig } from './collectionTypes'

export const OTHER_COLUMN_KEY = '__other__'

export interface BoardCard {
  entry: VaultEntry
  /** False when the group-by value is a list or wikilink: the card cannot be moved by writing one scalar. */
  draggable: boolean
}

export interface BoardColumn {
  /** Normalized value, or `OTHER_COLUMN_KEY`. */
  key: string
  /** Value written to the group-by property when a card is moved here; null for Other. */
  value: string | null
  label: string
  isOther: boolean
  config: BoardColumnConfig | null
  cards: BoardCard[]
  visibleCards: BoardCard[]
  hiddenCount: number
  limit: number | null
  overLimit: boolean
}

type GroupValue = { kind: 'scalar'; value: string | null } | { kind: 'unsupported' }

type BuiltInReader = (entry: VaultEntry) => string | null

const BUILT_IN_READERS = new Map<string, BuiltInReader>([
  ['type', (entry) => entry.isA],
  ['isa', (entry) => entry.isA],
  ['status', (entry) => entry.status],
  ['title', (entry) => entry.title],
  ['filename', (entry) => entry.filename],
])

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function scalarGroupValue(raw: string | number | boolean | null | undefined): GroupValue {
  if (raw === null || raw === undefined) return { kind: 'scalar', value: null }
  const text = String(raw).trim()
  return { kind: 'scalar', value: text.length > 0 ? text : null }
}

function findKey(record: Record<string, unknown>, lower: string): string | undefined {
  return Object.keys(record).find((key) => key.toLowerCase() === lower)
}

function propertyGroupValue(value: VaultPropertyValue): GroupValue {
  return Array.isArray(value) ? { kind: 'unsupported' } : scalarGroupValue(value)
}

function readGroupValue(entry: VaultEntry, groupBy: string): GroupValue {
  const lower = groupBy.toLowerCase()
  const builtIn = BUILT_IN_READERS.get(lower)
  if (builtIn) return scalarGroupValue(builtIn(entry))
  if (findKey(entry.relationships, lower) !== undefined) return { kind: 'unsupported' }
  const propertyKey = findKey(entry.properties, lower)
  return propertyKey === undefined ? { kind: 'scalar', value: null } : propertyGroupValue(entry.properties[propertyKey])
}

function toCard(entry: VaultEntry, group: GroupValue): BoardCard {
  return { entry, draggable: group.kind === 'scalar' }
}

function applyColumnFilter(cards: BoardCard[], config: BoardColumnConfig | null): BoardCard[] {
  if (!config?.filter) return cards
  const view = { name: '', icon: null, color: null, sort: null, filters: config.filter }
  const kept = new Set(evaluateView(view, cards.map((card) => card.entry)))
  return cards.filter((card) => kept.has(card.entry))
}

function applyColumnSort(cards: BoardCard[], config: BoardColumnConfig | null): BoardCard[] {
  const sort = parseSortConfig(config?.sort)
  if (!sort) return cards
  const compare = getSortComparator(sort.option, sort.direction)
  return [...cards].sort((left, right) => compare(left.entry, right.entry))
}

function finishColumn(
  base: Pick<BoardColumn, 'key' | 'value' | 'label' | 'isOther'>,
  config: BoardColumnConfig | null,
  rawCards: BoardCard[],
): BoardColumn {
  const cards = applyColumnSort(applyColumnFilter(rawCards, config), config)
  const max = config?.max ?? null
  const limit = config?.limit ?? null
  const visibleCards = max === null ? cards : cards.slice(0, max)
  return {
    ...base,
    config,
    cards,
    visibleCards,
    hiddenCount: cards.length - visibleCards.length,
    limit,
    overLimit: limit !== null && cards.length > limit,
  }
}

interface Placement {
  byKey: Map<string, BoardCard[]>
  labels: Map<string, string>
  other: BoardCard[]
}

function placeCards(entries: VaultEntry[], groupBy: string, declared: Set<string> | null): Placement {
  const placement: Placement = { byKey: new Map(), labels: new Map(), other: [] }
  for (const entry of entries) {
    const group = readGroupValue(entry, groupBy)
    const card = toCard(entry, group)
    const value = group.kind === 'scalar' ? group.value : null
    const key = value === null ? null : normalize(value)
    if (key === null || (declared !== null && !declared.has(key))) {
      placement.other.push(card)
      continue
    }
    if (!placement.labels.has(key)) placement.labels.set(key, value as string)
    placement.byKey.set(key, [...(placement.byKey.get(key) ?? []), card])
  }
  return placement
}

function declaredColumns(columns: BoardColumnConfig[], placement: Placement): BoardColumn[] {
  return columns.map((config) => {
    const key = normalize(config.value)
    return finishColumn(
      { key, value: config.value, label: config.label ?? config.value, isOther: false },
      config,
      placement.byKey.get(key) ?? [],
    )
  })
}

function derivedColumns(placement: Placement): BoardColumn[] {
  return [...placement.byKey.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const value = placement.labels.get(key) as string
      return finishColumn({ key, value, label: value, isOther: false }, null, placement.byKey.get(key) ?? [])
    })
}

function otherColumn(placement: Placement): BoardColumn[] {
  if (placement.other.length === 0) return []
  return [finishColumn({ key: OTHER_COLUMN_KEY, value: null, label: 'Other', isOther: true }, null, placement.other)]
}

/** Group a View's filtered entries into board columns (ADR-0301). Pure: no I/O, no writes. */
export function buildBoardColumns(
  entries: VaultEntry[],
  config: BoardCollectionPresentationConfig,
): BoardColumn[] {
  const declared = config.columns
  const placement = placeCards(entries, config.groupBy, declared ? new Set(declared.map((c) => normalize(c.value))) : null)
  const columns = declared ? declaredColumns(declared, placement) : derivedColumns(placement)
  return [...columns, ...otherColumn(placement)]
}
