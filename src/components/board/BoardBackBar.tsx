import { SquaresFour } from '@phosphor-icons/react'
import { translate, type AppLocale } from '../../lib/i18n'
import { Button } from '@/components/ui/button'

interface BoardBackBarProps {
  locale: AppLocale
  onBack: () => void
}

/** Shown above the note list when a board View is displayed as a list, to return to the board. */
export function BoardBackBar({ locale, onBack }: BoardBackBarProps) {
  return (
    <div className="flex shrink-0 items-center border-b border-border px-3 py-1.5">
      <Button type="button" variant="ghost" size="xs" onClick={onBack}>
        <SquaresFour />
        {translate(locale, 'board.backToBoard')}
      </Button>
    </div>
  )
}
