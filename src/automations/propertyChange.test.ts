import { describe, expect, it } from 'vitest'
import { makeEntry } from '../test-utils/noteListTestUtils'
import { currentPropertyValue, scalarOf } from './propertyChange'

describe('currentPropertyValue', () => {
  const entry = makeEntry({ isA: 'Task', status: 'doing', properties: { Owner: 'dave', size: 3, done: false, tags: ['a', 'b'] } })

  it('reads the built-in status and type fields, whatever the key spelling', () => {
    expect(currentPropertyValue(entry, 'status')).toBe('doing')
    expect(currentPropertyValue(entry, 'Status')).toBe('doing')
    expect(currentPropertyValue(entry, 'type')).toBe('Task')
    expect(currentPropertyValue(entry, 'is_a')).toBe('Task')
  })

  it('reads custom scalar properties case-insensitively', () => {
    expect(currentPropertyValue(entry, 'owner')).toBe('dave')
    expect(currentPropertyValue(entry, 'size')).toBe(3)
    expect(currentPropertyValue(entry, 'done')).toBe(false)
  })

  it('returns null for absent, list and unknown notes', () => {
    expect(currentPropertyValue(entry, 'missing')).toBeNull()
    expect(currentPropertyValue(entry, 'tags')).toBeNull()
    expect(currentPropertyValue(undefined, 'status')).toBeNull()
    expect(currentPropertyValue(makeEntry({ status: null }), 'status')).toBeNull()
  })
})

describe('scalarOf', () => {
  it('keeps text, numbers and booleans and drops everything else', () => {
    expect(scalarOf('a')).toBe('a')
    expect(scalarOf(2)).toBe(2)
    expect(scalarOf(true)).toBe(true)
    expect(scalarOf(['a'])).toBeNull()
    expect(scalarOf(null)).toBeNull()
    expect(scalarOf(undefined)).toBeNull()
  })
})
