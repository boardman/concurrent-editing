package com.example.collabeditor.controller;

import com.example.collabeditor.model.PdfRequest;
import com.example.collabeditor.service.PdfService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/pdf")
@CrossOrigin(origins = "*")
public class PdfController {

    private final PdfService pdfService;

    public PdfController(PdfService pdfService) {
        this.pdfService = pdfService;
    }

    @PostMapping("/generate")
    public ResponseEntity<byte[]> generatePdf(@RequestBody PdfRequest request) {
        try {
            // Combine all editor contents with section breaks
            StringBuilder combinedHtml = new StringBuilder();

            for (int i = 0; i < request.editors().size(); i++) {
                PdfRequest.EditorContent editor = request.editors().get(i);

                if (editor.title() != null && !editor.title().isEmpty()) {
                    combinedHtml.append("<h2>").append(escapeHtml(editor.title())).append("</h2>\n");
                }

                combinedHtml.append("<div class=\"editor-section\">\n");
                combinedHtml.append(editor.html());
                combinedHtml.append("\n</div>\n");

                // Add page break between sections (except after the last one)
                if (i < request.editors().size() - 1) {
                    combinedHtml.append("<div style=\"page-break-after: always;\"></div>\n");
                }
            }

            byte[] pdfBytes = pdfService.generatePdf(combinedHtml.toString(), request.customCss());

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment", "document.pdf");
            headers.setContentLength(pdfBytes.length);

            return ResponseEntity.ok()
                    .headers(headers)
                    .body(pdfBytes);

        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/generate-single")
    public ResponseEntity<byte[]> generateSinglePdf(
            @RequestParam(required = false) String title,
            @RequestBody String htmlContent) {
        try {
            StringBuilder html = new StringBuilder();
            if (title != null && !title.isEmpty()) {
                html.append("<h1>").append(escapeHtml(title)).append("</h1>\n");
            }
            html.append(htmlContent);

            byte[] pdfBytes = pdfService.generatePdf(html.toString(), null);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment", "document.pdf");
            headers.setContentLength(pdfBytes.length);

            return ResponseEntity.ok()
                    .headers(headers)
                    .body(pdfBytes);

        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    private String escapeHtml(String text) {
        return text
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
