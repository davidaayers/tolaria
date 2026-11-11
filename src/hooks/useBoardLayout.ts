import { useCallback, useMemo, useState } from 'react'
import { collectionFromSelection } from '../collections/collectionFromSelection'
import type { BoardCollectionPresentationConfig } from '../collections/collectionTypes'
import { resolveCollectionEntries } from '../collections/resolveCollectionEntries'
import type { SidebarSelection, VaultEntry, ViewFile } from '../types'

export interface BoardLayout {
  presentation: BoardCollectionPresentationConfig
  viewSort: string | null
  /** The board's own saved View, so its columns never take colour from it. */
  view: ViewFile | null
  /** Notes that passed the saved View's filter. */
  entries: VaultEntry[]
}

interface UseBoardLayoutOptions {
  selection: SidebarSelection
  views: ViewFile[]
  entries: VaultEntry[]
}

/**
 * Decides whether the selected saved View renders as a board (ADR-0301). "Open in editor" shows the
 * View as a list for that exact selection; selecting any View again (even this one) creates a new
 * selection, so the board comes back.
 */
export function useBoardLayout({ selection, views, entries }: UseBoardLayoutOptions) {
  const [listSelection, setListSelection] = useState<SidebarSelection | null>(null)
  const collection = useMemo(() => collectionFromSelection(selection, { views }), [selection, views])
  const presentation = collection.presentation

  const isBoardView = presentation.type === 'board'
  const isListOverride = isBoardView && listSelection === selection
  const board = useMemo<BoardLayout | null>(() => {
    if (!isBoardView || isListOverride || presentation.type !== 'board') return null
    return {
      presentation,
      viewSort: collection.view?.definition.sort ?? null,
      view: collection.view ?? null,
      entries: resolveCollectionEntries(collection, entries, { views }).entries,
    }
  }, [collection, entries, isBoardView, isListOverride, presentation, views])

  const showInList = useCallback(() => setListSelection(selection), [selection])
  const showBoard = useCallback(() => setListSelection(null), [])
  return { board, isListOverride, showInList, showBoard }
}
