import { MagnifyingGlass, Plus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDragRegion } from '../../hooks/useDragRegion'
import { translate, type AppLocale } from '../../lib/i18n'
import { resolveNoteIcon } from '../../utils/noteIcon'
import {
  EMPTY_BOARD_FILTER,
  isBoardFilterActive,
  toggleBoardFilterValue,
  type BoardDueFilter,
  type BoardFilter,
  type BoardFilterGroup,
} from './boardFilter'

export interface BoardTopBarProps {
  title: string
  icon: string | null
  /** Cards on the board, and how many pass the current filter. */
  total: number
  shown: number
  filter: BoardFilter
  options: BoardFilterGroup[]
  /** Whether the board shows a due-date property, which enables the due shortcuts. */
  hasDue: boolean
  /** False when no column can receive a new card. */
  canCreate: boolean
  locale: AppLocale
  onFilterChange: (filter: BoardFilter) => void
  onNewCard: () => void
}

type Translate = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => string

function ViewIcon({ icon }: { icon: string | null }) {
  const resolved = resolveNoteIcon(icon)
  if (resolved.kind === 'emoji') return <span aria-hidden="true" className="shrink-0 text-sm leading-none">{resolved.value}</span>
  if (resolved.kind === 'phosphor') return <resolved.Icon aria-hidden="true" width={16} height={16} className="shrink-0 text-muted-foreground" />
  if (resolved.kind === 'image') return <img src={resolved.src} alt="" aria-hidden="true" className="size-4 shrink-0 rounded-sm object-cover" />
  return null
}

function countLabel({ total, shown, filtering, t }: { total: number; shown: number; filtering: boolean; t: Translate }): string {
  if (filtering) return t('board.bar.countFiltered', { shown, total })
  return total === 1 ? t('board.bar.countOne') : t('board.bar.count', { count: total })
}

function Chip({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? 'secondary' : 'outline'}
      aria-pressed={pressed}
      className="h-6 rounded-full px-2.5 text-xs font-normal"
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function FilterChips({ filter, options, hasDue, t, onFilterChange }: Pick<BoardTopBarProps, 'filter' | 'options' | 'hasDue' | 'onFilterChange'> & { t: Translate }) {
  const toggleDue = (due: BoardDueFilter) => onFilterChange({ ...filter, due: filter.due === due ? null : due })
  const filtering = isBoardFilterActive(filter)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-2">
      {hasDue && (
        <div className="flex items-center gap-1.5">
          <Chip label={t('board.filter.overdue')} pressed={filter.due === 'overdue'} onClick={() => toggleDue('overdue')} />
          <Chip label={t('board.filter.dueWeek')} pressed={filter.due === 'week'} onClick={() => toggleDue('week')} />
        </div>
      )}
      {options.map((group) => (
        <div key={group.property} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{group.property}</span>
          {group.values.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              pressed={(Reflect.get(filter.values, group.property) as string[] | undefined)?.includes(option.value) ?? false}
              onClick={() => onFilterChange(toggleBoardFilterValue(filter, group.property, option.value))}
            />
          ))}
        </div>
      ))}
      {filtering && (
        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onFilterChange(EMPTY_BOARD_FILTER)}>
          {t('board.bar.clearFilters')}
        </Button>
      )}
    </div>
  )
}

/** The board's own top bar: name, count, quick filter and new card. Doubles as the window drag area. */
export function BoardTopBar({ title, icon, total, shown, filter, options, hasDue, canCreate, locale, onFilterChange, onNewCard }: BoardTopBarProps) {
  const t: Translate = (key, values) => translate(locale, key, values)
  const { dragRegionRef } = useDragRegion<HTMLElement>()
  const filtering = isBoardFilterActive(filter)
  const showChips = hasDue || options.length > 0 || filtering
  return (
    <header
      ref={dragRegionRef}
      data-testid="board-top-bar"
      data-tauri-drag-region
      className="shrink-0 border-b border-border bg-background"
      style={{ padding: '6px 16px 0 var(--breadcrumb-bar-left-padding, 16px)' }}
    >
      <div className="flex h-10 items-center gap-3" data-tauri-drag-region>
        <ViewIcon icon={icon} />
        <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h2>
        <span className="shrink-0 text-xs text-muted-foreground">{countLabel({ total, shown, filtering, t })}</span>
        <div className="h-full min-w-4 flex-1" data-tauri-drag-region />
        <div className="relative w-56 shrink-0">
          <MagnifyingGlass aria-hidden="true" width={14} height={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t('board.bar.filterPlaceholder')}
            placeholder={t('board.bar.filterPlaceholder')}
            value={filter.text}
            className="h-8 pl-8 text-sm"
            onChange={(event) => onFilterChange({ ...filter, text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && filter.text) onFilterChange({ ...filter, text: '' })
            }}
          />
        </div>
        <Button type="button" size="icon" variant="outline" className="size-8 shrink-0" aria-label={t('board.bar.newCard')} title={t('board.bar.newCard')} disabled={!canCreate} onClick={onNewCard}>
          <Plus width={16} height={16} />
        </Button>
      </div>
      {showChips && <FilterChips filter={filter} options={options} hasDue={hasDue} t={t} onFilterChange={onFilterChange} />}
    </header>
  )
}
