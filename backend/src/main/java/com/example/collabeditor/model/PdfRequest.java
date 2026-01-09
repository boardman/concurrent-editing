package com.example.collabeditor.model;

import java.util.List;

public record PdfRequest(
        List<EditorContent> editors,
        String customCss
) {
    public record EditorContent(
            String id,
            String title,
            String html
    ) {}
}
