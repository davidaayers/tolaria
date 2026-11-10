import type { TranslationKey } from '../../lib/i18n'

const DUE_PROPERTY_PATTERN = /^(due|deadline)\b|\b(due|deadline)$/i
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/
const SOON_DAYS = 3
const MS_PER_DAY = 86_400_000

export const BOARD_ACCENTS = ['blue', 'green', 'orange', 'purple', 'teal', 'pink', 'yellow'] as const
export type BoardAccent = typeof BOARD_ACCENTS[number]

export interface DueUrgency {
  tone: 'overdue' | 'soon' | 'later'
  /** Translation key for overdue/soon labels; null means show the formatted date. */
  key: Extract<TranslationKey, 'board.due.overdue' | 'board.due.today' | 'board.due.tomorrow' | 'board.due.inDays'> | null
  /** Whole days: overdue by, or until due. */
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

/** Classify an ISO due date against the local calendar day. Null when the value is not a date. */
export function dueUrgency(value: string, now: Date = new Date()): DueUrgency | null {
  const due = parseIsoDay(value)
  if (due === null) return null
  const days = due - localDayNumber(now.getFullYear(), now.getMonth(), now.getDate())
  if (days < 0) return { tone: 'overdue', key: 'board.due.overdue', count: -days }
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
