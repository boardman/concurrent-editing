import { useState, useCallback, useEffect } from 'react'
import CollaborativeEditor from './components/CollaborativeEditor'

interface EditorData {
  id: string
  title: string
  getHtml: () => string
}

// Primary color palette for clear distinction between users
export const USER_COLORS = [
  '#E53935', // Red
  '#1E88E5', // Blue
  '#43A047', // Green
  '#FB8C00', // Orange
  '#8E24AA', // Purple
  '#00ACC1', // Cyan
  '#FFB300', // Amber
  '#D81B60', // Pink
  '#3949AB', // Indigo
  '#00897B', // Teal
]

// Get an unused color from the palette
export function getUnusedColor(usedColors: string[]): string {
  const availableColors = USER_COLORS.filter(c => !usedColors.includes(c))
  if (availableColors.length > 0) {
    return availableColors[Math.floor(Math.random() * availableColors.length)]
  }
  // All colors in use, return a random one
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
}

function generateUserColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
}

// Generate a default user name
function generateDefaultName(): string {
  const adjectives = ['Swift', 'Bright', 'Clever', 'Quick', 'Sharp', 'Bold', 'Keen', 'Wise']
  const nouns = ['Editor', 'Writer', 'Author', 'Scribe', 'Creator', 'Maker', 'Crafter']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return `${adj} ${noun}`
}

function App() {
  const [editors, setEditors] = useState<EditorData[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [userName, setUserName] = useState<string>('')
  const [userColor, setUserColor] = useState<string>('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState('')

  // Initialize user info - name from localStorage, color randomly per session
  useEffect(() => {
    // Restore name from localStorage or generate new
    const storedName = localStorage.getItem('collab-user-name')
    if (storedName) {
      setUserName(storedName)
    } else {
      const newName = generateDefaultName()
      setUserName(newName)
      localStorage.setItem('collab-user-name', newName)
    }

    // Always generate a fresh random color for each session
    const newColor = generateUserColor()
    setUserColor(newColor)
  }, [])

  const handleNameEdit = () => {
    setTempName(userName)
    setIsEditingName(true)
  }

  const handleNameSave = () => {
    if (tempName.trim()) {
      setUserName(tempName.trim())
      localStorage.setItem('collab-user-name', tempName.trim())
    }
    setIsEditingName(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave()
    } else if (e.key === 'Escape') {
      setIsEditingName(false)
    }
  }

  const registerEditor = useCallback((id: string, title: string, getHtml: () => string) => {
    setEditors(prev => {
      const existing = prev.find(e => e.id === id)
      if (existing) {
        return prev.map(e => e.id === id ? { id, title, getHtml } : e)
      }
      return [...prev, { id, title, getHtml }]
    })
  }, [])

  const handleExportPdf = async () => {
    if (editors.length === 0) return

    setIsExporting(true)
    try {
      const editorContents = editors.map(editor => ({
        id: editor.id,
        title: editor.title,
        html: editor.getHtml()
      }))

      const response = await fetch('/api/pdf/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          editors: editorContents,
          customCss: null
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'document.pdf'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleConnectionChange = useCallback((status: 'connecting' | 'connected' | 'disconnected') => {
    setConnectionStatus(status)
  }, [])

  const handleColorChange = useCallback((newColor: string) => {
    setUserColor(newColor)
  }, [])

  // Don't render editors until user info is ready
  if (!userName || !userColor) {
    return <div className="app loading">Loading...</div>
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Collaborative Document Editor</h1>
        <div className="header-actions">
          <div className="user-info">
            <span
              className="user-color-indicator"
              style={{ backgroundColor: userColor }}
            ></span>
            {isEditingName ? (
              <input
                type="text"
                className="user-name-input"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={handleNameKeyDown}
                autoFocus
                maxLength={20}
              />
            ) : (
              <span className="user-name" onClick={handleNameEdit} title="Click to edit">
                {userName}
              </span>
            )}
          </div>
          <div className="connection-status">
            <span className={`status-indicator ${connectionStatus}`}></span>
            <span>{connectionStatus === 'connected' ? 'Connected' :
                   connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}</span>
          </div>
          <button
            className="export-btn"
            onClick={handleExportPdf}
            disabled={isExporting || editors.length === 0}
          >
            {isExporting ? 'Exporting...' : 'Export to PDF'}
          </button>
        </div>
      </header>

      <div className="editors-container">
        <CollaborativeEditor
          documentId="doc-section-1"
          title="Section 1"
          userName={userName}
          userColor={userColor}
          onRegister={registerEditor}
          onConnectionChange={handleConnectionChange}
          onColorChange={handleColorChange}
        />
        <CollaborativeEditor
          documentId="doc-section-2"
          title="Section 2"
          userName={userName}
          userColor={userColor}
          onRegister={registerEditor}
          onConnectionChange={handleConnectionChange}
          onColorChange={handleColorChange}
        />
        <CollaborativeEditor
          documentId="doc-section-3"
          title="Section 3"
          userName={userName}
          userColor={userColor}
          onRegister={registerEditor}
          onConnectionChange={handleConnectionChange}
          onColorChange={handleColorChange}
        />
      </div>
    </div>
  )
}

export default App
