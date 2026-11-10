import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEditorTheme } from './useTheme'
import { AppPreferencesProvider } from './useAppPreferences'
import { createElement, type ReactNode } from 'react'

describe('useEditorTheme', () => {
  it('uses 0xProto as the default editor font', () => {
    const { result } = renderHook(() => useEditorTheme())

    expect(result.current.cssVars['--editor-font-family']).toMatch(/^'0xProto'/)
  })

  it('applies the editor font chosen in preferences', () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(AppPreferencesProvider, { editorFont: 'inter' }, children)
    const { result } = renderHook(() => useEditorTheme(), { wrapper })

    expect(result.current.cssVars['--editor-font-family']).toMatch(/^'Inter'/)
  })

  it('uses the 15px theme font size by default', () => {
    const { result } = renderHook(() => useEditorTheme())

    expect(result.current.cssVars['--editor-font-size']).toBe('15px')
    expect(result.current.cssVars['--headings-h1-font-size']).toBe('32px')
  })

  it('scales body, heading, code, and table sizes with the chosen editor font size', () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(AppPreferencesProvider, { editorFontSize: 20 }, children)
    const { result } = renderHook(() => useEditorTheme(), { wrapper })

    expect(result.current.cssVars['--editor-font-size']).toBe('20px')
    expect(result.current.cssVars['--headings-h1-font-size']).toBe('43px')
    expect(result.current.cssVars['--inline-styles-code-font-size']).toBe('19px')
    expect(result.current.cssVars['--table-font-size']).toBe('19px')
  })

  it('keeps inline code on the muted editor surface without exporting code block overrides', () => {
    const { result } = renderHook(() => useEditorTheme())

    expect(result.current.cssVars['--inline-styles-code-background-color']).toBe(
      'var(--bg-hover-subtle)'
    )
    expect(result.current.cssVars['--code-blocks-background-color']).toBeUndefined()
  })

  it('keeps h4 visually between body text and h3 while remaining bold', () => {
    const { result } = renderHook(() => useEditorTheme())

    const bodySize = Number.parseFloat(result.current.cssVars['--editor-font-size'])
    const h3Size = Number.parseFloat(result.current.cssVars['--headings-h3-font-size'])
    const h4Size = Number.parseFloat(result.current.cssVars['--headings-h4-font-size'])

    expect(h4Size).toBeGreaterThan(bodySize)
    expect(h4Size).toBeLessThan(h3Size)
    expect(result.current.cssVars['--headings-h4-font-weight']).toBe('600')
  })

  it('exports the default editor max width', () => {
    const { result } = renderHook(() => useEditorTheme())

    expect(result.current.cssVars['--editor-max-width']).toBe('820px')
  })
})
