package com.example.collabeditor.service;

import com.example.collabeditor.model.Document;
import com.example.collabeditor.repository.DocumentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class DocumentService {

    private final DocumentRepository documentRepository;

    public DocumentService(DocumentRepository documentRepository) {
        this.documentRepository = documentRepository;
    }

    @Transactional
    public Document saveDocument(String id, String content) {
        Optional<Document> existing = documentRepository.findById(id);

        if (existing.isPresent()) {
            Document doc = existing.get();
            doc.setContent(content);
            return documentRepository.save(doc);
        } else {
            Document doc = new Document(id, content);
            return documentRepository.save(doc);
        }
    }

    @Transactional(readOnly = true)
    public Optional<Document> getDocument(String id) {
        return documentRepository.findById(id);
    }

    @Transactional(readOnly = true)
    public String getDocumentContent(String id) {
        return documentRepository.findById(id)
                .map(Document::getContent)
                .orElse("");
    }
}
