import { useState } from 'react'
import type { MouseEvent } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { BoardCard, BoardColumn } from '../../collections/boardColumns'
import { translate, type AppLocale } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import { Button } from '@/components/ui/button'
import { resolveNoteIcon } from '../../utils/noteIcon'
import { BOARD_ACCENTS, dominantChipValues } from './boardCardMeta'
import { BoardCardChips } from './BoardCardChips'

export interface BoardViewProps {
  columns: BoardColumn[]
  /** Property names shown as chips on each card. */
  properties: string[]
  allEntries: VaultEntry[]
  typeEntryMap: Record<string, VaultEntry>
  selectedPath: string | null
  locale: AppLocale
  /** Configured chip colours by lowercase value. */
  colors?: Record<string, string>
  onSelectCard: (entry: VaultEntry) => void
  /** Drop a dragged card on a column. Dragging is off unless this and `getMovableKeys` are set. */
  onMoveCard?: (entry: VaultEntry, columnKey: string) => void
  /** Keys of the columns this note can be moved into; other columns refuse the drop. */
  getMovableKeys?: (entry: VaultEntry) => Set<string>
}

/** How a column responds while a card is being dragged. */
type DropState = 'allowed' | 'blocked' | undefined

type Translate = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => string

interface CardProps {
  locale: AppLocale
  colors?: Record<string, string>
  hiddenValues?: Map<string, string>
  card: BoardCard
  selected: boolean
  properties: string[]
  allEntries: VaultEntry[]
  typeEntryMap: Record<string, VaultEntry>
  draggable: boolean
  onSelect: (entry: VaultEntry) => void
}

function BoardCardButton({ card, selected, properties, allEntries, typeEntryMap, locale, hiddenValues, colors, draggable, onSelect }: CardProps) {
  const { entry } = card
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: entry.path, disabled: !draggable })
  const openChipTarget = (target: VaultEntry, event: MouseEvent) => {
    event.stopPropagation()
    onSelect(target)
  }
  return (
    <Button
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      ref={setNodeRef}
      type="button"
      variant="outline"
      aria-pressed={selected}
      data-testid={`board-card-${entry.path}`}
      className={`h-auto w-full flex-col items-start gap-1.5 whitespace-normal px-3 py-2 text-left font-normal data-[selected=true]:border-primary ${draggable ? 'cursor-grab touch-none' : ''} ${isDragging ? 'opacity-40' : ''}`}
      data-selected={selected}
      onClick={() => onSelect(entry)}
    >
      <span className="line-clamp-2 w-full break-words text-sm font-medium text-foreground">{entry.title}</span>
      {properties.length > 0 && (
        <BoardCardChips
          entry={entry}
          properties={properties}
          allEntries={allEntries}
          typeEntryMap={typeEntryMap}
          locale={locale}
          hiddenValues={hiddenValues}
          colors={colors}
          onOpenNote={openChipTarget}
        />
      )}
    </Button>
  )
}

function columnCount(column: BoardColumn, t: Translate): string {
  if (column.wipLimit === null) return String(column.cards.length)
  return t('board.column.limit', { count: column.cards.length, limit: column.wipLimit })
}

function columnAccent(column: BoardColumn, index: number): string {
  if (column.color) return `var(--accent-${column.color})`
  if (column.isOther) return 'var(--muted-foreground)'
  return `var(--accent-${BOARD_ACCENTS[index % BOARD_ACCENTS.length]})`
}

function ColumnIcon({ column, index }: { column: BoardColumn; index: number }) {
  const icon = resolveNoteIcon(column.icon)
  if (icon.kind === 'emoji') {
    return <span aria-hidden="true" data-testid={`board-column-icon-${column.key}`} className="shrink-0 text-sm leading-none">{icon.value}</span>
  }
  if (icon.kind === 'phosphor') {
    return (
      <span
        aria-hidden="true"
        data-testid={`board-column-icon-${column.key}`}
        className="shrink-0 text-muted-foreground"
        style={column.color ? { color: columnAccent(column, index) } : undefined}
      >
        <icon.Icon width={14} height={14} />
      </span>
    )
  }
  if (icon.kind === 'image') {
    return <img src={icon.src} alt="" aria-hidden="true" data-testid={`board-column-icon-${column.key}`} className="size-3.5 shrink-0 rounded-sm object-cover" />
  }
  return <span aria-hidden="true" data-testid={`board-column-dot-${column.key}`} className="size-2 shrink-0 rounded-full" style={{ backgroundColor: columnAccent(column, index) }} />
}

