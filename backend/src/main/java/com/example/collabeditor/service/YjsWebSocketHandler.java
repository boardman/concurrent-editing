package com.example.collabeditor.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.BinaryWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class YjsWebSocketHandler extends BinaryWebSocketHandler {

    private static final Logger logger = LoggerFactory.getLogger(YjsWebSocketHandler.class);

    // Map of document ID to set of connected sessions
    private final Map<String, Set<WebSocketSession>> documentSessions = new ConcurrentHashMap<>();

    // Map of session ID to document ID
    private final Map<String, String> sessionDocuments = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String documentId = extractDocumentId(session);
        if (documentId != null) {
            documentSessions.computeIfAbsent(documentId, k -> new CopyOnWriteArraySet<>()).add(session);
            sessionDocuments.put(session.getId(), documentId);
            logger.info("Client connected to document {}: {}", documentId, session.getId());
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws Exception {
        String documentId = sessionDocuments.get(session.getId());
        if (documentId == null) {
            return;
        }

        Set<WebSocketSession> sessions = documentSessions.get(documentId);
        if (sessions == null) {
            return;
        }

        // Broadcast the message to all other clients in the same document
        byte[] payload = message.getPayload().array();
        for (WebSocketSession s : sessions) {
            if (s.isOpen() && !s.getId().equals(session.getId())) {
                try {
                    s.sendMessage(new BinaryMessage(payload));
                } catch (IOException e) {
                    logger.error("Error sending message to session {}: {}", s.getId(), e.getMessage());
                }
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String documentId = sessionDocuments.remove(session.getId());
        if (documentId != null) {
            Set<WebSocketSession> sessions = documentSessions.get(documentId);
            if (sessions != null) {
                sessions.remove(session);
                if (sessions.isEmpty()) {
                    documentSessions.remove(documentId);
                }
            }
            logger.info("Client disconnected from document {}: {}", documentId, session.getId());
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        logger.error("Transport error for session {}: {}", session.getId(), exception.getMessage());
        session.close(CloseStatus.SERVER_ERROR);
    }

    private String extractDocumentId(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) {
            return null;
        }
        String path = uri.getPath();
        // Extract document ID from path like /yjs/{documentId}
        String[] parts = path.split("/");
        if (parts.length >= 3) {
            return parts[2];
        }
        return "default";
    }

    public Set<WebSocketSession> getDocumentSessions(String documentId) {
        return documentSessions.getOrDefault(documentId, Set.of());
    }
}
