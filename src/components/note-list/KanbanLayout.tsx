import './KanbanLayout.css'
import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, type DropAnimation, defaultDropAnimationSideEffects } from '@dnd-kit/core'
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import type { CollectionLayoutRendererProps } from '../../collections/layoutRegistry'
import { planViewColumnCreate } from '../../collections/kanbanViewColumnCreate'
import { buildViewColumns } from '../../collections/kanbanViewColumns'
import { type AppLocale, translate } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import { KanbanCardFace, type KanbanCardContext } from './KanbanCard'
import { KanbanColumn, KanbanColumnHeader } from './KanbanColumn'
import { groupBoardColumns, type KanbanBoardColumn, viewBoardColumns } from './kanbanBoardColumns'
import { columnId, moveColumn } from './kanbanModel'
import { type KanbanActiveItem, kanbanCollisionDetection, useKanbanDrag, useKanbanSensors } from './useKanbanDrag'
import { todayIso, useGroupCardMoves, useViewCardMoves } from './useKanbanMoves'

type KanbanLayoutProps = Omit<CollectionLayoutRendererProps, 'listContent'>

const SETTLE_DROP_ANIMATION: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    className: { dragOverlay: 'kanban-overlay--dropping' },
    styles: { active: { opacity: '0' } },
  }),
}

function KanbanDragPreview({ active, context, locale, columns }: { active: KanbanActiveItem; context: KanbanCardContext; locale: AppLocale; columns: KanbanBoardColumn[] }) {
  if (active?.kind === 'card') {
    return <div className="kanban-drag-lift"><KanbanCardFace entry={active.entry} context={context} className="kanban-card--lifted" /></div>
  }
  const column = active?.kind === 'column' ? columns.find((candidate) => candidate.key === active.group) : undefined
  if (!column) return null
  return (
    <div className="kanban-drag-lift flex h-10 w-[272px] items-center rounded-xl bg-muted px-3 shadow-lg">
      <KanbanColumnHeader {...column} locale={locale} />
    </div>
  )
}

interface KanbanBoardProps extends Omit<KanbanLayoutProps, 'columns'> {
  boardColumns: KanbanBoardColumn[]
  label: string
  onCardDrop: (entry: VaultEntry, origin: string, target: string) => boolean
  onColumnMove: (from: string, to: string) => void
  /** Whether a dragged card may land in a column; absent means every column accepts it. */
  canDrop?: (entry: VaultEntry, target: string) => boolean
  /** Column whose new-card title field is open, and how to open or close it. */
  composingKey?: string | null
  onComposeChange?: (key: string | null) => void
  onCreateInColumn?: (key: string, title: string) => void
}

