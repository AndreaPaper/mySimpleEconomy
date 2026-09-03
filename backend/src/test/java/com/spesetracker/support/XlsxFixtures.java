package com.spesetracker.support;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;

/**
 * Costruzione di fogli .xlsx per i test dei parser.
 *
 * <p>Una nota che vale più dell'intera classe: {@link #setDate} applica davvero un formato
 * data alla cella. Senza, POI la scrive come numero puro, {@code DateUtil.isCellDateFormatted}
 * risponde no e {@code PoiCells.readDate} restituisce null — la riga verrebbe scartata e il
 * test proverebbe il contrario di quello che dichiara.
 */
public final class XlsxFixtures {

    private XlsxFixtures() {
    }

    public static Row row(Sheet sheet, int r) {
        Row row = sheet.getRow(r);
        return row != null ? row : sheet.createRow(r);
    }

    public static void setText(Sheet sheet, int r, int c, String value) {
        row(sheet, r).createCell(c).setCellValue(value);
    }

    public static void setNumeric(Sheet sheet, int r, int c, double value) {
        row(sheet, r).createCell(c).setCellValue(value);
    }

    /** Una cella data, con il formato applicato: vedi la nota in testa alla classe. */
    public static void setDate(Sheet sheet, int r, int c, LocalDate value) {
        if (value == null) return;
        Cell cell = row(sheet, r).createCell(c);
        CellStyle style = sheet.getWorkbook().createCellStyle();
        style.setDataFormat(sheet.getWorkbook().getCreationHelper().createDataFormat().getFormat("yyyy-mm-dd"));
        cell.setCellStyle(style);
        cell.setCellValue(value);
    }

    /** Una data scritta come numero puro, senza formato: come la scrivono certi export. */
    public static void setUnformattedDate(Sheet sheet, int r, int c, LocalDate value) {
        row(sheet, r).createCell(c).setCellValue(value);
    }

    public static void setFormula(Sheet sheet, int r, int c, String formula) {
        row(sheet, r).createCell(c).setCellFormula(formula);
    }

    public static void setBoolean(Sheet sheet, int r, int c, boolean value) {
        row(sheet, r).createCell(c).setCellValue(value);
    }

    public static void setColoredText(Sheet sheet, int r, int c, String value, String argbHex) {
        Cell cell = row(sheet, r).createCell(c);
        cell.setCellValue(value);
        applyFill(sheet, cell, argbHex);
    }

    public static void setColoredBlank(Sheet sheet, int r, int c, String argbHex) {
        applyFill(sheet, row(sheet, r).createCell(c), argbHex);
    }

    public static void applyFill(Sheet sheet, Cell cell, String argbHex) {
        byte[] rgb = new byte[]{
                (byte) Integer.parseInt(argbHex.substring(0, 2), 16),
                (byte) Integer.parseInt(argbHex.substring(2, 4), 16),
                (byte) Integer.parseInt(argbHex.substring(4, 6), 16),
                (byte) Integer.parseInt(argbHex.substring(6, 8), 16)
        };
        CellStyle style = sheet.getWorkbook().createCellStyle();
        style.setFillForegroundColor(new XSSFColor(rgb, null));
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        cell.setCellStyle(style);
    }

    /** Un workbook nuovo con un solo foglio del nome indicato. */
    public static XSSFWorkbook workbook(String sheetName) {
        XSSFWorkbook workbook = new XSSFWorkbook();
        workbook.createSheet(sheetName);
        return workbook;
    }

    public static byte[] toBytes(Workbook workbook) throws IOException {
        try (workbook; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            workbook.write(out);
            return out.toByteArray();
        }
    }
}
