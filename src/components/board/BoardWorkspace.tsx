import { useCallback, useMemo, useState } from 'react'
import { buildBoardColumns, type BoardColumn } from '../../collections/boardColumns'
import { applyBoardMovePlan, planBoardMove } from '../../collections/boardMove'
import type { BoardCollectionPresentationConfig } from '../../collections/collectionTypes'
import type { AppLocale } from '../../lib/i18n'
import type { FrontmatterValue, VaultEntry, ViewFile } from '../../types'
import { getSortComparator } from '../../utils/noteListHelpers'
import { parseSortConfig } from '../../utils/noteSort'
import { buildTypeEntryMap } from '../../utils/typeColors'
import { BoardSidePanel } from './BoardSidePanel'
import { BoardView } from './BoardView'

export interface BoardWorkspaceProps {
  presentation: BoardCollectionPresentationConfig
  /** The saved View's own `sort`, applied before per-column sorts. */
  viewSort: string | null
  /** Notes that passed the saved View's filter. */
  entries: VaultEntry[]
  allEntries: VaultEntry[]
  /** All saved Views; each board column is one of them. */
  views: ViewFile[]
  /** The board's own View, which never serves as one of its own columns. */
  boardView?: ViewFile | null
  locale: AppLocale
  onUpdateFrontmatter: (path: string, key: string, value: FrontmatterValue) => Promise<unknown>
  onDeleteProperty: (path: string, key: string) => Promise<unknown>
  /** Leave the board for the normal list and editor layout with this note open. */
  onOpenInList: (entry: VaultEntry) => void
}

function todayIso(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function sortedByView(entries: VaultEntry[], viewSort: string | null): VaultEntry[] {
  const sort = parseSortConfig(viewSort)
  if (!sort) return entries
  return [...entries].sort(getSortComparator(sort.option, sort.direction))
}

function findColumn(columns: BoardColumn[], path: string): BoardColumn | null {
  return columns.find((column) => column.cards.some((card) => card.entry.path === path)) ?? null
}

function movableColumnKeys(entry: VaultEntry | null, columns: BoardColumn[]): Set<string> {
  if (!entry) return new Set()
  const today = todayIso()
  return new Set(columns.filter((target) => planBoardMove({ entry, columns, target, today })).map((target) => target.key))
}

function useBoardMove(props: BoardWorkspaceProps, columns: BoardColumn[]) {
  const { onUpdateFrontmatter, onDeleteProperty } = props
  return useCallback(async (entry: VaultEntry, columnKey: string) => {
    const target = columns.find((column) => column.key === columnKey)
    if (!target) return
    const plan = planBoardMove({ entry, columns, target, today: todayIso() })
    if (!plan) return
    await applyBoardMovePlan(entry.path, plan, {
      updateProperty: (path, key, value) => onUpdateFrontmatter(path, key, value),
      deleteProperty: (path, key) => onDeleteProperty(path, key),
    })
  }, [columns, onDeleteProperty, onUpdateFrontmatter])
}

/** Full-width board plus the selected-note side panel for a board saved View (ADR-0301). */
export function BoardWorkspace(props: BoardWorkspaceProps) {
  const { presentation, viewSort, entries, allEntries, views, boardView, locale, onOpenInList } = props
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const columns = useMemo(
    () => buildBoardColumns(sortedByView(entries, viewSort), presentation, views, boardView),
    [boardView, entries, presentation, viewSort, views],
  )
  const typeEntryMap = useMemo(() => buildTypeEntryMap(allEntries), [allEntries])
  const move = useBoardMove(props, columns)

  const selectedColumn = selectedPath ? findColumn(columns, selectedPath) : null
  const selectedEntry = selectedPath ? entries.find((entry) => entry.path === selectedPath) ?? null : null
  const movableKeys = useMemo(() => movableColumnKeys(selectedEntry, columns), [columns, selectedEntry])

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="min-w-0 flex-1">
        <BoardView
          columns={columns}
          properties={presentation.properties}
          allEntries={allEntries}
          typeEntryMap={typeEntryMap}
          selectedPath={selectedPath}
          locale={locale}
          colors={presentation.colors}
          onSelectCard={(entry) => setSelectedPath(entry.path)}
        />
      </div>
      {selectedEntry && (
        <BoardSidePanel
          entry={selectedEntry}
          columns={columns}
          currentColumnKey={selectedColumn?.key ?? null}
          movableKeys={movableKeys}
          locale={locale}
          onMove={(columnKey) => { void move(selectedEntry, columnKey) }}
          onClose={() => setSelectedPath(null)}
          onOpenInEditor={() => onOpenInList(selectedEntry)}
        />
      )}
    </div>
  )
}
