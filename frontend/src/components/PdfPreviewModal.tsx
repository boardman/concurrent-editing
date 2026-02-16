import { useEffect, useRef } from 'react'

interface PdfPreviewModalProps {
  pdfUrl: string
  title: string
  onClose: () => void
}

export default function PdfPreviewModal({ pdfUrl, title, onClose }: PdfPreviewModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div className="pdf-preview-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="pdf-preview-modal">
        <div className="pdf-preview-header">
          <span className="pdf-preview-title">Preview: {title}</span>
          <button className="pdf-preview-close" onClick={onClose} title="Close preview">
            &times;
          </button>
        </div>
        <iframe
          className="pdf-preview-frame"
          src={pdfUrl}
          title={`PDF Preview - ${title}`}
        />
      </div>
    </div>
  )
}
