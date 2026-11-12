import type { AutomationScalar } from './automationTypes'

export interface TemplateContext {
  /** ISO date, YYYY-MM-DD. */
  today: string
  /** ISO local date-time. */
  now: string
  vaultPath: string
  notePath: string
  noteTitle: string
  property: string
  oldValue: AutomationScalar | null
  newValue: AutomationScalar | null
  /** The changed note's properties, keyed by lowercase name. */
  properties: Record<string, AutomationScalar | null | undefined>
}

const VARIABLE = /\{\{\s*([^{}]*?)\s*\}\}/g

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function relativePath(vaultPath: string, notePath: string): string {
  const root = vaultPath.endsWith('/') ? vaultPath : `${vaultPath}/`
  return notePath.startsWith(root) ? notePath.slice(root.length) : notePath
}

function formatToday(today: string, format: string): string {
  const [year, month, day] = today.split('-')
  return format.replace('YYYY', year).replace('YY', year.slice(2)).replace('MM', month).replace('DD', day)
}

function text(value: AutomationScalar | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value)
}

function resolveVariable(name: string, ctx: TemplateContext): string | null {
  if (name === 'today') return ctx.today
  if (name.startsWith('today:')) return formatToday(ctx.today, name.slice('today:'.length))
  if (name === 'now') return ctx.now
  if (name === 'note.title') return ctx.noteTitle
  if (name === 'note.path') return ctx.notePath
  if (name === 'note.filename') return lastSegment(ctx.notePath)
  if (name === 'note.relpath') return relativePath(ctx.vaultPath, ctx.notePath)
  if (name === 'old') return text(ctx.oldValue) ?? ''
  if (name === 'new') return text(ctx.newValue) ?? ''
  if (name.startsWith('prop.')) return text(ctx.properties[name.slice('prop.'.length).toLowerCase()])
  return null
}

/** Expand `{{variables}}` in one string. An unknown variable throws rather than leaking the literal text into a note or command. */
export function expandTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(VARIABLE, (_match, name: string) => {
    const value = resolveVariable(name, ctx)
    if (value === null) throw new Error(`Unknown automation variable: ${name}`)
    return value
  })
}
