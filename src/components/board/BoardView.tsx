import { useState } from 'react'
import type { MouseEvent } from 'react'
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
}

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
  onSelect: (entry: VaultEntry) => void
}

function BoardCardButton({ card, selected, properties, allEntries, typeEntryMap, locale, hiddenValues, colors, onSelect }: CardProps) {
  const { entry } = card
  const openChipTarget = (target: VaultEntry, event: MouseEvent) => {
    event.stopPropagation()
    onSelect(target)
  }
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={selected}
      data-testid={`board-card-${entry.path}`}
      className="h-auto w-full flex-col items-start gap-1.5 whitespace-normal px-3 py-2 text-left font-normal data-[selected=true]:border-primary"
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

function BoardColumnRegion({ column, index, t, cardProps }: {
  column: BoardColumn
  index: number
  t: Translate
  cardProps: Omit<CardProps, 'card' | 'selected'> & { selectedPath: string | null }
}) {
  const [expanded, setExpanded] = useState(false)
  const label = column.isOther ? t('board.column.other') : column.label
  return (
    <section
      aria-label={label}
      data-testid={`board-column-${column.key}`}
      className="flex max-h-full min-h-0 min-w-56 max-w-80 flex-1 basis-60 flex-col gap-2 rounded-lg bg-muted/40 p-2"
    >
      <ColumnHeader column={column} label={label} index={index} t={t} />
      <ColumnNotes column={column} expanded={expanded} onToggle={() => setExpanded((value) => !value)} t={t} cardProps={cardProps} />
    </section>
  )
}

/** Full-width board for a saved View with `presentation.type: board` (ADR-0301). Presentational only. */
export function BoardView({ columns, properties, allEntries, typeEntryMap, selectedPath, locale, colors, onSelectCard }: BoardViewProps) {
  const t: Translate = (key, values) => translate(locale, key, values)
  if (columns.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('board.empty')}</div>
  }
  const cardProps = { properties, allEntries, typeEntryMap, locale, colors, onSelect: onSelectCard, selectedPath }
  return (
    <section aria-label={t('board.region')} className="flex h-full items-start gap-3 overflow-x-auto p-3">
      {columns.map((column, index) => (
        <BoardColumnRegion key={column.key} column={column} index={index} t={t} cardProps={cardProps} />
      ))}
    </section>
  )
}
