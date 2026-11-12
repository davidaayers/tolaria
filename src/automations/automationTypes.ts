import type { FilterGroup } from '../types'

export type AutomationScalar = string | number | boolean

export interface AutomationTrigger {
  property: string
  /** New value must be one of these; empty means any. `null` matches an absent value. */
  to: Array<AutomationScalar | null>
  /** Old value must be one of these; empty means any. `null` matches an absent value. */
  from: Array<AutomationScalar | null>
}

export type AutomationAction =
  | { kind: 'set'; values: Record<string, AutomationScalar> }
  | { kind: 'remove'; keys: string[] }
  | { kind: 'run'; argv: string[]; timeoutSeconds: number }

export interface AutomationDefinition {
  name: string
  on: AutomationTrigger
  when: FilterGroup | null
  actions: AutomationAction[]
}

/** One `automations/*.yml` file as read by the backend. */
export interface AutomationFile {
  filename: string
  /** SHA-256 of the file content; trust is recorded against it. */
  hash: string
  definition: AutomationDefinition
}

export interface PropertyChange {
  old: AutomationScalar | null
  new: AutomationScalar | null
}

/** What one user action did to one note, after merging writes made close together. */
export interface NoteChangeEvent {
  path: string
  changes: Record<string, PropertyChange>
}
