import type { VaultEntry } from '../types'
import { automationMatches, findChange } from './automationMatch'
import { expandTemplate, type TemplateContext } from './automationTemplate'
import type { AutomationAction, AutomationFile, AutomationScalar, NoteChangeEvent } from './automationTypes'

export type AutomationTrust = 'approved' | 'declined' | 'unknown'

export interface CommandRequest {
  argv: string[]
  timeoutSeconds: number
  env: Record<string, string>
}

export interface CommandResult {
  ok: boolean
  /** First non-empty stdout line of a successful run. */
  message: string | null
  error: string | null
}

export interface AutomationDeps {
  vaultPath: string
  today: () => string
  now: () => string
  getEntry: (path: string) => VaultEntry | undefined
  setProperty: (path: string, key: string, value: AutomationScalar) => Promise<void>
  removeProperty: (path: string, key: string) => Promise<void>
  /** Run a program for the approved automation file `filename`. */
  runCommand: (request: CommandRequest, filename: string) => Promise<CommandResult>
  trust: (file: AutomationFile) => AutomationTrust
  /** Ask the user to approve a file; resolves true when approved. Records the answer. */
  askTrust: (file: AutomationFile) => Promise<boolean>
}

export interface AutomationResult {
  name: string
  ok: boolean
  message: string | null
  error: string | null
}

function hasRun(file: AutomationFile): boolean {
  return file.definition.actions.some((action) => action.kind === 'run')
}

async function mayRun(file: AutomationFile, deps: AutomationDeps): Promise<boolean> {
  if (!hasRun(file)) return true
  const trust = deps.trust(file)
  if (trust === 'approved') return true
  if (trust === 'declined') return false
  return deps.askTrust(file)
}

function scalarProperties(entry: VaultEntry | undefined): TemplateContext['properties'] {
  const properties: TemplateContext['properties'] = {}
  for (const [key, value] of Object.entries(entry?.properties ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') properties[key.toLowerCase()] = value
  }
  return properties
}

function templateContext(file: AutomationFile, event: NoteChangeEvent, entry: VaultEntry | undefined, deps: AutomationDeps): TemplateContext {
  const change = findChange(event, file.definition.on.property)
  return {
    today: deps.today(), now: deps.now(), vaultPath: deps.vaultPath,
    notePath: event.path, noteTitle: entry?.title ?? '',
    property: file.definition.on.property,
    oldValue: change?.old ?? null, newValue: change?.new ?? null,
    properties: scalarProperties(entry),
  }
}

function expandValue(value: AutomationScalar, ctx: TemplateContext): AutomationScalar {
  return typeof value === 'string' ? expandTemplate(value, ctx) : value
}

function commandEnvironment(ctx: TemplateContext): Record<string, string> {
  return {
    TOLARIA_VAULT: ctx.vaultPath,
    TOLARIA_NOTE_PATH: ctx.notePath,
    TOLARIA_PROPERTY: ctx.property,
    TOLARIA_OLD: ctx.oldValue === null ? '' : String(ctx.oldValue),
    TOLARIA_NEW: ctx.newValue === null ? '' : String(ctx.newValue),
  }
}

async function runCommandAction(action: Extract<AutomationAction, { kind: 'run' }>, ctx: TemplateContext, deps: AutomationDeps, filename: string): Promise<CommandResult> {
  const argv = action.argv.map((part) => expandTemplate(part, ctx))
  if (!argv[0]?.startsWith('/')) throw new Error(`The first element of run must be an absolute path: ${argv[0] ?? ''}`)
  return deps.runCommand({ argv, timeoutSeconds: action.timeoutSeconds, env: commandEnvironment(ctx) }, filename)
}

interface ActionOutcome {
  error?: string
  message?: string
}

async function runAction(action: AutomationAction, ctx: TemplateContext, deps: AutomationDeps, filename: string): Promise<ActionOutcome> {
  if (action.kind === 'set') {
    for (const [key, value] of Object.entries(action.values)) await deps.setProperty(ctx.notePath, key, expandValue(value, ctx))
    return {}
  }
  if (action.kind === 'remove') {
    for (const key of action.keys) await deps.removeProperty(ctx.notePath, key)
    return {}
  }
  const result = await runCommandAction(action, ctx, deps, filename)
  if (!result.ok) return { error: result.error ?? 'The command failed' }
  return result.message ? { message: result.message } : {}
}

async function runOne(file: AutomationFile, event: NoteChangeEvent, deps: AutomationDeps): Promise<AutomationResult> {
  const name = file.definition.name
  let message: string | null = null
  try {
    const ctx = templateContext(file, event, deps.getEntry(event.path), deps)
    for (const action of file.definition.actions) {
      const outcome = await runAction(action, ctx, deps, file.filename)
      if (outcome.error) return { name, ok: false, message: null, error: outcome.error }
      message = outcome.message ?? message
    }
  } catch (error) {
    return { name, ok: false, message: null, error: error instanceof Error ? error.message : String(error) }
  }
  return { name, ok: true, message, error: null }
}

/** Run every approved automation that matches `event`, in filename order. Declined or unmatched ones leave no result. */
export async function runAutomationsForEvent(files: AutomationFile[], event: NoteChangeEvent, deps: AutomationDeps): Promise<AutomationResult[]> {
  const results: AutomationResult[] = []
  const entry = deps.getEntry(event.path)
  for (const file of [...files].sort((a, b) => a.filename.localeCompare(b.filename))) {
    if (!automationMatches(file.definition, event, entry)) continue
    if (!(await mayRun(file, deps))) continue
    results.push(await runOne(file, event, deps))
  }
  return results
}
