import type { VaultEntry } from '../types'
import { evaluateView } from '../utils/viewFilters'
import type { AutomationDefinition, AutomationScalar, NoteChangeEvent } from './automationTypes'

const TYPE_ALIASES = new Set(['type', 'isa', 'is_a'])

function propertyKey(key: string): string {
  const lower = key.trim().toLowerCase()
  return TYPE_ALIASES.has(lower) ? 'type' : lower
}

function sameValue(a: AutomationScalar | null, b: AutomationScalar | null): boolean {
  if (a === null || b === null) return a === b
  return String(a).toLowerCase() === String(b).toLowerCase()
}

function valueAllowed(allowed: Array<AutomationScalar | null>, value: AutomationScalar | null): boolean {
  return allowed.length === 0 || allowed.some((candidate) => sameValue(candidate, value))
}

export function findChange(event: NoteChangeEvent, property: string) {
  const wanted = propertyKey(property)
  const key = Object.keys(event.changes).find((candidate) => propertyKey(candidate) === wanted)
  return key === undefined ? null : event.changes[key]
}

function entryPassesFilter(definition: AutomationDefinition, entry: VaultEntry | undefined): boolean {
  if (!definition.when) return true
  if (!entry) return false
  const view = { name: definition.name, icon: null, color: null, sort: null, filters: definition.when }
  return evaluateView(view, [entry]).length === 1
}

/** True when `event` is a real change of the automation's property, with the wanted values, on a note its filter accepts. */
export function automationMatches(definition: AutomationDefinition, event: NoteChangeEvent, entry: VaultEntry | undefined): boolean {
  const change = findChange(event, definition.on.property)
  if (!change || sameValue(change.old, change.new)) return false
  return valueAllowed(definition.on.to, change.new)
    && valueAllowed(definition.on.from, change.old)
    && entryPassesFilter(definition, entry)
}
