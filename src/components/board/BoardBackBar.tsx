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
    // `.app__note-list > *` gives every child flex: 1; this bar must keep its natural height.
    <div data-testid="board-back-bar" className="!flex-none border-b border-border px-2 py-1.5">
      <Button type="button" variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={onBack}>
        <SquaresFour />
        {translate(locale, 'board.backToBoard')}
      </Button>
    </div>
  )
}
