package com.mrylyb.classgrid;

import java.nio.file.Files;
import java.nio.file.Path;

public class XlsxReaderTest {
    public static void main(String[] args) throws Exception {
        String csv = XlsxReader.toCsv(Files.readAllBytes(Path.of(args[0])));
        if (!csv.contains("\"课程\",\"教师\",\"教室\"")) throw new AssertionError(csv);
        if (!csv.contains("\"高等数学\",\"张老师\",\"A101\",\"一\",\"1\",\"2\",\"1-16单\""))
            throw new AssertionError(csv);
        System.out.println("ClassGrid XLSX test passed");
    }
}
