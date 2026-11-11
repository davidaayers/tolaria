import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BoardTopBar } from './BoardTopBar'
import { EMPTY_BOARD_FILTER, type BoardFilter } from './boardFilter'

const OPTIONS = [{ property: 'area', values: [{ value: 'ops', label: 'Ops', count: 3 }, { value: 'team', label: 'Team', count: 2 }] }]

function renderBar(props: Partial<React.ComponentProps<typeof BoardTopBar>> = {}) {
  const onFilterChange = vi.fn()
  const onNewCard = vi.fn()
  render(
    <BoardTopBar
      title="Tasks Board"
      icon={null}
      total={12}
      shown={12}
      filter={EMPTY_BOARD_FILTER}
      options={OPTIONS}
      hasDue
      canCreate
      locale="en"
      onFilterChange={onFilterChange}
      onNewCard={onNewCard}
      {...props}
    />,
  )
  return { onFilterChange, onNewCard }
}

const active = (overrides: Partial<BoardFilter>): BoardFilter => ({ ...EMPTY_BOARD_FILTER, ...overrides })

describe('BoardTopBar', () => {
  it('shows the board name, a card count and is a window drag region', () => {
    renderBar()
    expect(screen.getByRole('heading', { name: 'Tasks Board' })).toBeInTheDocument()
    expect(screen.getByText('12 cards')).toBeInTheDocument()
    expect(screen.getByTestId('board-top-bar')).toHaveAttribute('data-tauri-drag-region')
  })

  it('says "1 card" for a single card and "n of m" while filtering', () => {
    renderBar({ total: 1, shown: 1 })
    expect(screen.getByText('1 card')).toBeInTheDocument()
  })

  it('shows how many cards match while a filter is on', () => {
    renderBar({ filter: active({ text: 'x' }), shown: 3 })
    expect(screen.getByText('3 of 12 cards')).toBeInTheDocument()
  })

  it('reports typed filter text', () => {
    const { onFilterChange } = renderBar()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter cards' }), { target: { value: 'login' } })
    expect(onFilterChange).toHaveBeenCalledWith({ ...EMPTY_BOARD_FILTER, text: 'login' })
  })

  it('clears the text with Escape, and leaves an empty box alone', () => {
    const { onFilterChange } = renderBar({ filter: active({ text: 'login' }) })
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Filter cards' }), { key: 'Escape' })
    expect(onFilterChange).toHaveBeenCalledWith(EMPTY_BOARD_FILTER)
  })

  it('offers each value as a toggle chip and reports the choice', () => {
    const { onFilterChange } = renderBar({ filter: active({ values: { area: ['team'] } }) })
    expect(screen.getByRole('button', { name: 'Team' })).toHaveAttribute('aria-pressed', 'true')
    const ops = screen.getByRole('button', { name: 'Ops' })
    expect(ops).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(ops)
    expect(onFilterChange).toHaveBeenCalledWith(active({ values: { area: ['team', 'ops'] } }))
  })

  it('offers due shortcuts only when the board shows a due property, one at a time', () => {
    const { onFilterChange } = renderBar({ filter: active({ due: 'overdue' }) })
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Due this week' }))
    expect(onFilterChange).toHaveBeenLastCalledWith(active({ due: 'week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Overdue' }))
    expect(onFilterChange).toHaveBeenLastCalledWith(EMPTY_BOARD_FILTER)
  })

  it('hides the due shortcuts without a due property', () => {
    renderBar({ hasDue: false })
    expect(screen.queryByRole('button', { name: 'Overdue' })).not.toBeInTheDocument()
  })

  it('offers Clear filters only while a filter is on, and clears everything', () => {
    renderBar()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('clears every filter at once', () => {
    const { onFilterChange } = renderBar({ filter: active({ text: 'a', due: 'week', values: { area: ['ops'] } }) })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onFilterChange).toHaveBeenCalledWith(EMPTY_BOARD_FILTER)
  })

  it('starts a new card, and disables the button when no column can take one', () => {
    const { onNewCard } = renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'New card' }))
    expect(onNewCard).toHaveBeenCalledTimes(1)
  })

  it('disables New card when no column can receive one', () => {
    renderBar({ canCreate: false })
    expect(screen.getByRole('button', { name: 'New card' })).toBeDisabled()
  })
})
