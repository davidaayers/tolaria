import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITOR_FONT_SIZE,
  EDITOR_FONT_SIZES,
  normalizeEditorFontSize,
  scaleToEditorFontSize,
} from './editorFontSize'

describe('editorFontSize', () => {
  it('defaults to the 15px theme base size', () => {
    expect(DEFAULT_EDITOR_FONT_SIZE).toBe(15)
    expect(EDITOR_FONT_SIZES).toContain(DEFAULT_EDITOR_FONT_SIZE)
  })

  it('normalizes supported sizes and rejects everything else', () => {
    expect(normalizeEditorFontSize(18)).toBe(18)
    expect(normalizeEditorFontSize('16')).toBe(16)
    expect(normalizeEditorFontSize(17)).toBeNull()
    expect(normalizeEditorFontSize('huge')).toBeNull()
    expect(normalizeEditorFontSize(null)).toBeNull()
  })

  it('leaves theme sizes untouched at the default size', () => {
    expect(scaleToEditorFontSize(32, DEFAULT_EDITOR_FONT_SIZE)).toBe(32)
  })

  it('scales theme sizes proportionally to the chosen size', () => {
    expect(scaleToEditorFontSize(30, 20)).toBe(40)
    expect(scaleToEditorFontSize(14, 13)).toBe(12)
  })
})
