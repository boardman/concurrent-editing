import Quill from 'quill'

const Delta = Quill.import('delta') as any

/**
 * Map of common fonts to our supported set.
 * Handles fonts from Word, Google Docs, and other sources.
 */
const FONT_MAP: Record<string, string> = {
  'arial': 'Arial',
  'helvetica': 'Arial',
  'calibri': 'Arial',
  'segoe ui': 'Arial',
  'georgia': 'Georgia',
  'times': 'Times New Roman',
  'times new roman': 'Times New Roman',
  'cambria': 'Georgia',
  'verdana': 'Verdana',
  'courier': 'Courier New',
  'courier new': 'Courier New',
  'consolas': 'Courier New',
  'monaco': 'Courier New',
  'lucida console': 'Courier New',
  'serif': 'serif',
  'sans-serif': 'sans-serif',
  'monospace': 'monospace',
}

/**
 * Returns clipboard matchers for Quill that:
 * - Normalize colors to hex format
 * - Map fonts to supported set
 * - Strip Word-specific mso-* styles
 * - Handle pasted images
 */
export function getClipboardMatchers(): Array<[string | number, (node: Node, delta: any, scroll: any) => any]> {
  return [
    [Node.ELEMENT_NODE, normalizeFormats],
    ['img', handlePastedImage],
  ]
}

/**
 * Post-process pasted content to normalize formatting:
 * - Convert all colors to hex (no rgb/rgba/hsl)
 * - Map fonts to our supported set
 * - Strip Word-specific mso-* CSS properties
 */
function normalizeFormats(node: Node, delta: any, _scroll: any): any {
  if (!(node instanceof HTMLElement)) return delta

  // Strip mso-* styles from Word pastes
  const style = node.getAttribute('style')
  if (style && style.includes('mso-')) {
    const cleaned = style.replace(/mso-[^;:]+:[^;]+;?\s*/gi, '')
    node.setAttribute('style', cleaned)
  }

  // Normalize colors and fonts in delta ops
  if (delta && delta.ops) {
    for (const op of delta.ops) {
      if (!op.attributes) continue

      if (op.attributes.color) {
        op.attributes.color = normalizeToHex(op.attributes.color)
      }
      if (op.attributes.background) {
        op.attributes.background = normalizeToHex(op.attributes.background)
      }
      if (op.attributes.font) {
        op.attributes.font = normalizeFontFamily(op.attributes.font)
      }
    }
  }

  return delta
}

/**
 * Handle pasted images - preserve base64 data URLs and external URLs.
 */
function handlePastedImage(node: Node, delta: any, _scroll: any): any {
  if (!(node instanceof HTMLImageElement)) return delta

  const src = node.getAttribute('src')
  if (!src) return delta

  // Keep data URLs and external URLs as-is
  return new Delta().insert({ image: src })
}

/**
 * Convert any CSS color format to hex.
 * Handles: rgb(), rgba(), hsl(), hsla(), named colors.
 * Returns hex format (#rrggbb) for CSS2.1/PDF compatibility.
 */
export function normalizeToHex(color: string): string {
  if (!color) return color

  const trimmed = color.trim()

  // Expand 3-digit hex to 6-digit hex
  const hex3Match = trimmed.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)
  if (hex3Match) {
    return `#${hex3Match[1]}${hex3Match[1]}${hex3Match[2]}${hex3Match[2]}${hex3Match[3]}${hex3Match[3]}`
  }

  // Already 6-digit hex - return as-is
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed
  }

  // Parse rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbMatch) {
    return rgbToHex(
      parseInt(rgbMatch[1], 10),
      parseInt(rgbMatch[2], 10),
      parseInt(rgbMatch[3], 10)
    )
  }

  // Use browser computed style for hsl, named colors, etc.
  const div = document.createElement('div')
  try {
    div.style.color = color
    document.body.appendChild(div)
    const computed = getComputedStyle(div).color

    const match = computed.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (match) {
      return rgbToHex(
        parseInt(match[1], 10),
        parseInt(match[2], 10),
        parseInt(match[3], 10)
      )
    }
  } catch {
    // Fallback: return original
  } finally {
    div.remove()
  }

  return color
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.floor(v)))
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`
}

/**
 * Map a font-family string to our supported font set.
 * Takes the primary font from a font stack and maps to closest match.
 */
function normalizeFontFamily(font: string): string {
  if (!font) return font
  const primary = font.toLowerCase().replace(/['"]/g, '').split(',')[0].trim()
  if (FONT_MAP[primary]) return FONT_MAP[primary]
  // Fallback: categorize by font name keywords
  if (primary.includes('mono') || primary.includes('courier') || primary.includes('console')) return 'Courier New'
  if (primary.includes('times') || primary.includes('garamond')) return 'Times New Roman'
  return 'Arial'
}
