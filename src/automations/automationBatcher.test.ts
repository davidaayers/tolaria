import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChangeBatcher } from './automationBatcher'

describe('createChangeBatcher', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('merges writes to one note into one event with the first old and last new value', () => {
    const onFlush = vi.fn()
    const batcher = createChangeBatcher(150, onFlush)
    batcher.record('/v/a.md', 'status', 'doing', 'done')
    vi.advanceTimersByTime(100)
    batcher.record('/v/a.md', 'completed', null, '2026-11-12')
    batcher.record('/v/a.md', 'status', 'done', 'done')
    expect(onFlush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledWith({
      path: '/v/a.md',
      changes: { status: { old: 'doing', new: 'done' }, completed: { old: null, new: '2026-11-12' } },
    })
  })

  it('keeps an absent first old value when the key is written twice', () => {
    const onFlush = vi.fn()
    const batcher = createChangeBatcher(150, onFlush)
    batcher.record('/v/a.md', 'completed', null, '2026-11-11')
    batcher.record('/v/a.md', 'completed', '2026-11-11', '2026-11-12')
    vi.advanceTimersByTime(150)
    expect(onFlush).toHaveBeenCalledWith({ path: '/v/a.md', changes: { completed: { old: null, new: '2026-11-12' } } })
  })

  it('keeps different notes in separate events', () => {
    const onFlush = vi.fn()
    const batcher = createChangeBatcher(150, onFlush)
    batcher.record('/v/a.md', 'status', 'a', 'b')
    batcher.record('/v/b.md', 'status', 'a', 'b')
    vi.advanceTimersByTime(150)
    expect(onFlush.mock.calls.map(([event]) => event.path).sort()).toEqual(['/v/a.md', '/v/b.md'])
  })

  it('does not emit an event when every change returned to its original value', () => {
    const onFlush = vi.fn()
    const batcher = createChangeBatcher(150, onFlush)
    batcher.record('/v/a.md', 'status', 'a', 'b')
    batcher.record('/v/a.md', 'status', 'b', 'a')
    vi.advanceTimersByTime(150)
    expect(onFlush).not.toHaveBeenCalled()
  })

  it('drops pending changes on cancel', () => {
    const onFlush = vi.fn()
    const batcher = createChangeBatcher(150, onFlush)
    batcher.record('/v/a.md', 'status', 'a', 'b')
    batcher.cancel()
    vi.advanceTimersByTime(500)
    expect(onFlush).not.toHaveBeenCalled()
  })
})
