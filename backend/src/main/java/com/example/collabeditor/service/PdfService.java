package com.example.collabeditor.service;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Entities;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class PdfService {

    private final TemplateEngine templateEngine;

    public PdfService(TemplateEngine templateEngine) {
        this.templateEngine = templateEngine;
    }

    /**
     * Generate PDF from multiple editor sections using Thymeleaf + OpenHTMLtoPDF.
     */
    public byte[] generatePdf(List<EditorSection> editorSections, String documentTitle, String customCss) throws Exception {
        // 1. Sanitize HTML content from each section
        List<Section> sanitizedSections = editorSections.stream()
                .map(s -> new Section(s.title(), sanitizeHtml(s.html())))
                .toList();

        // 2. Prepare Thymeleaf context
        Context context = new Context();
        context.setVariable("documentTitle", documentTitle != null ? documentTitle : "Collaborative Document");
        context.setVariable("generatedDate", LocalDate.now().format(DateTimeFormatter.ofPattern("MMMM d, yyyy")));
        context.setVariable("sections", sanitizedSections);
        context.setVariable("customCss", customCss);

        // 3. Process Thymeleaf template to HTML
        String html = templateEngine.process("pdf-document", context);

        // 4. Generate PDF with OpenHTMLtoPDF
        try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.withHtmlContent(html, null);
            builder.toStream(outputStream);
            builder.run();

            return outputStream.toByteArray();
        }
    }

    /**
     * Sanitize HTML from Quill editor for safe PDF rendering.
     * - Allows safe HTML tags and inline style attributes
     * - Converts RGB/RGBA colors to hex format
     * - Adds table border styling for PDF
     * - Ensures XHTML-compatible output
     */
    private String sanitizeHtml(String html) {
        if (html == null || html.isEmpty()) {
            return "<p></p>";
        }

        // JSoup safelist: allow Quill-generated HTML with inline styles
        Safelist safelist = Safelist.relaxed()
                .addTags("span", "div", "br", "hr", "img")
                .addTags("table", "thead", "tbody", "tr", "th", "td", "colgroup", "col")
                .addAttributes(":all", "style")
                .addAttributes("a", "href", "target")
                .addAttributes("img", "src", "alt", "width", "height")
                .addAttributes("td", "colspan", "rowspan")
                .addAttributes("th", "colspan", "rowspan")
                .addProtocols("a", "href", "http", "https", "mailto")
                .addProtocols("img", "src", "http", "https", "data");

        String cleaned = Jsoup.clean(html, safelist);

        // Parse and convert to XHTML-compatible output
        Document doc = Jsoup.parseBodyFragment(cleaned);
        doc.outputSettings()
                .syntax(Document.OutputSettings.Syntax.xml)
                .escapeMode(Entities.EscapeMode.xhtml)
                .charset("UTF-8");

        // Normalize RGB/RGBA colors to hex in inline styles
        doc.select("[style]").forEach(el -> {
            String style = el.attr("style");
            if (style.contains("rgb")) {
                el.attr("style", convertRgbToHex(style));
            }
        });

        // Add inline border styles to tables for PDF rendering
        doc.select("table").forEach(el -> {
            el.attr("style", addStyle(el.attr("style"),
                    "border-collapse: collapse; width: 100%"));
        });
        doc.select("td").forEach(el -> {
            el.attr("style", addStyle(el.attr("style"),
                    "border: 1px solid #000000; padding: 8px"));
        });
        doc.select("th").forEach(el -> {
            el.attr("style", addStyle(el.attr("style"),
                    "border: 1px solid #000000; padding: 8px; background-color: #f0f0f0; font-weight: bold"));
        });

        return doc.body().html();
    }

    private String addStyle(String existingStyle, String newStyle) {
        if (existingStyle == null || existingStyle.isEmpty()) {
            return newStyle;
        }
        if (existingStyle.endsWith(";")) {
            return existingStyle + " " + newStyle;
        }
        return existingStyle + "; " + newStyle;
    }

    private static final Pattern RGB_PATTERN = Pattern.compile(
            "rgba?\\s*\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)(?:\\s*,\\s*[\\d.]+)?\\s*\\)"
    );

    private String convertRgbToHex(String style) {
        if (style == null) return "";

        Matcher matcher = RGB_PATTERN.matcher(style);
        StringBuilder result = new StringBuilder();

        while (matcher.find()) {
            int r = Integer.parseInt(matcher.group(1));
            int g = Integer.parseInt(matcher.group(2));
            int b = Integer.parseInt(matcher.group(3));
            String hex = String.format("#%02x%02x%02x", r, g, b);
            matcher.appendReplacement(result, hex);
        }
        matcher.appendTail(result);

        return result.toString();
    }

    // DTOs for template rendering
    public record EditorSection(String id, String title, String html) {}
    public record Section(String title, String content) {}
}
