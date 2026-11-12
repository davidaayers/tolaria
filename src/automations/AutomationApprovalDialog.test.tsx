import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AutomationApprovalDialog } from './AutomationApprovalDialog'
import type { AutomationFile } from './automationTypes'

const file: AutomationFile = {
  filename: 'finish.yml',
  hash: 'h',
  definition: {
    name: 'Finish task', on: { property: 'status', to: [], from: [] }, when: null,
    actions: [{ kind: 'set', values: { a: 1 } }, { kind: 'run', argv: ['/usr/bin/python3', 'x.py', '{{note.path}}'], timeoutSeconds: 30 }],
  },
}

describe('AutomationApprovalDialog', () => {
  it('renders nothing while there is no file to approve', () => {
    render(<AutomationApprovalDialog file={null} locale="en" onAnswer={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the automation name and the exact command it would run', () => {
    render(<AutomationApprovalDialog file={file} locale="en" onAnswer={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Allow automation "Finish task"?')
    expect(screen.getByTestId('automation-commands')).toHaveTextContent('/usr/bin/python3 x.py {{note.path}}')
  })

  it('answers yes only from Allow, and no from Don\'t run or from closing', () => {
    const onAnswer = vi.fn()
    render(<AutomationApprovalDialog file={file} locale="en" onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(onAnswer).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: "Don't run" }))
    expect(onAnswer).toHaveBeenLastCalledWith(false)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onAnswer).toHaveBeenLastCalledWith(false)
  })
})
