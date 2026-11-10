import { describe, expect, it } from 'vitest'
import { DEFAULT_EDITOR_FONT, EDITOR_FONTS, EDITOR_FONT_FAMILIES, normalizeEditorFont } from './editorFont'

describe('editorFont', () => {
  it('defaults to 0xProto', () => {
    expect(DEFAULT_EDITOR_FONT).toBe('0xproto')
    expect(EDITOR_FONT_FAMILIES[DEFAULT_EDITOR_FONT]).toMatch(/^'0xProto'/)
  })

  it('has a font stack for every option', () => {
    for (const font of EDITOR_FONTS) expect(EDITOR_FONT_FAMILIES[font]).toBeTruthy()
  })

  it('normalizes known values and rejects unknown ones', () => {
    expect(normalizeEditorFont(' Inter ')).toBe('inter')
    expect(normalizeEditorFont('comic-sans')).toBeNull()
    expect(normalizeEditorFont(null)).toBeNull()
    expect(normalizeEditorFont(3)).toBeNull()
  })
})
