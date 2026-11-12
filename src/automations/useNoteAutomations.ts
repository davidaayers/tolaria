import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { translate, type AppLocale } from '../lib/i18n'
import type { VaultEntry } from '../types'
import { getAutomationTrust, listAutomations, runAutomationCommand, setAutomationTrust, type TrustMap } from './automationBackend'
import { createChangeBatcher } from './automationBatcher'
import { runAutomationsForEvent, type AutomationDeps, type AutomationResult } from './automationRun'
import type { AutomationFile, AutomationScalar, NoteChangeEvent } from './automationTypes'
import type { PropertyWrite } from './propertyChange'

/** Writes to one note within this window count as one event (ADR-0302). */
export const AUTOMATION_BATCH_MS = 150

type WriteOptions = { silent?: boolean }

interface Options {
  vaultPath: string
  locale: AppLocale
  entries: VaultEntry[]
  setToastMessage: (message: string | null) => void
  updateFrontmatter: (path: string, key: string, value: AutomationScalar, options?: WriteOptions) => Promise<void>
  deleteProperty: (path: string, key: string, options?: WriteOptions) => Promise<void>
}

function localIso(date: Date): { today: string; now: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return { today, now: `${today}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` }
}

function toastFor(results: AutomationResult[], locale: AppLocale): string | null {
  if (results.length === 0) return null
  return results
    .map((result) => (result.ok
      ? result.message ?? translate(locale, 'automation.ran', { name: result.name })
      : translate(locale, 'automation.failed', { name: result.name, error: result.error ?? '' })))
    .join(' · ')
}

/**
 * Runs the vault's automations when a user-made property edit finishes (ADR-0302).
 * Feed it every successful property write through `onPropertyChanged`.
 */
export function useNoteAutomations(options: Options) {
  const optionsRef = useRef(options)
  useEffect(() => { optionsRef.current = options })
  const [pending, setPending] = useState<{ file: AutomationFile; answer: (approved: boolean) => void } | null>(null)
  const runningRef = useRef(0)
  const queueRef = useRef<Promise<void>>(Promise.resolve())

  const process = useCallback(async (event: NoteChangeEvent) => {
    const { vaultPath, locale, setToastMessage } = optionsRef.current
    if (!vaultPath) return
    const { files } = await listAutomations(vaultPath)
    if (files.length === 0) return
    const trustMap: TrustMap = await getAutomationTrust(vaultPath)
    const deps: AutomationDeps = {
      vaultPath,
      today: () => localIso(new Date()).today,
      now: () => localIso(new Date()).now,
      getEntry: (path) => optionsRef.current.entries.find((entry) => entry.path === path),
      setProperty: (path, key, value) => optionsRef.current.updateFrontmatter(path, key, value, { silent: true }),
      removeProperty: (path, key) => optionsRef.current.deleteProperty(path, key, { silent: true }),
      runCommand: (request, filename) => runAutomationCommand(vaultPath, filename, request),
      trust: (file) => trustMap[file.hash] ?? 'unknown',
      askTrust: (file) => new Promise<boolean>((resolve) => {
        setPending({
          file,
          answer: (approved) => {
            setPending(null)
            trustMap[file.hash] = approved ? 'approved' : 'declined'
            void setAutomationTrust(vaultPath, file.hash, approved).finally(() => resolve(approved))
          },
        })
      }),
    }
    runningRef.current += 1
    try {
      setToastMessage(toastFor(await runAutomationsForEvent(files, event, deps), locale))
    } finally {
      runningRef.current -= 1
    }
  }, [])

  const batcher = useMemo(() => createChangeBatcher(AUTOMATION_BATCH_MS, (event) => {
    queueRef.current = queueRef.current.then(() => process(event)).catch(() => undefined)
  }), [process])
  useEffect(() => () => batcher.cancel(), [batcher, options.vaultPath])

  const onPropertyChanged = useCallback((write: PropertyWrite) => {
    if (runningRef.current > 0) return
    batcher.record(write.path, write.key, write.old, write.new)
  }, [batcher])

  return { onPropertyChanged, approvalFile: pending?.file ?? null, answerApproval: (approved: boolean) => pending?.answer(approved) }
}
