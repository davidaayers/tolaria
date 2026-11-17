import { type SetStateAction, useCallback, useMemo, useState } from 'react'
import type { KanbanViewColumn } from '../../collections/kanbanViewColumns'
import { planViewColumnMove, type ViewColumnMovePlan } from '../../collections/kanbanViewColumnMove'
import type { VaultEntry } from '../../types'
import { settleViewMoves, type ViewPendingMoves } from './kanbanBoardColumns'
import { type ColumnValue, type PendingMoves, type PropertyName, settlePendingMoves, withoutPendingMove } from './kanbanModel'

/** A drop that the vault never confirms (for example a failed write) snaps back after this delay. */
const PENDING_MOVE_TIMEOUT_MS = 5000

type SetPendingMoves = (update: SetStateAction<PendingMoves>) => void

/** Optimistic column for dropped cards until the vault entry reports the written value. */
export function usePendingMoves(entries: VaultEntry[], groupBy: PropertyName) {
  const [state, setState] = useState(() => ({ entries, groupBy, pending: new Map() as PendingMoves }))
  let current = state
  if (state.entries !== entries || state.groupBy !== groupBy) {
    current = { entries, groupBy, pending: settlePendingMoves(state.pending, entries, groupBy) }
    setState(current)
  }
  const setPending = useCallback<SetPendingMoves>((update) => {
    setState((previous) => ({ ...previous, pending: typeof update === 'function' ? update(previous.pending) : update }))
  }, [])
  return [current.pending, setPending] as const
}

/** Drops in group-by mode write one property; the card shows in its new column until the vault confirms it. */
export function useGroupCardMoves(entries: VaultEntry[], groupBy: PropertyName, onMove: (entry: VaultEntry, value: ColumnValue | null) => void) {
  const [pending, setPending] = usePendingMoves(entries, groupBy)
  const onCardDrop = useCallback((entry: VaultEntry, origin: ColumnValue, target: ColumnValue) => {
    if (target === origin) return false
    setPending((current) => new Map(current).set(entry.path, target))
    window.setTimeout(() => setPending((current) => withoutPendingMove(current, entry.path, target)), PENDING_MOVE_TIMEOUT_MS)
    onMove(entry, target || null)
    return true
  }, [onMove, setPending])
  return { pending, onCardDrop }
}

/** Local calendar date, the value a column `stamp` writes. */
export function todayIso(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

interface ViewMovesOptions {
  columns: KanbanViewColumn[]
  onApplyMove: (entry: VaultEntry, plan: ViewColumnMovePlan) => Promise<void>
}

function viewMovePlan(entry: VaultEntry, columns: KanbanViewColumn[], targetKey: string): ViewColumnMovePlan | null {
  const target = columns.find((column) => column.key === targetKey)
  return target ? planViewColumnMove({ entry, columns, target, today: todayIso() }) : null
}

/** Drops in View-column mode write whatever the target View needs, planned from its filter. */
export function useViewCardMoves({ columns, onApplyMove }: ViewMovesOptions) {
  const [state, setState] = useState<{ columns: KanbanViewColumn[]; pending: ViewPendingMoves }>(() => ({ columns, pending: new Map() }))
  let current = state
  if (state.columns !== columns) {
    current = { columns, pending: settleViewMoves(state.pending, columns) }
    setState(current)
  }
  const removePending = useCallback((path: string) => {
    setState((previous) => {
      if (!previous.pending.has(path)) return previous
      const next = new Map(previous.pending)
      next.delete(path)
      return { ...previous, pending: next }
    })
  }, [])
  const canDrop = useCallback((entry: VaultEntry, targetKey: string) => viewMovePlan(entry, columns, targetKey) !== null, [columns])
  const onCardDrop = useCallback((entry: VaultEntry, origin: string, target: string) => {
    if (target === origin) return false
    const plan = viewMovePlan(entry, columns, target)
    if (!plan) return false
    setState((previous) => ({ ...previous, pending: new Map(previous.pending).set(entry.path, { entry, from: origin, to: target }) }))
    window.setTimeout(() => removePending(entry.path), PENDING_MOVE_TIMEOUT_MS)
    onApplyMove(entry, plan).catch(() => removePending(entry.path))
    return true
  }, [columns, onApplyMove, removePending])
  return useMemo(() => ({ pending: current.pending, onCardDrop, canDrop }), [canDrop, current.pending, onCardDrop])
}
