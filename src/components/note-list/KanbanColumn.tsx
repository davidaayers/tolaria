import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Virtuoso } from 'react-virtuoso'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type AppLocale, translate } from '../../lib/i18n'
import { ACCENT_COLORS } from '../../utils/typeColors'
import { NoteTitleIcon } from '../NoteTitleIcon'
import { KanbanCard, type KanbanCardContext } from './KanbanCard'
import type { KanbanBoardColumn } from './kanbanBoardColumns'
import { columnId, columnLabel } from './kanbanModel'

export interface KanbanColumnProps {
  column: KanbanBoardColumn
  context: KanbanCardContext
  locale: AppLocale
  selectedNotePath?: string | null
  droppedPath: string | null
  isCardTarget: boolean
  /** A dragged card cannot be dropped here, so the column is dimmed. */
  isCardRefused?: boolean
}

type HeaderColumn = Pick<KanbanBoardColumn, 'title' | 'count' | 'icon' | 'color' | 'wipLimit' | 'overLimit'>

function accentCss(color: string | null): string | undefined {
  return ACCENT_COLORS.find((accent) => accent.key === color)?.css
}

export function KanbanColumnHeader({ title, count, icon = null, color = null, wipLimit = null, overLimit = false, locale }: Partial<HeaderColumn> & Pick<HeaderColumn, 'title' | 'count'> & { locale?: AppLocale }) {
  const limitTitle = wipLimit !== null && locale ? translate(locale, 'layout.wipLimit', { count: wipLimit }) : undefined
  return (
    <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground">
      {icon && <NoteTitleIcon icon={icon} size={14} color={accentCss(color)} />}
      <span className="truncate">{title}</span>
      <span
        className={cn('text-xs font-medium text-muted-foreground', overLimit && 'text-destructive')}
        title={limitTitle}
        data-over-limit={overLimit ? 'true' : undefined}
      >
        {wipLimit === null ? count : `${count}/${wipLimit}`}
      </span>
    </span>
  )
}

export const KanbanColumn = memo(function KanbanColumn({ column, context, locale, selectedNotePath, droppedPath, isCardTarget, isCardRefused }: KanbanColumnProps) {
  const { key, title, cards, count, hiddenCount, reorderable } = column
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: columnId(key),
    data: { group: key },
    disabled: !reorderable,
  })
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'kanban-column flex min-h-0 w-[272px] min-w-[272px] flex-col rounded-xl bg-muted/50',
        isCardTarget && 'kanban-column--target',
        isCardRefused && 'kanban-column--refused',
        isDragging && 'kanban-column--placeholder',
      )}
      aria-label={columnLabel(title, count, locale)}
      data-kanban-column={key}
      data-testid="kanban-column"
    >
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        {...attributes}
        {...listeners}
        aria-roledescription={translate(locale, 'layout.columnRole')}
        aria-label={title}
        className="h-10 w-full shrink-0 cursor-grab justify-start rounded-t-xl rounded-b-none px-3 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <KanbanColumnHeader {...column} locale={locale} />
      </Button>
      <div className="min-h-0 flex-1 px-2 pb-2">
        <Virtuoso
          data={cards}
          className="kanban-scroll"
          style={{ height: '100%' }}
          computeItemKey={(_, entry) => entry.path}
          itemContent={(_, entry) => (
            <div className="pb-2">
              <KanbanCard entry={entry} columnKey={key} context={context} selected={entry.path === selectedNotePath} justDropped={entry.path === droppedPath} />
            </div>
          )}
        />
      </div>
      {hiddenCount > 0 && (
        <p className="m-0 px-3 pb-2 text-xs text-muted-foreground" data-testid="kanban-more-cards">
          {translate(locale, 'layout.moreCards', { count: hiddenCount })}
        </p>
      )}
    </section>
  )
})
