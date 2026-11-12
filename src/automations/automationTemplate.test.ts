import { describe, expect, it } from 'vitest'
import { expandTemplate, type TemplateContext } from './automationTemplate'

const ctx: TemplateContext = {
  today: '2026-11-12',
  now: '2026-11-12T08:30:00',
  vaultPath: '/vault',
  notePath: '/vault/06-tasks/write-report.md',
  noteTitle: 'Write report',
  property: 'status',
  oldValue: 'doing',
  newValue: 'done',
  properties: { owner: 'dave', size: 3 },
}

describe('expandTemplate', () => {
  it('expands the built-in variables', () => {
    expect(expandTemplate('{{today}} {{note.title}} {{note.path}}', ctx)).toBe('2026-11-12 Write report /vault/06-tasks/write-report.md')
    expect(expandTemplate('{{note.filename}} {{note.relpath}}', ctx)).toBe('write-report.md 06-tasks/write-report.md')
    expect(expandTemplate('{{old}}->{{new}} {{now}}', ctx)).toBe('doing->done 2026-11-12T08:30:00')
  })

  it('expands note properties case-insensitively', () => {
    expect(expandTemplate('{{prop.Owner}} {{prop.size}}', ctx)).toBe('dave 3')
  })

  it('expands today with a format', () => {
    expect(expandTemplate('{{today:YYYY/MM/DD}}', ctx)).toBe('2026/11/12')
    expect(expandTemplate('{{today:DD.MM.YY}}', ctx)).toBe('12.11.26')
  })

  it('leaves text without variables untouched, and tolerates spaces', () => {
    expect(expandTemplate('plain', ctx)).toBe('plain')
    expect(expandTemplate('{{ today }}', ctx)).toBe('2026-11-12')
  })

  it('fails on an unknown variable or a missing property instead of writing the literal text', () => {
    expect(() => expandTemplate('{{nope}}', ctx)).toThrow('Unknown automation variable: nope')
    expect(() => expandTemplate('{{prop.missing}}', ctx)).toThrow('Unknown automation variable: prop.missing')
  })

  it('renders an absent old or new value as an empty string', () => {
    expect(expandTemplate('[{{old}}]', { ...ctx, oldValue: null })).toBe('[]')
  })
})