function ColumnHeader({ column, label, index, t }: { column: BoardColumn; label: string; index: number; t: Translate }) {
  const countClassName = column.overLimit
    ? 'bg-[var(--accent-red-light)] text-[var(--accent-red)]'
    : 'bg-muted text-muted-foreground'
  return (
    <header className="flex items-center justify-between gap-2 px-1">
      <ColumnIcon column={column} index={index} />
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{label}</h3>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${countClassName}`}
        title={column.overLimit ? t('board.column.wipLimit', { limit: column.wipLimit ?? 0 }) : undefined}
      >
        {columnCount(column, t)}
      </span>
    </header>
  )
}

function ColumnNotes({ column, expanded, onToggle, t, cardProps }: {
  column: BoardColumn
  expanded: boolean
  onToggle: () => void
  t: Translate
  cardProps: Omit<CardProps, 'card' | 'selected'> & { selectedPath: string | null }
}) {
  const { selectedPath, ...shared } = cardProps
  const shown = expanded ? column.cards : column.visibleCards
  const hiddenValues = dominantChipValues(column.cards.map((card) => card.entry), shared.properties)
  return (
    <div data-testid={`board-column-${column.key}-notes`} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]">
      {column.missing && <p className="px-1 text-xs text-muted-foreground">{t('board.column.missing')}</p>}
      {column.cards.length === 0 && !column.missing && (
        <p className="px-1 text-xs text-muted-foreground">{t('board.column.empty')}</p>
      )}
      <div className="flex flex-col gap-2">
        {shown.map((card) => (
          <BoardCardButton key={card.entry.path} card={card} selected={card.entry.path === selectedPath} hiddenValues={hiddenValues} {...shared} />
        ))}
      </div>
      {column.hiddenCount > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
          {expanded ? t('board.column.showFewer') : t('board.column.showMore', { count: column.hiddenCount })}
        </Button>
      )}
    </div>
  )
}

function dropClassName(dropState: DropState, isOver: boolean): string {
  if (dropState === 'blocked') return 'opacity-50'
  if (dropState === 'allowed') return isOver ? 'ring-2 ring-primary/60 bg-primary/10' : 'ring-2 ring-primary/60'
  return ''
}

function BoardColumnRegion({ column, index, t, cardProps, dropState }: {
  column: BoardColumn
  index: number
  dropState: DropState
  t: Translate
  cardProps: Omit<CardProps, 'card' | 'selected'> & { selectedPath: string | null }
}) {
  const [expanded, setExpanded] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: column.key })
  const label = column.isOther ? t('board.column.other') : column.label
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-testid={`board-column-${column.key}`}
      data-drop={dropState}
      className={`flex max-h-full min-h-0 min-w-56 max-w-80 flex-1 basis-60 flex-col gap-2 rounded-lg bg-muted/40 p-2 transition-colors ${dropClassName(dropState, isOver)}`}
    >
      <ColumnHeader column={column} label={label} index={index} t={t} />
      <ColumnNotes column={column} expanded={expanded} onToggle={() => setExpanded((value) => !value)} t={t} cardProps={cardProps} />
    </section>
  )
}

function findCard(columns: BoardColumn[], path: string): VaultEntry | null {
  for (const column of columns) {
    const card = column.cards.find((candidate) => candidate.entry.path === path)
    if (card) return card.entry
  }
  return null
}

function dropStateFor(column: BoardColumn, movable: Set<string> | null): DropState {
  if (!movable) return undefined
  return movable.has(column.key) ? 'allowed' : 'blocked'
}

function DragPreview({ entry }: { entry: VaultEntry }) {
  return (
    <div className="w-60 cursor-grabbing rounded-md border border-primary bg-background px-3 py-2 shadow-lg">
      <span className="line-clamp-2 break-words text-sm font-medium text-foreground">{entry.title}</span>
    </div>
  )
}

/** Drag a card between columns: tracks the card in flight and which columns would accept it. */
function useBoardDrag({ columns, onMoveCard, getMovableKeys }: Pick<BoardViewProps, 'columns' | 'onMoveCard' | 'getMovableKeys'>) {
  const [activePath, setActivePath] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const draggable = Boolean(onMoveCard && getMovableKeys)
  const active = activePath ? findCard(columns, activePath) : null
  const movable = active && getMovableKeys ? getMovableKeys(active) : null

  const onDragStart = ({ active: dragged }: DragStartEvent) => setActivePath(String(dragged.id))
  const onDragCancel = () => setActivePath(null)
  const onDragEnd = ({ active: dropped, over }: DragEndEvent) => {
    setActivePath(null)
    const entry = findCard(columns, String(dropped.id))
    if (!entry || !over || !getMovableKeys) return
    const target = String(over.id)
    if (getMovableKeys(entry).has(target)) onMoveCard?.(entry, target)
  }
  return { sensors, draggable, active, movable, onDragStart, onDragEnd, onDragCancel }
}

/** Full-width board for a saved View with `presentation.type: board` (ADR-0301). Presentational only. */
export function BoardView({ columns, properties, allEntries, typeEntryMap, selectedPath, locale, colors, onSelectCard, onMoveCard, getMovableKeys }: BoardViewProps) {
  const t: Translate = (key, values) => translate(locale, key, values)
  const drag = useBoardDrag({ columns, onMoveCard, getMovableKeys })
  if (columns.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('board.empty')}</div>
  }
  const cardProps = { properties, allEntries, typeEntryMap, locale, colors, onSelect: onSelectCard, selectedPath, draggable: drag.draggable }
  return (
    <DndContext sensors={drag.sensors} onDragStart={drag.onDragStart} onDragEnd={drag.onDragEnd} onDragCancel={drag.onDragCancel}>
      <section aria-label={t('board.region')} className="flex h-full items-start gap-3 overflow-x-auto p-3">
        {columns.map((column, index) => (
          <BoardColumnRegion key={column.key} column={column} index={index} t={t} cardProps={cardProps} dropState={dropStateFor(column, drag.movable)} />
        ))}
      </section>
      <DragOverlay>{drag.active ? <DragPreview entry={drag.active} /> : null}</DragOverlay>
    </DndContext>
  )
}
