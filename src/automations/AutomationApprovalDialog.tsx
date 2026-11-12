import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { translate, type AppLocale } from '../lib/i18n'
import type { AutomationFile } from './automationTypes'

interface AutomationApprovalDialogProps {
  file: AutomationFile | null
  locale: AppLocale
  onAnswer: (approved: boolean) => void
}

function commandLines(file: AutomationFile): string[] {
  return file.definition.actions.flatMap((action) => (action.kind === 'run' ? [action.argv.join(' ')] : []))
}

/** Asks before an automation's program runs for the first time, or after its file changed (ADR-0302). */
export function AutomationApprovalDialog({ file, locale, onAnswer }: AutomationApprovalDialogProps) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => { if (!open) onAnswer(false) }}>
      <DialogContent>
        {file && (
          <>
            <DialogHeader>
              <DialogTitle>{translate(locale, 'automation.approve.title', { name: file.definition.name })}</DialogTitle>
              <DialogDescription>{translate(locale, 'automation.approve.description')}</DialogDescription>
            </DialogHeader>
            <pre data-testid="automation-commands" className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
              {commandLines(file).join('\n')}
            </pre>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onAnswer(false)}>{translate(locale, 'automation.approve.decline')}</Button>
              <Button type="button" onClick={() => onAnswer(true)}>{translate(locale, 'automation.approve.allow')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
