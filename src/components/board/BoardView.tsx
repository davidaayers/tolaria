import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { BoardCard, BoardColumn } from '../../collections/boardColumns'
import { translate, type AppLocale } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import { Button } from '@/components/ui/button'
import { PropertyChips } from '../note-item/PropertyChips'

export interface BoardViewProps {
  columns: BoardColumn[]
  /** Property names shown as chips on each card. */
  properties: string[]
  allEntries: VaultEntry[]
  typeEntryMap: Record<string, VaultEntry>
  selectedPath: string | null
  locale: AppLocale
  onSelectCard: (entry: VaultEntry) => void
}

type Translate = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => string

interface CardProps {
  card: BoardCard
  selected: boolean
  properties: string[]
  allEntries: VaultEntry[]
  typeEntryMap: Record<string, VaultEntry>
  onSelect: (entry: VaultEntry) => void
}

function BoardCardButton({ card, selected, properties, allEntries, typeEntryMap, onSelect }: CardProps) {
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
      <span className="w-full truncate text-sm font-medium text-foreground">{entry.title}</span>
      {properties.length > 0 && (
        <PropertyChips
          entry={entry}
          displayProps={properties}
          allEntries={allEntries}
          typeEntryMap={typeEntryMap}
          onOpenNote={openChipTarget}
        />
      )}
    </Button>
  )
}

function columnCount(column: BoardColumn, t: Translate): string {
  if (column.limit === null) return String(column.cards.length)
  return t('board.column.limit', { count: column.cards.length, limit: column.limit })
}

function ColumnHeader({ column, label, t }: { column: BoardColumn; label: string; t: Translate }) {
  return (
    <header className="flex items-center justify-between gap-2 px-1">
      <h3 className="truncate text-sm font-semibold text-foreground">{label}</h3>
      <span className={column.overLimit ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
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
  return (
    <>
      {column.overLimit && (
        <p role="status" className="px-1 text-xs text-destructive">{t('board.column.overLimit', { limit: column.limit ?? 0 })}</p>
      )}
      {column.cards.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t('board.column.empty')}</p>}
      <div className="flex flex-col gap-2">
        {shown.map((card) => (
          <BoardCardButton key={card.entry.path} card={card} selected={card.entry.path === selectedPath} {...shared} />
        ))}
      </div>
      {column.hiddenCount > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
          {expanded ? t('board.column.showFewer') : t('board.column.showMore', { count: column.hiddenCount })}
        </Button>
      )}
      {column.filteredOutCount > 0 && (
        <p className="px-1 text-xs text-muted-foreground">{t('board.column.filteredOut', { count: column.filteredOutCount })}</p>
      )}
    </>
  )
}

function BoardColumnRegion({ column, t, cardProps }: {
  column: BoardColumn
  t: Translate
  cardProps: Omit<CardProps, 'card' | 'selected'> & { selectedPath: string | null }
}) {
  const [expanded, setExpanded] = useState(false)
  const label = column.isOther ? t('board.column.other') : column.label
  return (
    <section
      aria-label={label}
      data-testid={`board-column-${column.key}`}
      className="flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2"
    >
      <ColumnHeader column={column} label={label} t={t} />
      <ColumnNotes column={column} expanded={expanded} onToggle={() => setExpanded((value) => !value)} t={t} cardProps={cardProps} />
    </section>
  )
}

/** Full-width board for a saved View with `presentation.type: board` (ADR-0301). Presentational only. */
export function BoardView({ columns, properties, allEntries, typeEntryMap, selectedPath, locale, onSelectCard }: BoardViewProps) {
  const t: Translate = (key, values) => translate(locale, key, values)
  if (columns.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('board.empty')}</div>
  }
  const cardProps = { properties, allEntries, typeEntryMap, onSelect: onSelectCard, selectedPath }
  return (
    <div role="group" aria-label={t('board.region')} className="flex h-full items-start gap-3 overflow-x-auto p-3">
      {columns.map((column) => (
        <BoardColumnRegion key={column.key} column={column} t={t} cardProps={cardProps} />
      ))}
    </div>
  )
}
