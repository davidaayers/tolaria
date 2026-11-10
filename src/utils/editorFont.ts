export type EditorFont = '0xproto' | 'inter' | 'jetbrains-mono' | 'ibm-plex-mono' | 'system'

export const DEFAULT_EDITOR_FONT: EditorFont = '0xproto'
export const EDITOR_FONTS: readonly EditorFont[] = ['0xproto', 'inter', 'jetbrains-mono', 'ibm-plex-mono', 'system']

export const EDITOR_FONT_FAMILIES: Record<EditorFont, string> = {
  '0xproto': "'0xProto', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  'jetbrains-mono': "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  'ibm-plex-mono': "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}

export function normalizeEditorFont(value: unknown): EditorFont | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return EDITOR_FONTS.find((font) => font === normalized) ?? null
}
