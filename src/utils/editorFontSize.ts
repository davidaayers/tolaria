export const DEFAULT_EDITOR_FONT_SIZE = 15
export const EDITOR_FONT_SIZES: readonly number[] = [13, 14, 15, 16, 18, 20]

export function normalizeEditorFontSize(value: unknown): number | null {
  const size = typeof value === 'string' ? Number(value.trim()) : value
  return EDITOR_FONT_SIZES.find((supported) => supported === size) ?? null
}

/** Scales a theme.json size (authored against the default size) to the chosen editor size. */
export function scaleToEditorFontSize(themeSize: number, editorFontSize: number): number {
  return Math.round((themeSize * editorFontSize) / DEFAULT_EDITOR_FONT_SIZE)
}
