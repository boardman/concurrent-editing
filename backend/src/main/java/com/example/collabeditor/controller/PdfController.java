package com.example.collabeditor.controller;

import com.example.collabeditor.model.PdfRequest;
import com.example.collabeditor.service.PdfService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pdf")
@CrossOrigin(origins = "*")
public class PdfController {

    private static final Logger log = LoggerFactory.getLogger(PdfController.class);

    private final PdfService pdfService;

    public PdfController(PdfService pdfService) {
        this.pdfService = pdfService;
    }

    @PostMapping("/generate")
    public ResponseEntity<byte[]> generatePdf(@RequestBody PdfRequest request) {
        try {
            List<PdfService.EditorSection> sections = request.editors().stream()
                    .map(e -> new PdfService.EditorSection(e.id(), e.title(), e.html()))
                    .toList();

            byte[] pdfBytes = pdfService.generatePdf(sections, null, request.customCss());

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment", "document.pdf");
            headers.setContentLength(pdfBytes.length);

            return ResponseEntity.ok()
                    .headers(headers)
                    .body(pdfBytes);

        } catch (Exception e) {
            log.error("PDF generation failed", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/generate-single")
    public ResponseEntity<byte[]> generateSinglePdf(
            @RequestParam(required = false) String title,
            @RequestBody String htmlContent) {
        try {
            List<PdfService.EditorSection> sections = List.of(
                    new PdfService.EditorSection("single", title != null ? title : "Document", htmlContent)
            );

            byte[] pdfBytes = pdfService.generatePdf(sections, title, null);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment", "document.pdf");
            headers.setContentLength(pdfBytes.length);

            return ResponseEntity.ok()
                    .headers(headers)
                    .body(pdfBytes);

        } catch (Exception e) {
            log.error("PDF generation failed", e);
            return ResponseEntity.internalServerError().build();
        }
    }
}
