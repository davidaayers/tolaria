import { useMemo } from 'react'
import themeConfig from '../theme.json'
import { EDITOR_FONT_FAMILIES } from '../utils/editorFont'
import { scaleToEditorFontSize } from '../utils/editorFontSize'
import { useEditorFont, useEditorFontSize } from './useAppPreferences'

const SCALED_FONT_SIZE_VARS = [
  '--editor-font-size',
  '--headings-h1-font-size',
  '--headings-h2-font-size',
  '--headings-h3-font-size',
  '--headings-h4-font-size',
  '--inline-styles-code-font-size',
  '--table-font-size',
]

function scaleFontSizeVars(vars: Record<string, string>, editorFontSize: number) {
  for (const name of SCALED_FONT_SIZE_VARS) {
    const themeSize = Number.parseFloat(vars[name] ?? '')
    if (Number.isNaN(themeSize)) continue
    vars[name] = `${scaleToEditorFontSize(themeSize, editorFontSize)}px`
  }
}

type ThemeValue = string | number | Record<string, unknown> | unknown[]

function isThemeBranch(value: ThemeValue): value is Record<string, ThemeValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnitlessThemeNumber(key: string, cssKey: string): boolean {
  return /weight|lineHeight|opacity/i.test(key)
    || cssKey.includes('line-height')
    || cssKey.includes('font-weight')
}

function themeCssValue(key: string, cssKey: string, value: string | number): string {
  if (typeof value !== 'number') return String(value)
  if (isUnitlessThemeNumber(key, cssKey)) return String(value)
  return `${value}px`
}

/** Convert a nested theme config object into a flat map of CSS custom properties */
function flattenTheme(
  obj: Record<string, ThemeValue>,
  prefix = '--'
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(obj)) {
    const cssKey = `${prefix}${camelToKebab(key)}`

    if (value === null || value === undefined) continue
    if (Array.isArray(value)) continue // skip arrays (e.g. nestedBulletSymbols)

    if (isThemeBranch(value)) {
      Object.assign(result, flattenTheme(value, `${cssKey}-`))
      continue
    }

    if (typeof value !== 'string' && typeof value !== 'number') continue
    Reflect.set(result, cssKey, themeCssValue(key, cssKey, value))
  }

  return result
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export function useEditorTheme() {
  const editorFont = useEditorFont()
  const editorFontSize = useEditorFontSize()
  const { cssVars, styleString } = useMemo(() => {
    const vars = flattenTheme(themeConfig as Record<string, ThemeValue>)
    vars['--editor-font-family'] = EDITOR_FONT_FAMILIES[editorFont]
    scaleFontSizeVars(vars, editorFontSize)
    const str = Object.entries(vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join('\n')
    return { cssVars: vars, styleString: str }
  }, [editorFont, editorFontSize])

  return { themeConfig, cssVars, styleString }
}
