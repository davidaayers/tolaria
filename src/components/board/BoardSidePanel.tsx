import { ArrowSquareOut, X } from '@phosphor-icons/react'
import type { BoardColumn } from '../../collections/boardColumns'
import { translate, type AppLocale } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface BoardSidePanelProps {
  entry: VaultEntry
  columns: BoardColumn[]
  /** Column currently holding the note, or null when a column filter hides it. */
  currentColumnKey: string | null
  movable: boolean
  locale: AppLocale
  onMove: (columnKey: string) => void
  onClose: () => void
  onOpenInEditor: () => void
}

function propertyText(value: VaultEntry['properties'][string]): string {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '')
}

function PropertyRows({ entry }: { entry: VaultEntry }) {
  const rows = Object.entries(entry.properties).filter(([, value]) => propertyText(value).length > 0)
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {rows.map(([key, value]) => (
        <div key={key} className="flex flex-col">
          <dt className="text-xs text-muted-foreground">{key}</dt>
          <dd className="break-words text-foreground">{propertyText(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function MoveControl({ columns, currentColumnKey, movable, locale, onMove }: Pick<BoardSidePanelProps, 'columns' | 'currentColumnKey' | 'movable' | 'locale' | 'onMove'>) {
  const label = translate(locale, 'board.panel.status')
  const target = columns.filter((column) => !column.isOther)
  const current = target.some((column) => column.key === currentColumnKey) ? currentColumnKey ?? undefined : undefined
  return (
    <div className="flex flex-col gap-1">
      <Select value={current} onValueChange={onMove} disabled={!movable}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {target.map((column) => (
            <SelectItem key={column.key} value={column.key}>{column.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!movable && <p className="text-xs text-muted-foreground">{translate(locale, 'board.panel.statusLocked')}</p>}
    </div>
  )
}

/** Side panel for the selected board card: properties, body preview, and the column control. */
export function BoardSidePanel(props: BoardSidePanelProps) {
  const { entry, locale, onClose, onOpenInEditor } = props
  return (
    <aside aria-label={translate(locale, 'board.panel.label')} className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="break-words text-base font-semibold text-foreground">{entry.title}</h2>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={translate(locale, 'board.panel.close')} onClick={onClose}>
          <X />
        </Button>
      </div>
      <MoveControl {...props} />
      <Button type="button" variant="outline" size="sm" onClick={onOpenInEditor}>
        <ArrowSquareOut />
        {translate(locale, 'board.panel.openInEditor')}
      </Button>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">{translate(locale, 'board.panel.properties')}</h3>
        <PropertyRows entry={entry} />
      </section>
      {entry.snippet && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.snippet}</p>}
    </aside>
  )
}
