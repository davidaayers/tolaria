import type { VaultEntry } from '../types'
import type { AutomationScalar } from './automationTypes'

/** One successful property write, as reported by the frontmatter runner. */
export interface PropertyWrite {
  path: string
  key: string
  old: AutomationScalar | null
  new: AutomationScalar | null
}

export function scalarOf(value: unknown): AutomationScalar | null {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null
}

/** The note's current scalar value for a frontmatter key; list and absent values are `null`. */
export function currentPropertyValue(entry: VaultEntry | undefined, key: string): AutomationScalar | null {
  if (!entry) return null
  const lower = key.trim().toLowerCase()
  if (lower === 'status') return entry.status
  if (lower === 'type' || lower === 'is_a' || lower === 'isa') return entry.isA
  const match = Object.entries(entry.properties ?? {}).find(([candidate]) => candidate.toLowerCase() === lower)
  return match ? scalarOf(match[1]) : null
}
