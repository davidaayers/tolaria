import type { VaultEntry } from '../../types'
import { dueUrgency, isDueProperty, propertyValue, scalarText } from './boardCardMeta'

export type BoardDueFilter = 'overdue' | 'week'

/** Session-only narrowing of what a board shows (ADR-0301). Never written to the View. */
export interface BoardFilter {
  text: string
  /** Chosen values per lowercase property name, lowercased. A card needs one of them for each property. */
  values: Record<string, string[]>
  due: BoardDueFilter | null
}

export interface BoardFilterValue {
  /** Lowercase, what the filter matches. */
  value: string
  /** The most common original spelling, for display. */
  label: string
  count: number
}

export interface BoardFilterGroup {
  property: string
  values: BoardFilterValue[]
}

export const EMPTY_BOARD_FILTER: BoardFilter = { text: '', values: {}, due: null }

const DUE_WEEK_DAYS = 7
const MAX_VALUES_PER_PROPERTY = 8

export function isBoardFilterActive(filter: BoardFilter): boolean {
  return filter.text.trim().length > 0 || Object.keys(filter.values).length > 0 || filter.due !== null
}

function shownText(entry: VaultEntry, properties: string[]): string {
  const values = properties.map((name) => scalarText(propertyValue(entry, name)) ?? '')
  return [entry.title, ...values].join('\n').toLowerCase()
}

function matchesText(entry: VaultEntry, text: string, properties: string[]): boolean {
  const words = text.toLowerCase().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return true
  const haystack = shownText(entry, properties)
  return words.every((word) => haystack.includes(word))
}

function matchesValues(entry: VaultEntry, values: BoardFilter['values']): boolean {
  return Object.entries(values).every(([property, chosen]) => {
    const text = scalarText(propertyValue(entry, property))?.toLowerCase()
    return text !== undefined && chosen.includes(text)
  })
}

function matchesDue(entry: VaultEntry, due: BoardDueFilter | null, properties: string[], now: Date): boolean {
  if (due === null) return true
  const name = properties.find(isDueProperty)
  const value = name ? scalarText(propertyValue(entry, name)) : null
  const urgency = value ? dueUrgency(value, now) : null
  if (!urgency) return false
  if (due === 'overdue') return urgency.tone === 'overdue'
  return urgency.tone !== 'overdue' && urgency.count <= DUE_WEEK_DAYS
}

export function entryMatchesBoardFilter(entry: VaultEntry, filter: BoardFilter, properties: string[], now: Date = new Date()): boolean {
  return matchesText(entry, filter.text, properties)
    && matchesValues(entry, filter.values)
    && matchesDue(entry, filter.due, properties, now)
}

/** Add the value to the property's chosen values, or remove it when already chosen. */
export function toggleBoardFilterValue(filter: BoardFilter, property: string, value: string): BoardFilter {
  const key = property.toLowerCase()
  const lower = value.toLowerCase()
  const current = Reflect.get(filter.values, key) as string[] | undefined ?? []
  const next = current.includes(lower) ? current.filter((candidate) => candidate !== lower) : [...current, lower]
  const values = Object.fromEntries(Object.entries(filter.values).filter(([name]) => name !== key))
  return { ...filter, values: next.length > 0 ? { ...values, [key]: next } : values }
}

function tally(entries: VaultEntry[], property: string): BoardFilterValue[] {
  const spellings = new Map<string, Map<string, number>>()
  for (const entry of entries) {
    const text = scalarText(propertyValue(entry, property))
    if (!text) continue
    const forms = spellings.get(text.toLowerCase()) ?? new Map<string, number>()
    forms.set(text, (forms.get(text) ?? 0) + 1)
    spellings.set(text.toLowerCase(), forms)
  }
  return [...spellings].map(([value, forms]) => ({
    value,
    label: [...forms].sort((left, right) => right[1] - left[1])[0][0],
    count: [...forms.values()].reduce((sum, count) => sum + count, 0),
  }))
}

/** The values worth offering as filter chips: shown, non-date properties with at least two distinct values. */
export function boardFilterOptions(entries: VaultEntry[], properties: string[]): BoardFilterGroup[] {
  return properties
    .filter((property) => !isDueProperty(property))
    .map((property) => ({
      property: property.toLowerCase(),
      values: tally(entries, property)
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
        .slice(0, MAX_VALUES_PER_PROPERTY),
    }))
    .filter((group) => group.values.length >= 2)
}
