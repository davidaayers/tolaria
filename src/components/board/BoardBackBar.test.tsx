import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BoardBackBar } from './BoardBackBar'

describe('BoardBackBar', () => {
  it('offers a way back to the board and calls the handler', () => {
    const onBack = vi.fn()
    render(<BoardBackBar locale="en" onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to board' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('keeps its natural height inside the note-list column, which grows every child', () => {
    render(<BoardBackBar locale="en" onBack={vi.fn()} />)
    expect(screen.getByTestId('board-back-bar').className).toContain('!flex-none')
  })
})
