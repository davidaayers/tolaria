import type { ClipboardEvent } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import {
  neutralColorClipboardWriter,
  richEditorClipboardPayload,
  selectedCodeBlockText,
  selectedEditorDomHtml,
  selectedEditorPlainText,
  selectedEditorRange,
  writeRichEditorClipboardPayload,
} from './editorRichCopy'

function handleCodeBlockCopy(event: ClipboardEvent<HTMLDivElement>): boolean {
  const codeText = selectedCodeBlockText({
    selection: window.getSelection(),
    container: event.currentTarget,
  })
  if (codeText === null) return false

  event.clipboardData.setData('text/plain', codeText)
  event.preventDefault()
  return true
}

function handleSelectedEditorCopy(
  event: ClipboardEvent<HTMLDivElement>,
  editor: ReturnType<typeof useCreateBlockNote>,
) {
  const selection = window.getSelection()
  const range = selectedEditorRange(selection, event.currentTarget)
  if (!selection || !range) return

  const plainText = selectedEditorPlainText(selection, range)
  if (plainText === null) return

  const clipboardData = neutralColorClipboardWriter(event.clipboardData)
  clipboardData.setData('text/plain', plainText)

  const richPayload = richEditorClipboardPayload(editor)
  if (richPayload) {
    writeRichEditorClipboardPayload(clipboardData, richPayload)
  } else {
    const markup = selectedEditorDomHtml(range)
    if (markup.length > 0) clipboardData.setData('text/html', markup)
  }

  event.preventDefault()
}

export function handleEditorCopy(
  event: ClipboardEvent<HTMLDivElement>,
  editor: ReturnType<typeof useCreateBlockNote>,
) {
  if (!handleCodeBlockCopy(event)) handleSelectedEditorCopy(event, editor)
}

// A prevented clipboard event never reaches ProseMirror, so BlockNote's own cut
// handler (copy + delete) is skipped and the selection has to be removed here.
// When the copy path declines the event, BlockNote's cut still runs as before.
export function handleEditorCut(
  event: ClipboardEvent<HTMLDivElement>,
  editor: ReturnType<typeof useCreateBlockNote>,
) {
  handleEditorCopy(event, editor)
  if (!event.defaultPrevented) return

  const view = editor.prosemirrorView
  if (view?.editable) view.dispatch(view.state.tr.deleteSelection())
}
