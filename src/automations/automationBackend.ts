import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../mock-tauri'
import type { AutomationFile } from './automationTypes'
import type { CommandRequest, CommandResult } from './automationRun'

export interface AutomationListing {
  files: AutomationFile[]
  errors: Array<{ filename: string; error: string }>
}

export type TrustMap = Record<string, 'approved' | 'declined'>

const EMPTY_LISTING: AutomationListing = { files: [], errors: [] }

/** The browser mock has no automations; only the desktop backend reads and runs them. */
export async function listAutomations(vaultPath: string): Promise<AutomationListing> {
  if (!isTauri()) return EMPTY_LISTING
  return invoke<AutomationListing>('list_automations', { vaultPath })
}

export async function getAutomationTrust(vaultPath: string): Promise<TrustMap> {
  if (!isTauri()) return {}
  return invoke<TrustMap>('get_automation_trust', { vaultPath })
}

export async function setAutomationTrust(vaultPath: string, hash: string, approved: boolean): Promise<void> {
  if (!isTauri()) return
  await invoke('set_automation_trust', { vaultPath, hash, approved })
}

export async function runAutomationCommand(vaultPath: string, filename: string, request: CommandRequest): Promise<CommandResult> {
  return invoke<CommandResult>('run_automation_command', { vaultPath, filename, request })
}
