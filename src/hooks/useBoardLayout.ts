import { useCallback, useMemo, useState } from 'react'
import { collectionFromSelection } from '../collections/collectionFromSelection'
import type { BoardCollectionPresentationConfig } from '../collections/collectionTypes'
import { resolveCollectionEntries } from '../collections/resolveCollectionEntries'
import type { SidebarSelection, VaultEntry, ViewFile } from '../types'

export interface BoardLayout {
  presentation: BoardCollectionPresentationConfig
  viewSort: string | null
  /** Notes that passed the saved View's filter. */
  entries: VaultEntry[]
}

interface UseBoardLayoutOptions {
  selection: SidebarSelection
  views: ViewFile[]
  entries: VaultEntry[]
}

/**
 * Decides whether the selected saved View renders as a board (ADR-0301) and
 * remembers a "show as list" choice until the selection changes.
 */
export function useBoardLayout({ selection, views, entries }: UseBoardLayoutOptions) {
  const [listCollectionId, setListCollectionId] = useState<string | null>(null)
  const collection = useMemo(() => collectionFromSelection(selection, { views }), [selection, views])
  const presentation = collection.presentation

  // Reset during render (React's "adjust state on change" pattern): the choice only lasts for this selection.
  if (listCollectionId !== null && listCollectionId !== collection.id) setListCollectionId(null)

  const showBoard = presentation.type === 'board' && collection.id !== listCollectionId
  const board = useMemo<BoardLayout | null>(() => {
    if (!showBoard || presentation.type !== 'board') return null
    return {
      presentation,
      viewSort: collection.view?.definition.sort ?? null,
      entries: resolveCollectionEntries(collection, entries, { views }).entries,
    }
  }, [collection, entries, presentation, showBoard, views])

  const showInList = useCallback(() => setListCollectionId(collection.id), [collection.id])
  return { board, showInList }
}
