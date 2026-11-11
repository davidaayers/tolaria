import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeEntry } from '../test-utils/noteListTestUtils'
import type { SidebarSelection, VaultEntry, ViewFile } from '../types'
import { useBoardLayout } from './useBoardLayout'

function view(filename: string, presentation?: unknown, filters: ViewFile['definition']['filters'] = { all: [] }): ViewFile {
  return { filename, definition: { name: filename, icon: null, color: null, sort: 'title:asc', filters, presentation } }
}

const BOARD = { type: 'board', groupBy: 'Stage' }
const select = (filename: string): SidebarSelection => ({ kind: 'view', filename })
const entries: VaultEntry[] = [
  makeEntry({ path: '/v/a.md', title: 'a', isA: 'Task' }),
  makeEntry({ path: '/v/b.md', title: 'b', isA: 'Note' }),
]

function renderLayout(initial: { selection: SidebarSelection; views: ViewFile[] }) {
  return renderHook((props) => useBoardLayout({ ...props, entries }), { initialProps: initial })
}

describe('useBoardLayout', () => {
  it('returns no board for built-in selections and for list Views', () => {
    const views = [view('list.yml'), view('board.yml', BOARD)]
    expect(renderLayout({ selection: { kind: 'filter', filter: 'all' }, views }).result.current.board).toBeNull()
    expect(renderLayout({ selection: select('list.yml'), views }).result.current.board).toBeNull()
    expect(renderLayout({ selection: select('missing.yml'), views }).result.current.board).toBeNull()
  })

  it('returns the board config, view sort and only the entries that pass the View filter', () => {
    const filters = { all: [{ field: 'type', op: 'equals' as const, value: 'Task' }] }
    const { result } = renderLayout({ selection: select('board.yml'), views: [view('board.yml', BOARD, filters)] })
    expect(result.current.board?.presentation).toMatchObject({ type: 'board', groupBy: 'Stage' })
    expect(result.current.board?.viewSort).toBe('title:asc')
    expect(result.current.board?.view?.filename).toBe('board.yml')
    expect(result.current.board?.entries.map((entry) => entry.title)).toEqual(['a'])
  })

  it('falls back to the list for an invalid board block', () => {
    const { result } = renderLayout({ selection: select('board.yml'), views: [view('board.yml', { type: 'board' })] })
    expect(result.current.board).toBeNull()
  })

  it('shows the View as a list after showInList, and shows the board again when the View is reselected', () => {
    const views = [view('board.yml', BOARD), view('other.yml', BOARD)]
    const { result, rerender } = renderLayout({ selection: select('board.yml'), views })
    act(() => result.current.showInList())
    expect(result.current.board).toBeNull()

    rerender({ selection: select('other.yml'), views })
    expect(result.current.board).not.toBeNull()

    rerender({ selection: select('board.yml'), views })
    expect(result.current.board).not.toBeNull()
  })
})
