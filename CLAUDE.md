# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collaborative document editor with a Java/Spring Boot backend and React/TypeScript frontend. Uses Yjs (CRDT) for real-time concurrent editing over WebSockets, Quill as the rich text editor, and OpenHTMLtoPDF with Thymeleaf templates for PDF export.

## Build & Run Commands

### Backend (Spring Boot / Maven)
```bash
cd backend
mvn clean install          # Build
mvn spring-boot:run        # Run on port 8080
mvn test                   # Run tests
mvn test -Dtest=ClassName  # Run a single test class
```

### Frontend (React / Vite / npm)
```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Dev server on port 3000
npm run build        # Production build
npm run preview      # Preview production build
```

### Yjs WebSocket Server (standalone Node.js)
```bash
cd yjs-server
npm install
npm start            # Runs on port 1234
```

### Prerequisites
- Java 17, Maven
- Node.js, npm
- PostgreSQL running on localhost:5432 with database `collab_editor` (user: `albumdb`, password: `albumdb`)

## Architecture

### Communication Flow
- **Real-time sync**: Frontend Quill editors ↔ Yjs CRDT ↔ WebSocket (`/yjs/{documentId}`) ↔ `YjsWebSocketHandler` (binary message relay between clients)
- **Persistence**: Frontend auto-saves (debounced 2s) via REST → `DocumentController` → `DocumentService` → PostgreSQL
- **PDF export**: Frontend collects all editor HTML → `POST /api/pdf/generate` → `PdfController` → `PdfService` (Thymeleaf template + OpenHTMLtoPDF)

### Two-Layer Persistence
Yjs handles in-memory real-time state; PostgreSQL handles durable storage. These are independent — Yjs sync works without the database, and DB saves happen as a side channel.

### Backend Structure (`com.example.collabeditor`)
- `config/` — WebSocket route registration (`/yjs/{documentId}`), CORS config
- `controller/` — `DocumentController` (REST CRUD), `PdfController` (PDF generation)
- `service/` — `YjsWebSocketHandler` (WebSocket relay), `DocumentService` (persistence), `PdfService` (HTML→PDF)
- `model/` — `Document` (JPA entity), `PdfRequest` (DTO)
- `repository/` — `DocumentRepository` (JPA)
- `resources/templates/pdf-document.html` — Thymeleaf template for PDF layout (page headers, footers, section breaks)

### Frontend Structure (`frontend/src/`)
- `App.tsx` — Main component: manages 3 editor instances, user state (name/color), PDF export
- `components/CollaborativeEditor.tsx` — Individual editor: initializes Quill + Yjs binding, WebSocket provider, remote cursors, auto-save
- `api/documents.ts` — REST client for document load/save
- `utils/quillAttributors.ts` — Inline style attributors for font, alignment, indent, color, background (replaces Quill's default class-based attributors)
- `utils/clipboardMatchers.ts` — Clipboard matchers that normalize pasted content (hex colors, font mapping, Word mso-* cleanup, base64 images)

### Vite Dev Proxy
Configured in `vite.config.ts`: `/api` → `http://localhost:8080`, `/yjs` → `ws://localhost:1234`

## Key Technical Details

### Quill Inline Styles (not CSS classes)
All Quill formatting uses inline style attributors (`utils/quillAttributors.ts`) instead of the default class-based attributors. This means Quill outputs `style="font-family: Arial"` instead of `class="ql-font-arial"`. This is critical for PDF fidelity — the HTML Quill produces is directly renderable by OpenHTMLtoPDF without class-to-style translation.

### Clipboard Paste Normalization
`utils/clipboardMatchers.ts` intercepts pasted content and normalizes it:
- Colors are always converted to 6-digit hex (no RGB, RGBA, HSL — CSS2.1 requirement for PDF)
- Fonts are mapped to the supported set (Arial, Georgia, Times New Roman, Verdana, Courier New, serif, sans-serif, monospace)
- Word-specific `mso-*` CSS properties are stripped
- Pasted images are preserved as base64 data URLs
- Matcher signatures follow Quill 2.x convention: `(node: Node, delta: Delta, scroll: ScrollBlot) => Delta`

### PDF Generation Pipeline
1. Frontend sends editor HTML sections → `PdfController`
2. `PdfService` sanitizes HTML via JSoup (safelist, RGB→hex conversion, table border injection, XHTML compliance)
3. Thymeleaf processes `pdf-document.html` template with sanitized sections
4. OpenHTMLtoPDF renders the XHTML to PDF with CSS2.1 paged media support (@page rules, page counters)
5. Base64 data URL images are handled natively by OpenHTMLtoPDF (no custom element factory needed)

### Other Details
- Each editor section is an independent Yjs document (`doc-section-1`, `doc-section-2`, `doc-section-3`)
- Yjs awareness protocol synchronizes user metadata (name, color, cursor) separately from document state
- User colors are randomly assigned per session with automatic conflict detection/reassignment
- User names persist in localStorage
- Custom `IndentStyleAttributor` maps Quill indent levels 1-8 to `padding-left` em values, supporting Quill's `+1`/`-1` increment pattern
