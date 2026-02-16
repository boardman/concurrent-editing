export interface DocumentData {
  id: string
  content: string
}

export async function loadDocument(id: string): Promise<DocumentData> {
  const response = await fetch(`/api/documents/${id}`)
  if (!response.ok) {
    throw new Error(`Failed to load document: ${response.statusText}`)
  }
  return response.json()
}

export async function saveDocument(id: string, content: string): Promise<DocumentData> {
  const response = await fetch(`/api/documents/${id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  })
  if (!response.ok) {
    throw new Error(`Failed to save document: ${response.statusText}`)
  }
  return response.json()
}
