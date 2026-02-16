package com.example.collabeditor.controller;

import com.example.collabeditor.model.Document;
import com.example.collabeditor.service.DocumentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @GetMapping("/{id}")
    public ResponseEntity<DocumentResponse> getDocument(@PathVariable String id) {
        return documentService.getDocument(id)
                .map(doc -> ResponseEntity.ok(new DocumentResponse(doc.getId(), doc.getContent())))
                .orElse(ResponseEntity.ok(new DocumentResponse(id, "")));
    }

    @PostMapping("/{id}")
    public ResponseEntity<DocumentResponse> saveDocument(
            @PathVariable String id,
            @RequestBody SaveDocumentRequest request) {
        Document saved = documentService.saveDocument(id, request.content());
        return ResponseEntity.ok(new DocumentResponse(saved.getId(), saved.getContent()));
    }

    public record DocumentResponse(String id, String content) {}

    public record SaveDocumentRequest(String content) {}
}
