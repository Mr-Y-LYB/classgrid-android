package com.mrylyb.classgrid;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.xml.parsers.DocumentBuilderFactory;

final class XlsxReader {
    private XlsxReader() {}

    static String toCsv(byte[] input) throws Exception {
        Map<String, byte[]> files = new HashMap<>();
        int total = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(input))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (!name.equals("xl/sharedStrings.xml") && !name.matches("xl/worksheets/sheet[0-9]+\\.xml")) continue;
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n;
                while ((n = zip.read(buf)) != -1) {
                    total += n;
                    if (total > 30_000_000) throw new IllegalStateException("表格解压后过大");
                    out.write(buf, 0, n);
                }
                files.put(name, out.toByteArray());
            }
        }
        byte[] sheet = files.get("xl/worksheets/sheet1.xml");
        if (sheet == null) throw new IllegalStateException("Excel 缺少第一个工作表");
        List<String> shared = new ArrayList<>();
        if (files.containsKey("xl/sharedStrings.xml")) {
            NodeList items = parse(files.get("xl/sharedStrings.xml")).getElementsByTagName("si");
            for (int i = 0; i < items.getLength(); i++) shared.add(allText((Element) items.item(i), "t"));
        }
        NodeList rows = parse(sheet).getElementsByTagName("row");
        if (rows.getLength() > 3000) throw new IllegalStateException("表格行数过多");
        StringBuilder csv = new StringBuilder();
        for (int i = 0; i < rows.getLength(); i++) {
            NodeList cells = ((Element) rows.item(i)).getElementsByTagName("c");
            List<String> columns = new ArrayList<>();
            for (int j = 0; j < cells.getLength(); j++) {
                Element c = (Element) cells.item(j);
                int col = column(c.getAttribute("r"));
                if (col < 0 || col >= 40) continue;
                while (columns.size() <= col) columns.add("");
                String type = c.getAttribute("t");
                String value = "inlineStr".equals(type) ? allText(c, "t") : firstText(c, "v");
                if ("s".equals(type)) {
                    int index;
                    try { index = Integer.parseInt(value); } catch (Exception e) { index = -1; }
                    value = index >= 0 && index < shared.size() ? shared.get(index) : "";
                }
                columns.set(col, value);
            }
            for (int c = 0; c < columns.size(); c++) {
                if (c > 0) csv.append(',');
                String value = columns.get(c);
                csv.append('"').append(value.replace("\"", "\"\"")).append('"');
            }
            csv.append('\n');
        }
        return csv.toString();
    }

    private static Document parse(byte[] xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder().parse(new ByteArrayInputStream(xml));
    }
    private static String firstText(Element element, String tag) {
        NodeList nodes = element.getElementsByTagName(tag);
        return nodes.getLength() == 0 ? "" : nodes.item(0).getTextContent();
    }
    private static String allText(Element element, String tag) {
        NodeList nodes = element.getElementsByTagName(tag);
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < nodes.getLength(); i++) text.append(nodes.item(i).getTextContent());
        return text.toString();
    }
    private static int column(String ref) {
        int index = 0, pos = 0;
        while (pos < ref.length() && Character.isLetter(ref.charAt(pos))) {
            index = index * 26 + Character.toUpperCase(ref.charAt(pos)) - 'A' + 1;
            pos++;
        }
        return index - 1;
    }
}
