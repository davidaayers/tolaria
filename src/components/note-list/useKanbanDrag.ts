import { useCallback, useEffect, useState } from 'react'
import {
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { VaultEntry } from '../../types'
import { type ColumnValue, columnFromId, isCardId } from './kanbanModel'

const DROP_HIGHLIGHT_MS = 420
const KEYBOARD_CODES = { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] }

export type KanbanActiveItem = { kind: 'card'; entry: VaultEntry; origin: ColumnValue } | { kind: 'column'; group: ColumnValue } | null

interface KanbanDragOptions {
  /** Called for a card dropped on a column; returns false when the drop is refused. */
  onCardDrop: (entry: VaultEntry, origin: ColumnValue, target: ColumnValue) => boolean
  onColumnMove: (from: ColumnValue, to: ColumnValue) => void
}

/** Prefer the column under the pointer; fall back to the nearest column for keyboard drags. */
export const kanbanCollisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : closestCenter(args)
}

export function useKanbanSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: KEYBOARD_CODES }),
  )
}

function useDroppedHighlight() {
  const [droppedPath, setDroppedPath] = useState<string | null>(null)
  useEffect(() => {
    if (!droppedPath) return
    const timer = window.setTimeout(() => setDroppedPath(null), DROP_HIGHLIGHT_MS)
    return () => window.clearTimeout(timer)
  }, [droppedPath])
  return [droppedPath, setDroppedPath] as const
}

function activeItemFor(event: DragStartEvent): KanbanActiveItem {
  const data = event.active.data.current as { entry?: VaultEntry; column?: ColumnValue } | undefined
  if (isCardId(event.active.id) && data?.entry) return { kind: 'card', entry: data.entry, origin: data.column ?? '' }
  const group = columnFromId(event.active.id)
  return group === undefined ? null : { kind: 'column', group }
}

function isCrossColumnDrop(active: KanbanActiveItem, overGroup: ColumnValue | undefined): boolean {
  if (active?.kind !== 'card' || overGroup === undefined) return false
  return overGroup !== active.origin
}

export function useKanbanDrag({ onCardDrop, onColumnMove }: KanbanDragOptions) {
  const [active, setActive] = useState<KanbanActiveItem>(null)
  const [overGroup, setOverGroup] = useState<ColumnValue | undefined>(undefined)
  const [droppedPath, setDroppedPath] = useDroppedHighlight()
  const reset = useCallback(() => {
    setActive(null)
    setOverGroup(undefined)
  }, [])
  const onDragStart = useCallback((event: DragStartEvent) => setActive(activeItemFor(event)), [])
  const onDragOver = useCallback((event: DragOverEvent) => setOverGroup(columnFromId(event.over?.id)), [])
  const onDragEnd = useCallback((event: DragEndEvent) => {
    const target = columnFromId(event.over?.id)
    reset()
    if (!active || target === undefined) return
    if (active.kind === 'column') return onColumnMove(active.group, target)
    if (onCardDrop(active.entry, active.origin, target)) setDroppedPath(active.entry.path)
  }, [active, onCardDrop, onColumnMove, reset, setDroppedPath])
  return {
    active,
    overGroup,
    droppedPath,
    crossColumnDrop: isCrossColumnDrop(active, overGroup),
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel: reset,
  }
}
