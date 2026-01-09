package com.example.collabeditor.service;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Entities;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Service;
import org.xhtmlrenderer.pdf.ITextRenderer;

import java.io.ByteArrayOutputStream;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class PdfService {

    private static final String XHTML_TEMPLATE = """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
                <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
                <title>Document</title>
                <style type="text/css">
                    @page {
                        size: A4;
                        margin: 2.5cm;
                    }
                    body {
                        font-family: serif;
                        font-size: 12pt;
                        line-height: 1.5;
                        color: #000000;
                    }
                    h1 { font-size: 24pt; font-weight: bold; margin: 0.67em 0; }
                    h2 { font-size: 18pt; font-weight: bold; margin: 0.83em 0; }
                    h3 { font-size: 14pt; font-weight: bold; margin: 1em 0; }
                    p { margin: 1em 0; }
                    strong, b { font-weight: bold; }
                    em, i { font-style: italic; }
                    u { text-decoration: underline; }
                    s, strike { text-decoration: line-through; }
                    blockquote {
                        margin: 1em 40px;
                        padding-left: 10px;
                        border-left: 4px solid #cccccc;
                    }
                    ul, ol { margin: 1em 0; padding-left: 40px; }
                    li { margin: 0.5em 0; }
                    a { color: #0000ff; text-decoration: underline; }
                    pre, code {
                        font-family: monospace;
                        background-color: #f5f5f5;
                        padding: 2px 4px;
                    }
                    pre {
                        padding: 10px;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    }
                    .ql-align-center { text-align: center; }
                    .ql-align-right { text-align: right; }
                    .ql-align-justify { text-align: justify; }
                    .ql-indent-1 { padding-left: 3em; }
                    .ql-indent-2 { padding-left: 6em; }
                    .ql-indent-3 { padding-left: 9em; }
                    .ql-indent-4 { padding-left: 12em; }
                    .ql-indent-5 { padding-left: 15em; }
                    .ql-indent-6 { padding-left: 18em; }
                    .ql-indent-7 { padding-left: 21em; }
                    .ql-indent-8 { padding-left: 24em; }
                    table {
                        border-collapse: collapse;
                        border-spacing: 0;
                        width: 100%%;
                        margin: 1em 0;
                        border: 1px solid #000000;
                    }
                    tr {
                        page-break-inside: avoid;
                    }
                    th {
                        border: 1px solid #000000;
                        padding: 8px;
                        text-align: left;
                        vertical-align: top;
                        background-color: #f0f0f0;
                        font-weight: bold;
                    }
                    td {
                        border: 1px solid #000000;
                        padding: 8px;
                        text-align: left;
                        vertical-align: top;
                    }
                    tbody td {
                        border: 1px solid #000000;
                    }
                    %s
                </style>
            </head>
            <body>
                %s
            </body>
            </html>
            """;

    public byte[] generatePdf(String htmlContent, String customCss) throws Exception {
        String cleanedHtml = cleanHtmlForFlyingSaucer(htmlContent);
        String css = customCss != null ? customCss : "";
        String xhtml = String.format(XHTML_TEMPLATE, css, cleanedHtml);

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        ITextRenderer renderer = new ITextRenderer();
        renderer.setDocumentFromString(xhtml);
        renderer.layout();
        renderer.createPDF(outputStream);
        renderer.finishPDF();

        return outputStream.toByteArray();
    }

    private String cleanHtmlForFlyingSaucer(String html) {
        if (html == null || html.isEmpty()) {
            return "<p></p>";
        }

        // Configure Jsoup safelist to allow Quill-generated HTML including tables
        Safelist safelist = Safelist.relaxed()
                .addTags("span", "div", "br", "hr")
                .addTags("table", "thead", "tbody", "tr", "th", "td", "colgroup", "col")
                .addAttributes(":all", "class", "style")
                .addAttributes("a", "href", "target")
                .addAttributes("td", "colspan", "rowspan")
                .addAttributes("th", "colspan", "rowspan")
                .addAttributes("col", "width", "span")
                .addProtocols("a", "href", "http", "https", "mailto");

        // Clean HTML using Jsoup
        String cleaned = Jsoup.clean(html, safelist);

        // Parse and convert to XHTML
        Document doc = Jsoup.parseBodyFragment(cleaned);
        doc.outputSettings()
                .syntax(Document.OutputSettings.Syntax.xml)
                .escapeMode(Entities.EscapeMode.xhtml)
                .charset("UTF-8");

        // Convert Quill-specific classes to CSS2.1 compatible inline styles
        doc.select("[class*=ql-align-center]").forEach(el -> {
            el.attr("style", addStyle(el.attr("style"), "text-align: center"));
        });
        doc.select("[class*=ql-align-right]").forEach(el -> {
            el.attr("style", addStyle(el.attr("style"), "text-align: right"));
        });
        doc.select("[class*=ql-align-justify]").forEach(el -> {
            el.attr("style", addStyle(el.attr("style"), "text-align: justify"));
        });

        // Handle Quill's inline styles for colors
        doc.select("[style*=color]").forEach(el -> {
            String style = el.attr("style");
            // Convert rgb() to hex if needed for better compatibility
            el.attr("style", convertRgbToHex(style));
        });

        // Add inline border styles to table elements for Flying Saucer compatibility
        doc.select("table").forEach(el -> {
            el.attr("style", addStyle(el.attr("style"),
                "border-collapse: collapse; border: 1px solid #000000; width: 100%"));
        });
        doc.select("td").forEach(el -> {
            el.attr("style", addStyle(el.attr("style"),
                "border: 1px solid #000000; padding: 8px"));
        });
        doc.select("th").forEach(el -> {
            el.attr("style", addStyle(el.attr("style"),
                "border: 1px solid #000000; padding: 8px; background-color: #f0f0f0; font-weight: bold"));
        });

        // Ensure self-closing tags are properly formatted
        String result = doc.body().html();

        // Make sure br and hr tags are self-closing
        result = result.replaceAll("<br>", "<br/>");
        result = result.replaceAll("<hr>", "<hr/>");

        return result;
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
            "rgb\\s*\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)"
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
}
