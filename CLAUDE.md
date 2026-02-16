# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collaborative document editor with a Java/Spring Boot backend and React/TypeScript frontend. Uses Yjs (CRDT) for real-time concurrent editing over WebSockets, Quill as the rich text editor, and Flying Saucer for PDF export.

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
- **PDF export**: Frontend collects all editor HTML → `POST /api/pdf/generate` → `PdfService` (Flying Saucer, converts Quill HTML to XHTML/CSS2.1)

### Two-Layer Persistence
Yjs handles in-memory real-time state; PostgreSQL handles durable storage. These are independent — Yjs sync works without the database, and DB saves happen as a side channel.

### Backend Structure (`com.example.collabeditor`)
- `config/` — WebSocket route registration (`/yjs/{documentId}`), CORS config
- `controller/` — `DocumentController` (REST CRUD), `PdfController` (PDF generation)
- `service/` — `YjsWebSocketHandler` (WebSocket relay), `DocumentService` (persistence), `PdfService` (HTML→PDF)
- `model/` — `Document` (JPA entity), `PdfRequest` (DTO)
- `repository/` — `DocumentRepository` (JPA)

### Frontend Structure (`frontend/src/`)
- `App.tsx` — Main component: manages 3 editor instances, user state (name/color), PDF export
- `components/CollaborativeEditor.tsx` — Individual editor: initializes Quill + Yjs binding, WebSocket provider, remote cursors, auto-save
- `api/documents.ts` — REST client for document load/save

### Vite Dev Proxy
Configured in `vite.config.ts`: `/api` → `http://localhost:8080`, `/yjs` → `ws://localhost:1234`

## Key Technical Details

- Each editor section is an independent Yjs document (`doc-section-1`, `doc-section-2`, `doc-section-3`)
- Yjs awareness protocol synchronizes user metadata (name, color, cursor) separately from document state
- `PdfService` converts Quill's class-based styles to inline CSS2.1 for Flying Saucer compatibility
- Base64 images are handled via a custom `ReplacedElementFactory` in the PDF pipeline
- User colors are randomly assigned per session with automatic conflict detection/reassignment
- User names persist in localStorage
