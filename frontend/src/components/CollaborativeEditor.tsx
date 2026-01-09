import { useEffect, useRef, useCallback, useState } from 'react'
import Quill from 'quill'
import * as Y from 'yjs'
import { QuillBinding } from 'y-quill'
import { WebsocketProvider } from 'y-websocket'
import QuillCursors from 'quill-cursors'
import { getUnusedColor } from '../App'
import 'quill/dist/quill.snow.css'

// Register the cursors module
Quill.register('modules/cursors', QuillCursors)

interface User {
  clientId: number
  name: string
  color: string
}

interface CollaborativeEditorProps {
  documentId: string
  title: string
  userName: string
  userColor: string
  onRegister: (id: string, title: string, getHtml: () => string) => void
  onConnectionChange: (status: 'connecting' | 'connected' | 'disconnected') => void
  onColorChange: (newColor: string) => void
}

// Configure Quill to output HTML5/CSS2.1 compliant markup
const configureQuillFormats = () => {
  const Block = Quill.import('blots/block') as typeof import('parchment').BlockBlot

  class ParagraphBlot extends Block {
    static blotName = 'paragraph'
    static tagName = 'p'
  }

  Quill.register(ParagraphBlot, true)
}

configureQuillFormats()

// Toolbar configuration with custom table button
const toolbarOptions = {
  container: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],
    [{ 'align': [] }],
    ['blockquote', 'code-block'],
    ['link'],
    ['table'],  // Custom table button
    ['clean']
  ],
  handlers: {
    // Table handler will be set after Quill initialization
  }
}

