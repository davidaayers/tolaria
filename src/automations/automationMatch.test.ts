import { describe, expect, it } from 'vitest'
import { makeEntry } from '../test-utils/noteListTestUtils'
import type { AutomationDefinition, NoteChangeEvent } from './automationTypes'
import { automationMatches } from './automationMatch'

const def = (on: Partial<AutomationDefinition['on']> = {}, when: AutomationDefinition['when'] = null): AutomationDefinition => ({
  name: 'x', on: { property: 'status', to: [], from: [], ...on }, when, actions: [],
})
const event = (key: string, oldValue: string | null, newValue: string | null): NoteChangeEvent => ({ path: '/v/a.md', changes: { [key]: { old: oldValue, new: newValue } } })
const task = makeEntry({ path: '/v/a.md', isA: 'Task', status: 'done' })

describe('automationMatches', () => {
  it('matches a change of the watched property, ignoring key case', () => {
    expect(automationMatches(def(), event('Status', 'doing', 'done'), task)).toBe(true)
    expect(automationMatches(def({ property: 'Owner' }), event('status', 'a', 'b'), task)).toBe(false)
  })

  it('treats is_a, isA and type as the same property', () => {
    expect(automationMatches(def({ property: 'type' }), event('is_a', 'Note', 'Task'), task)).toBe(true)
    expect(automationMatches(def({ property: 'isA' }), event('type', 'Note', 'Task'), task)).toBe(true)
  })

  it('requires the value to have changed', () => {
    expect(automationMatches(def(), event('status', 'done', 'done'), task)).toBe(false)
  })

  it('filters on the new and old value, case-insensitively, with null for absent', () => {
    expect(automationMatches(def({ to: ['Done'] }), event('status', 'doing', 'done'), task)).toBe(true)
    expect(automationMatches(def({ to: ['done'] }), event('status', 'doing', 'waiting'), task)).toBe(false)
    expect(automationMatches(def({ from: ['doing', 'waiting'] }), event('status', 'waiting', 'done'), task)).toBe(true)
    expect(automationMatches(def({ from: ['doing'] }), event('status', 'waiting', 'done'), task)).toBe(false)
    expect(automationMatches(def({ from: [null] }), event('status', null, 'done'), task)).toBe(true)
    expect(automationMatches(def({ from: [null] }), event('status', 'doing', 'done'), task)).toBe(false)
  })

  it('applies the View filter to the note as it is after the change', () => {
    const onlyTasks = { all: [{ field: 'type', op: 'equals' as const, value: 'Task' }] }
    expect(automationMatches(def({}, onlyTasks), event('status', 'a', 'b'), task)).toBe(true)
    expect(automationMatches(def({}, onlyTasks), event('status', 'a', 'b'), makeEntry({ path: '/v/a.md', isA: 'Note' }))).toBe(false)
  })

  it('does not match when the note is unknown and a filter is set', () => {
    const onlyTasks = { all: [{ field: 'type', op: 'equals' as const, value: 'Task' }] }
    expect(automationMatches(def({}, onlyTasks), event('status', 'a', 'b'), undefined)).toBe(false)
    expect(automationMatches(def(), event('status', 'a', 'b'), undefined)).toBe(true)
  })
})