function KanbanBoard({ boardColumns, label, onCardDrop, onColumnMove, canDrop, composingKey, onComposeChange, onCreateInColumn, ...props }: KanbanBoardProps) {
  const { allEntries, properties, onOpen, locale, typeEntryMap, displayPropsOverride, selectedNotePath } = props
  const sensors = useKanbanSensors()
  const drag = useKanbanDrag({ onCardDrop, onColumnMove })
  const context = useMemo<KanbanCardContext>(
    () => ({ cardProperties: properties, allEntries, typeEntryMap, displayPropsOverride, cardRole: translate(locale, 'layout.cardRole'), locale, onOpen }),
    [allEntries, displayPropsOverride, locale, onOpen, properties, typeEntryMap],
  )
  const draggedCard = drag.active?.kind === 'card' ? drag.active : null
  const accepts = (target: string) => !draggedCard || !canDrop || target === draggedCard.origin || canDrop(draggedCard.entry, target)
  const cardTarget = drag.crossColumnDrop && drag.overGroup !== undefined && accepts(drag.overGroup) ? drag.overGroup : undefined

  return (
    <DndContext sensors={sensors} collisionDetection={kanbanCollisionDetection} onDragStart={drag.onDragStart} onDragOver={drag.onDragOver} onDragEnd={drag.onDragEnd} onDragCancel={drag.onDragCancel}>
      <section className="kanban-scroll flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden p-3" data-testid="kanban-board" aria-label={label}>
        <SortableContext items={boardColumns.map((column) => columnId(column.key))} strategy={horizontalListSortingStrategy}>
          {boardColumns.map((column) => (
            <KanbanColumn
              key={column.key || '__empty'}
              column={column}
              context={context}
              locale={locale}
              selectedNotePath={selectedNotePath}
              droppedPath={drag.droppedPath}
              isCardTarget={cardTarget === column.key}
              isCardRefused={!accepts(column.key)}
              composing={composingKey === column.key}
              onStartCompose={() => onComposeChange?.(column.key)}
              onCancelCompose={() => onComposeChange?.(null)}
              onCreateCard={(title) => { onCreateInColumn?.(column.key, title); onComposeChange?.(null) }}
            />
          ))}
        </SortableContext>
      </section>
      {createPortal(
        <DragOverlay dropAnimation={drag.crossColumnDrop ? null : SETTLE_DROP_ANIMATION} zIndex={12000}>
          <KanbanDragPreview active={drag.active} context={context} locale={locale} columns={boardColumns} />
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  )
}

function GroupBoard(props: KanbanLayoutProps) {
  const { entries, groupBy, columnOrder, onColumnOrderChange, onMove, locale } = props
  const { pending, onCardDrop } = useGroupCardMoves(entries, groupBy, onMove)
  const columns = useMemo(() => groupBoardColumns(entries, groupBy, pending, columnOrder, locale), [columnOrder, entries, groupBy, locale, pending])
  const onColumnMove = useCallback(
    (from: string, to: string) => onColumnOrderChange(moveColumn(columns.map((column) => column.key), from, to)),
    [columns, onColumnOrderChange],
  )
  return <KanbanBoard {...props} boardColumns={columns} label={translate(locale, 'layout.boardLabel', { property: groupBy })} onCardDrop={onCardDrop} onColumnMove={onColumnMove} />
}

const NO_VIEWS: NonNullable<KanbanLayoutProps['views']> = []

const refuseMove = () => Promise.resolve()

function ViewColumnsBoard(props: KanbanLayoutProps) {
  const { columns: configs = [], views = NO_VIEWS, boardView = null, onColumnsChange, onApplyMove = refuseMove, onCreateCard, locale } = props
  const [composingKey, setComposingKey] = useState<string | null>(null)
  const pool = useMemo(() => props.allEntries.filter((entry) => !entry.archived), [props.allEntries])
  const built = useMemo(() => buildViewColumns(pool, configs, views, boardView), [boardView, configs, pool, views])
  const { pending, onCardDrop, canDrop } = useViewCardMoves({ columns: built, onApplyMove })
  const creatable = useMemo(() => {
    if (!onCreateCard) return new Set<string>()
    const today = todayIso()
    return new Set(built.filter((target) => planViewColumnCreate({ target, boardView: null, today })).map((column) => column.key))
  }, [built, onCreateCard])
  const columns = useMemo(() => viewBoardColumns(built, pending, locale, creatable), [built, creatable, locale, pending])
  const onCreateInColumn = useCallback((key: string, title: string) => {
    const target = built.find((column) => column.key === key)
    const plan = target && planViewColumnCreate({ target, boardView: null, today: todayIso() })
    if (plan) onCreateCard?.(title, plan)
  }, [built, onCreateCard])
  const onColumnMove = useCallback((from: string, to: string) => {
    const order = moveColumn(configs.map((column) => column.view), from, to)
    onColumnsChange?.(order.flatMap((view) => configs.filter((column) => column.view === view)))
  }, [configs, onColumnsChange])
  return (
    <KanbanBoard
      {...props}
      boardColumns={columns}
      label={translate(locale, 'layout.boardLabelViews')}
      onCardDrop={onCardDrop}
      onColumnMove={onColumnMove}
      canDrop={canDrop}
      composingKey={composingKey}
      onComposeChange={setComposingKey}
      onCreateInColumn={onCreateInColumn}
    />
  )
}

export function KanbanLayout(props: KanbanLayoutProps) {
  return props.columns && props.columns.length > 0 ? <ViewColumnsBoard {...props} /> : <GroupBoard {...props} />
}