export default function CollaborativeEditor({
  documentId,
  title,
  userName,
  userColor,
  onRegister,
  onConnectionChange,
  onColorChange
}: CollaborativeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const quillRef = useRef<Quill | null>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)
  const bindingRef = useRef<QuillBinding | null>(null)
  const cursorsRef = useRef<QuillCursors | null>(null)
  const initializedRef = useRef(false)
  const colorCheckedRef = useRef(false)

  const [activeUsers, setActiveUsers] = useState<User[]>([])

  // Function to get clean HTML from the editor
  const getHtml = useCallback(() => {
    if (!quillRef.current) return ''
    const html = quillRef.current.root.innerHTML
    return cleanHtmlForPdf(html)
  }, [])

  // Register this editor with the parent
  useEffect(() => {
    onRegister(documentId, title, getHtml)
  }, [documentId, title, getHtml, onRegister])

  // Update awareness when userName/userColor changes
  useEffect(() => {
    if (providerRef.current && userName && userColor) {
      providerRef.current.awareness.setLocalStateField('user', {
        name: userName,
        color: userColor
      })
    }
  }, [userName, userColor])

  // Initialize Quill and Yjs
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return
    initializedRef.current = true

    // Create a fresh div for Quill to use
    const editorDiv = document.createElement('div')
    containerRef.current.appendChild(editorDiv)
    editorRef.current = editorDiv

    // Create Quill instance with cursors and table modules
    const quill = new Quill(editorDiv, {
      theme: 'snow',
      modules: {
        toolbar: toolbarOptions,
        history: {
          userOnly: true
        },
        cursors: {
          transformOnTextChange: true
        },
        table: true
      },
      placeholder: 'Start typing...',
      formats: [
        'header',
        'bold', 'italic', 'underline', 'strike',
        'color', 'background',
        'list', 'indent', 'align',
        'blockquote', 'code-block',
        'link',
        'table', 'table-body', 'table-row', 'table-cell'
      ]
    })

    quillRef.current = quill
    cursorsRef.current = quill.getModule('cursors') as QuillCursors

    // Add custom table handler
    const toolbar = quill.getModule('toolbar')
    toolbar.addHandler('table', () => {
      const tableModule = quill.getModule('table')
      if (tableModule) {
        tableModule.insertTable(3, 3)  // Insert 3x3 table by default
      }
    })

    // Create Yjs document
    const ydoc = new Y.Doc()
    ydocRef.current = ydoc

    // Connect to WebSocket server
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${window.location.host}/yjs`

    const provider = new WebsocketProvider(wsUrl, documentId, ydoc)
    providerRef.current = provider

    // Handle connection status
    provider.on('status', (event: { status: string }) => {
      if (event.status === 'connected') {
        onConnectionChange('connected')
      } else if (event.status === 'disconnected') {
        onConnectionChange('disconnected')
      } else {
        onConnectionChange('connecting')
      }
    })

    // Get the shared text type
    const ytext = ydoc.getText('quill')

    // Bind Quill to Yjs (without awareness to avoid cursor conflicts)
    const binding = new QuillBinding(ytext, quill)
    bindingRef.current = binding

    // Set local user awareness
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor
    })

    // Track local cursor position and broadcast via awareness
    const sendCursorPosition = () => {
      const selection = quill.getSelection()
      if (selection) {
        provider.awareness.setLocalStateField('cursor', {
          index: selection.index,
          length: selection.length
        })
      }
    }

    // Send cursor position on selection change (debounced slightly)
    let cursorTimeout: ReturnType<typeof setTimeout> | null = null
    quill.on('selection-change', (range, _oldRange, source) => {
      if (source === 'user' && range) {
        if (cursorTimeout) clearTimeout(cursorTimeout)
        cursorTimeout = setTimeout(sendCursorPosition, 10)
      }
    })

    // Also send cursor position after text changes
    quill.on('text-change', (_delta, _oldDelta, source) => {
      if (source === 'user') {
        if (cursorTimeout) clearTimeout(cursorTimeout)
        cursorTimeout = setTimeout(sendCursorPosition, 10)
      }
    })

    // Track which remote cursors we've created
    const remoteCursors = new Set<string>()

    // Handle awareness changes - update user list and remote cursors
    const updateAwareness = () => {
      const states = provider.awareness.getStates()
      const users: User[] = []
      const cursors = cursorsRef.current
      const currentClientId = provider.awareness.clientID
      const otherUsersColors: string[] = []

      states.forEach((state, clientId) => {
        // Skip our own cursor
        if (clientId === currentClientId) return

        if (state.user) {
          users.push({
            clientId,
            name: state.user.name,
            color: state.user.color
          })
          otherUsersColors.push(state.user.color)

          // Update remote cursor
          if (cursors && state.cursor) {
            const cursorId = clientId.toString()

            if (!remoteCursors.has(cursorId)) {
              cursors.createCursor(cursorId, state.user.name, state.user.color)
              remoteCursors.add(cursorId)
            }

            cursors.moveCursor(cursorId, {
              index: state.cursor.index,
              length: state.cursor.length
            })
          }
        }
      })

      // Check for color conflict on first awareness update with other users
      if (!colorCheckedRef.current && otherUsersColors.length > 0) {
        colorCheckedRef.current = true
        if (otherUsersColors.includes(userColor)) {
          // Our color is already in use, pick a new one
          const newColor = getUnusedColor(otherUsersColors)
          onColorChange(newColor)
          // Update awareness with new color
          provider.awareness.setLocalStateField('user', {
            name: userName,
            color: newColor
          })
        }
      }

      // Remove cursors for disconnected users
      if (cursors) {
        remoteCursors.forEach(cursorId => {
          const clientId = parseInt(cursorId)
          if (!states.has(clientId)) {
            cursors.removeCursor(cursorId)
            remoteCursors.delete(cursorId)
          }
        })
      }

      setActiveUsers(users)
    }

    provider.awareness.on('change', updateAwareness)

    // Initial update
    updateAwareness()

    // Cleanup on unmount
    return () => {
      if (cursorTimeout) clearTimeout(cursorTimeout)
      provider.awareness.off('change', updateAwareness)
      binding.destroy()
      provider.disconnect()
      ydoc.destroy()

      // Clean up Quill DOM elements
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }

      quillRef.current = null
      ydocRef.current = null
      providerRef.current = null
      bindingRef.current = null
      cursorsRef.current = null
      editorRef.current = null
      initializedRef.current = false
      colorCheckedRef.current = false
    }
  }, [documentId, onConnectionChange, onColorChange, userName, userColor])

  return (
    <div className="editor-wrapper">
      <div className="editor-header">
        <span className="editor-title">{title}</span>
        <div className="active-users">
          {activeUsers.length > 0 && (
            <>
              <span className="users-label">Editing:</span>
              <div className="user-avatars">
                {activeUsers.map((user) => (
                  <div
                    key={user.clientId}
                    className="user-avatar"
                    style={{ backgroundColor: user.color }}
                    title={user.name}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="editor-container">
        <div ref={containerRef}></div>
      </div>
    </div>
  )
}

// Clean HTML to be compatible with Flying Saucer (HTML5/CSS2.1)
function cleanHtmlForPdf(html: string): string {
  const temp = document.createElement('div')
  temp.innerHTML = html
  processElement(temp)
  return temp.innerHTML
}

function processElement(element: Element): void {
  Array.from(element.children).forEach(child => {
    processElement(child)
  })

  if (element.classList.contains('ql-align-center')) {
    (element as HTMLElement).style.textAlign = 'center'
  }
  if (element.classList.contains('ql-align-right')) {
    (element as HTMLElement).style.textAlign = 'right'
  }
  if (element.classList.contains('ql-align-justify')) {
    (element as HTMLElement).style.textAlign = 'justify'
  }

  for (let i = 1; i <= 8; i++) {
    if (element.classList.contains(`ql-indent-${i}`)) {
      (element as HTMLElement).style.paddingLeft = `${i * 3}em`
    }
  }

  const style = (element as HTMLElement).style
  if (style.color && style.color.includes('rgb')) {
    style.color = rgbToHex(style.color)
  }
  if (style.backgroundColor && style.backgroundColor.includes('rgb')) {
    style.backgroundColor = rgbToHex(style.backgroundColor)
  }

  if (element.classList.contains('ql-code-block-container')) {
    const pre = document.createElement('pre')
    pre.innerHTML = element.innerHTML
    element.parentNode?.replaceChild(pre, element)
  }
}

function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (!match) return rgb

  const r = parseInt(match[1])
  const g = parseInt(match[2])
  const b = parseInt(match[3])

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}
