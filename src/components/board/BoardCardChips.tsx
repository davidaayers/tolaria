import type { CSSProperties } from 'react'
import type { MouseEvent } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import { PropertyChips } from '../note-item/PropertyChips'
import { accentForValue, dueUrgency, isDueProperty, propertyValue, scalarText } from './boardCardMeta'

const CHIP_CLASSNAME = 'inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium'

export interface BoardCardChipsProps {
  entry: VaultEntry
  properties: string[]
  allEntries: VaultEntry[]
  typeEntryMap: Record<string, VaultEntry>
  locale: AppLocale
  /** Lowercase property name -> lowercase value to leave out because most cards in the column share it. */
  hiddenValues?: Map<string, string>
  /** Configured chip colours by lowercase value. */
  colors?: Record<string, string>
  onOpenNote: (entry: VaultEntry, event: MouseEvent) => void
}

function accentStyle(accent: string): CSSProperties {
  return { backgroundColor: `var(--accent-${accent}-light)`, color: `var(--accent-${accent})` }
}

const URGENCY_STYLE: Record<'overdue' | 'soon' | 'later', CSSProperties | undefined> = {
  overdue: accentStyle('red'),
  soon: accentStyle('orange'),
  later: undefined,
}

function shortDate(value: string, locale: AppLocale): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

function DueChip({ value, locale }: { value: string; locale: AppLocale }) {
  const urgency = dueUrgency(value)
  if (!urgency) return null
  const label = urgency.key ? translate(locale, urgency.key, { count: urgency.count }) : shortDate(value, locale)
  return (
    <span className={`${CHIP_CLASSNAME} bg-muted text-muted-foreground`} style={URGENCY_STYLE[urgency.tone]} data-urgency={urgency.tone}>
      {label}
    </span>
  )
}

function ScalarChip({ name, text, locale, colors }: { name: string; text: string; locale: AppLocale; colors?: Record<string, string> }) {
  if (isDueProperty(name) && dueUrgency(text)) return <DueChip value={text} locale={locale} />
  return <span className={CHIP_CLASSNAME} style={accentStyle(colors?.[text.toLowerCase()] ?? accentForValue(text))}>{text}</span>
}

/** Card metadata: coloured scalar chips and due-date urgency; lists and wikilinks use the shared chips. */
export function BoardCardChips({ entry, properties, allEntries, typeEntryMap, locale, hiddenValues, colors, onOpenNote }: BoardCardChipsProps) {
  const scalars: Array<{ name: string; text: string }> = []
  const shared: string[] = []
  for (const name of properties) {
    const text = scalarText(propertyValue(entry, name))
    if (text === null) shared.push(name)
    else if (hiddenValues?.get(name.toLowerCase()) !== text.toLowerCase()) scalars.push({ name, text })
  }
  return (
    <>
      {scalars.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {scalars.map(({ name, text }) => <ScalarChip key={name} name={name} text={text} locale={locale} colors={colors} />)}
        </div>
      )}
      {shared.length > 0 && (
        <PropertyChips entry={entry} displayProps={shared} allEntries={allEntries} typeEntryMap={typeEntryMap} onOpenNote={onOpenNote} />
      )}
    </>
  )
}
