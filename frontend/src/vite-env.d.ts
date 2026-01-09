/// <reference types="vite/client" />

declare module 'y-quill' {
  import type Quill from 'quill'
  import type * as Y from 'yjs'
  import type { Awareness } from 'y-protocols/awareness'

  export class QuillBinding {
    constructor(type: Y.Text, quill: Quill, awareness?: Awareness)
    destroy(): void
  }
}

declare module 'quill-cursors' {
  import type Quill from 'quill'

  interface Range {
    index: number
    length: number
  }

  interface CursorsOptions {
    template?: string
    containerClass?: string
    hideDelayMs?: number
    hideSpeedMs?: number
    selectionChangeSource?: string | null
    transformOnTextChange?: boolean
  }

  class QuillCursors {
    constructor(quill: Quill, options?: CursorsOptions)
    createCursor(id: string, name: string, color: string): void
    moveCursor(id: string, range: Range): void
    removeCursor(id: string): void
    clearCursors(): void
    toggleFlag(id: string, shouldShow: boolean): void
    update(): void
  }

  export default QuillCursors
}
