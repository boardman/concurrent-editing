import { useEffect, useRef, useCallback, useState } from 'react'
import Quill from 'quill'
import * as Y from 'yjs'
import { QuillBinding } from 'y-quill'
import { WebsocketProvider } from 'y-websocket'
import QuillCursors from 'quill-cursors'
import { getUnusedColor } from '../App'
import { loadDocument, saveDocument } from '../api/documents'
import { registerInlineStyleAttributors } from '../utils/quillAttributors'
import { getClipboardMatchers } from '../utils/clipboardMatchers'
import PdfPreviewModal from './PdfPreviewModal'
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

// Configure Quill to output HTML5/CSS2.1 compliant markup with inline styles
const configureQuillFormats = () => {
  const Block = Quill.import('blots/block') as typeof import('parchment').BlockBlot

  class ParagraphBlot extends Block {
    static blotName = 'paragraph'
    static tagName = 'p'
  }

  Quill.register(ParagraphBlot, true)

  // Register inline style attributors (replaces class-based ql-font-*, ql-align-*, etc.)
  registerInlineStyleAttributors()
}

configureQuillFormats()

// Toolbar configuration - table button will be added manually
const toolbarOptions = {
  container: [
    [{ 'font': ['serif', 'sans-serif', 'monospace', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'] }],
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],
    [{ 'align': [] }],
    ['blockquote', 'code-block'],
    ['link', 'image'],
    ['clean']
  ]
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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const previewUrlRef = useRef<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedContentRef = useRef<string>('')

  // Function to get HTML from the editor for PDF export
  const getHtml = useCallback(() => {
    if (!quillRef.current) return ''
    return quillRef.current.root.innerHTML
  }, [])

  // Generate a single-section PDF preview
  const handlePreview = useCallback(async () => {
    if (!quillRef.current || isPreviewing) return
    setIsPreviewing(true)
    try {
      const html = quillRef.current.root.innerHTML
      const response = await fetch(`/api/pdf/generate-single?title=${encodeURIComponent(title)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/html' },
        body: html
      })
      if (!response.ok) throw new Error('Failed to generate preview')
      const blob = await response.blob()
      setPreviewUrl(oldUrl => {
        if (oldUrl) URL.revokeObjectURL(oldUrl)
        return URL.createObjectURL(blob)
      })
    } catch (error) {
      console.error('Error generating preview:', error)
      alert('Failed to generate PDF preview.')
    } finally {
      setIsPreviewing(false)
    }
  }, [title, isPreviewing])

  const closePreview = useCallback(() => {
    setPreviewUrl(currentUrl => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      return null
    })
  }, [])

  // Keep ref in sync for unmount cleanup
  useEffect(() => {
    previewUrlRef.current = previewUrl
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [previewUrl])

  // Function to save document to database
  const saveToDatabase = useCallback(async () => {
    if (!quillRef.current) return

    const currentContent = quillRef.current.root.innerHTML

    // Skip if content hasn't changed
    if (currentContent === lastSavedContentRef.current) {
      return
    }

    setSaveStatus('saving')
    try {
      await saveDocument(documentId, currentContent)
      lastSavedContentRef.current = currentContent
      setSaveStatus('saved')
    } catch (error) {
      console.error('Failed to save document:', error)
      setSaveStatus('unsaved')
    }
  }, [documentId])

  // Debounced auto-save function
  const scheduleAutoSave = useCallback(() => {
    setSaveStatus('unsaved')
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveToDatabase()
    }, 2000) // Save 2 seconds after last change
  }, [saveToDatabase])

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

    // Create Quill instance with cursors, table, and clipboard modules
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
        table: true,
        clipboard: {
          matchers: getClipboardMatchers()
        }
      },
      placeholder: 'Start typing...',
      formats: [
        'font', 'header',
        'bold', 'italic', 'underline', 'strike',
        'color', 'background',
        'list', 'indent', 'align',
        'blockquote', 'code-block',
        'link', 'image',
        'table', 'table-body', 'table-row', 'table-cell'
      ]
    })

    quillRef.current = quill
    cursorsRef.current = quill.getModule('cursors') as QuillCursors

    // Add custom table button to toolbar
    const toolbarElement = containerRef.current?.querySelector('.ql-toolbar')
    if (toolbarElement) {
      // Find the clean button and insert table button before it
      const cleanButton = toolbarElement.querySelector('.ql-clean')
      if (cleanButton && cleanButton.parentElement) {
        const tableButtonContainer = document.createElement('span')
        tableButtonContainer.className = 'ql-formats'

        const tableButton = document.createElement('button')
        tableButton.type = 'button'
        tableButton.className = 'ql-table-insert'
        tableButton.title = 'Insert Table'

        tableButton.addEventListener('click', () => {
          quill.focus()
          const tableModule = quill.getModule('table') as { insertTable?: (rows: number, cols: number) => void }
          if (tableModule && typeof tableModule.insertTable === 'function') {
            tableModule.insertTable(3, 3)
          } else {
            // Fallback: insert table HTML directly
            const range = quill.getSelection(true)
            if (range) {
              const tableHtml = `
                <table>
                  <tbody>
                    <tr><td><br></td><td><br></td><td><br></td></tr>
                    <tr><td><br></td><td><br></td><td><br></td></tr>
                    <tr><td><br></td><td><br></td><td><br></td></tr>
                  </tbody>
                </table>
              `
              quill.clipboard.dangerouslyPasteHTML(range.index, tableHtml)
            }
          }
        })

        tableButtonContainer.appendChild(tableButton)
        cleanButton.parentElement.parentElement?.insertBefore(
          tableButtonContainer,
          cleanButton.parentElement
        )
      }
    }

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

    // Load initial content from database when provider syncs
    provider.on('sync', async (isSynced: boolean) => {
      if (isSynced && ytext.length === 0) {
        // Yjs document is empty, try to load from database
        try {
          const docData = await loadDocument(documentId)
          if (docData.content && docData.content.trim() !== '' && docData.content !== '<p><br></p>') {
            // Insert saved content into the empty Yjs document
            quill.clipboard.dangerouslyPasteHTML(docData.content)
            lastSavedContentRef.current = docData.content
          }
        } catch (error) {
          console.error('Failed to load document from database:', error)
        }
      } else if (isSynced && ytext.length > 0) {
        // Document already has content from Yjs, update lastSavedContent
        lastSavedContentRef.current = quill.root.innerHTML
      }
    })

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

    // Also send cursor position after text changes and trigger auto-save
    quill.on('text-change', (_delta, _oldDelta, source) => {
      if (source === 'user') {
        if (cursorTimeout) clearTimeout(cursorTimeout)
        cursorTimeout = setTimeout(sendCursorPosition, 10)
      }
      // Trigger auto-save on any text change (including from Yjs sync)
      scheduleAutoSave()
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
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
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
  }, [documentId, onConnectionChange, onColorChange, userName, userColor, scheduleAutoSave])

  return (
    <div className="editor-wrapper">
      <div className="editor-header">
        <span className="editor-title">{title}</span>
        <button
          className="preview-btn"
          onClick={handlePreview}
          disabled={isPreviewing}
          title="Preview as PDF"
        >
          {isPreviewing ? 'Loading...' : 'Preview'}
        </button>
        <div className="editor-status">
          <span className={`save-status ${saveStatus}`}>
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'unsaved' && 'Unsaved'}
          </span>
        </div>
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
      {previewUrl && (
        <PdfPreviewModal pdfUrl={previewUrl} title={title} onClose={closePreview} />
      )}
    </div>
  )
}

