import Quill from 'quill'

const Parchment = Quill.import('parchment') as any

/**
 * Custom indent style attributor that maps indent levels (1-8)
 * to padding-left em values for CSS2.1 compatibility.
 */
class IndentStyleAttributor extends Parchment.StyleAttributor {
  constructor(attrName: string, keyName: string, options: any) {
    super(attrName, keyName, options)
  }

  add(node: HTMLElement, value: string | number): boolean {
    let indent: number
    if (value === '+1' || value === '-1') {
      const current = this.value(node) || 0
      indent = current + (value === '+1' ? 1 : -1)
    } else {
      indent = typeof value === 'string' ? parseInt(value, 10) : value
    }

    if (indent <= 0) {
      this.remove(node)
      return true
    }
    if (indent > 8) indent = 8

    node.style.paddingLeft = `${indent * 3}em`
    return true
  }

  canAdd(_node: HTMLElement, _value: string | number): boolean {
    return true
  }

  value(node: HTMLElement): number | undefined {
    const paddingLeft = node.style.paddingLeft
    if (!paddingLeft) return undefined
    const em = parseFloat(paddingLeft)
    if (isNaN(em) || em <= 0) return undefined
    return Math.round(em / 3)
  }
}

/**
 * Register inline style attributors for Quill.
 * Replaces class-based attributors (ql-font-*, ql-align-*, ql-indent-*)
 * with inline styles for better PDF rendering fidelity.
 */
export function registerInlineStyleAttributors() {
  // Font: inline style="font-family: ..." instead of class="ql-font-*"
  const FontStyle = Quill.import('attributors/style/font') as any
  FontStyle.whitelist = null // Allow any font-family for paste flexibility
  Quill.register(FontStyle, true)

  // Alignment: inline style="text-align: ..." instead of class="ql-align-*"
  const AlignStyle = Quill.import('attributors/style/align') as any
  AlignStyle.whitelist = ['center', 'right', 'justify']
  Quill.register(AlignStyle, true)

  // Indent: custom style attributor mapping levels to padding-left em values
  const IndentStyle = new IndentStyleAttributor('indent', 'padding-left', {
    scope: Parchment.Scope.BLOCK,
    whitelist: null,
  })
  Quill.register(IndentStyle, true)

  // Color and Background: ensure style-based attributors are active
  const ColorStyle = Quill.import('attributors/style/color') as any
  Quill.register(ColorStyle, true)

  const BackgroundStyle = Quill.import('attributors/style/background') as any
  Quill.register(BackgroundStyle, true)
}
