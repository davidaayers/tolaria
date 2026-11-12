import type { AutomationScalar, NoteChangeEvent, PropertyChange } from './automationTypes'

type Scalar = AutomationScalar | null

export interface ChangeBatcher {
  /** Note that `key` of the note at `path` went from `oldValue` to `newValue`. */
  record: (path: string, key: string, oldValue: Scalar, newValue: Scalar) => void
  /** Forget everything not yet emitted. */
  cancel: () => void
}

function unchanged(change: PropertyChange): boolean {
  return change.old === change.new
}

function eventFor(path: string, changes: Map<string, PropertyChange>): NoteChangeEvent | null {
  const real = [...changes.entries()].filter(([, change]) => !unchanged(change))
  return real.length === 0 ? null : { path, changes: Object.fromEntries(real) }
}

/**
 * Merge property writes made close together on one note into a single event, so a board move that
 * writes `status` and `completed` triggers automations once, with each key's first old and last new value.
 */
export function createChangeBatcher(delayMs: number, onFlush: (event: NoteChangeEvent) => void): ChangeBatcher {
  const pending = new Map<string, Map<string, PropertyChange>>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    timer = null
    const batches = [...pending.entries()]
    pending.clear()
    for (const [path, changes] of batches) {
      const event = eventFor(path, changes)
      if (event) onFlush(event)
    }
  }

  return {
    record(path, key, oldValue, newValue) {
      const changes = pending.get(path) ?? new Map<string, PropertyChange>()
      changes.set(key, { old: changes.has(key) ? (changes.get(key)?.old ?? null) : oldValue, new: newValue })
      pending.set(path, changes)
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      pending.clear()
    },
  }
}
