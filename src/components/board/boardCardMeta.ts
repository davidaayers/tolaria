import type { TranslationKey } from '../../lib/i18n'
import type { VaultEntry, VaultPropertyValue } from '../../types'

const DUE_PROPERTY_PATTERN = /^(due|deadline)\b|\b(due|deadline)$/i
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/
const SOON_DAYS = 3
const OVERDUE_DAYS_LIMIT = 30
const OVERDUE_WEEKS_LIMIT = 90
const DAYS_PER_WEEK = 7
const DAYS_PER_MONTH = 30
const MS_PER_DAY = 86_400_000

export const BOARD_ACCENTS = ['blue', 'green', 'orange', 'purple', 'teal', 'pink', 'yellow'] as const
export type BoardAccent = typeof BOARD_ACCENTS[number]

export interface DueUrgency {
  tone: 'overdue' | 'soon' | 'later'
  /** Translation key for overdue/soon labels; null means show the formatted date. */
  key: Extract<TranslationKey, 'board.due.overdue' | 'board.due.overdueWeeks' | 'board.due.overdueMonths' | 'board.due.today' | 'board.due.tomorrow' | 'board.due.inDays'> | null
  /** Overdue by or until due, in the unit the key names (days unless the key says weeks or months). */
  count: number
}

export function isDueProperty(name: string): boolean {
  return DUE_PROPERTY_PATTERN.test(name.trim())
}

function localDayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month, day) / MS_PER_DAY)
}

function parseIsoDay(value: string): number | null {
  const match = ISO_DATE_PATTERN.exec(value.trim())
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const check = new Date(Date.UTC(year, month, day))
  const valid = check.getUTCFullYear() === year && check.getUTCMonth() === month && check.getUTCDate() === day
  return valid ? localDayNumber(year, month, day) : null
}

function soonKey(days: number): NonNullable<DueUrgency['key']> {
  if (days === 0) return 'board.due.today'
  return days === 1 ? 'board.due.tomorrow' : 'board.due.inDays'
}

function overdueUrgency(daysLate: number): DueUrgency {
  if (daysLate <= OVERDUE_DAYS_LIMIT) return { tone: 'overdue', key: 'board.due.overdue', count: daysLate }
  if (daysLate < OVERDUE_WEEKS_LIMIT) {
    return { tone: 'overdue', key: 'board.due.overdueWeeks', count: Math.floor(daysLate / DAYS_PER_WEEK) }
  }
  return { tone: 'overdue', key: 'board.due.overdueMonths', count: Math.floor(daysLate / DAYS_PER_MONTH) }
}

/** Classify an ISO due date against the local calendar day. Null when the value is not a date. */
export function dueUrgency(value: string, now: Date = new Date()): DueUrgency | null {
  const due = parseIsoDay(value)
  if (due === null) return null
  const days = due - localDayNumber(now.getFullYear(), now.getMonth(), now.getDate())
  if (days < 0) return overdueUrgency(-days)
  if (days <= SOON_DAYS) return { tone: 'soon', key: soonKey(days), count: days }
  return { tone: 'later', key: null, count: days }
}

/** A stable accent per distinct value, so equal values always share a colour. */
export function accentForValue(value: string): BoardAccent {
  const text = value.trim().toLowerCase()
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return BOARD_ACCENTS[hash % BOARD_ACCENTS.length]
}

const DOMINANT_MIN_CARDS = 3
const DOMINANT_SHARE = 0.6

export function scalarText(value: VaultPropertyValue | undefined): string | null {
  if (value === undefined || value === null || Array.isArray(value)) return null
  const text = String(value).trim()
  return text.length > 0 ? text : null
}

export function propertyValue(entry: VaultEntry, name: string): VaultPropertyValue | undefined {
  const key = Object.keys(entry.properties).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
  return key === undefined ? undefined : (Reflect.get(entry.properties, key) as VaultPropertyValue)
}

function mostCommon(counts: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry
  return best
}

/**
 * For each displayed property, the value most cards in a column share. Showing it on every card adds
 * noise, so cards hide that chip and only the odd ones out keep theirs. Keys are lowercase property names.
 */
export function dominantChipValues(entries: VaultEntry[], properties: string[]): Map<string, string> {
  const result = new Map<string, string>()
  if (entries.length < DOMINANT_MIN_CARDS) return result
  for (const name of properties.filter((property) => !isDueProperty(property))) {
    const counts = new Map<string, number>()
    for (const entry of entries) {
      const text = scalarText(propertyValue(entry, name))?.toLowerCase()
      if (text) counts.set(text, (counts.get(text) ?? 0) + 1)
    }
    const top = mostCommon(counts)
    if (top && top[1] / entries.length >= DOMINANT_SHARE) result.set(name.toLowerCase(), top[0])
  }
  return result
}
