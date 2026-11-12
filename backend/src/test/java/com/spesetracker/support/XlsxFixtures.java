package com.spesetracker.support;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.openxmlformats.schemas.spreadsheetml.x2006.main.CTColor;
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

    /**
     * Un riempimento con un colore del tema (indice di POI: 0 lt1, 1 dk1, 4 accent1…) e una
     * sfumatura (tint, da -1 a 1; 0 = nessuna), come lo scrive Excel scegliendo il colore
     * dalla tavolozza "Colori tema".
     */
    public static void applyThemeFill(Sheet sheet, Cell cell, int themeIndex, double tint) {
        // Un workbook nuovo di POI non ha il tema, che Excel invece scrive sempre: senza,
        // un colore del tema non si risolve in nessun colore.
        ensureOfficeTheme((XSSFWorkbook) sheet.getWorkbook());
        CTColor ct = CTColor.Factory.newInstance();
        ct.setTheme(themeIndex);
        if (tint != 0) ct.setTint(tint);
        XSSFCellStyle style = (XSSFCellStyle) sheet.getWorkbook().createCellStyle();
        style.setFillForegroundColor(XSSFColor.from(ct, null));
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        cell.setCellStyle(style);
    }

    // Lo schema colori del tema "Office" (quello che Excel mette in ogni file nuovo), il
    // minimo che serve per risolvere un colore del tema. Il resto del tema non conta qui.
    private static final String OFFICE_THEME = """
            <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">
              <a:themeElements>
                <a:clrScheme name="Office">
                  <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
                  <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
                  <a:dk2><a:srgbClr val="44546A"/></a:dk2>
                  <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
                  <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
                  <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
                  <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
                  <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
                  <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
                  <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
                  <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
                  <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
                </a:clrScheme>
                <a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
                <a:fmtScheme name="Office"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>
              </a:themeElements>
            </a:theme>
            """;

    /** Un workbook nuovo di POI non ha il tema, che Excel scrive sempre: qui lo si aggiunge. */
    private static void ensureOfficeTheme(XSSFWorkbook workbook) {
        try {
            if (workbook.getStylesSource().getTheme() != null
                    && workbook.getStylesSource().getTheme().getThemeColor(0) != null) return;
        } catch (RuntimeException emptyTheme) {
            // un tema senza schema colori: lo si riempie qui sotto
        }
        workbook.getStylesSource().ensureThemesTable();
        try {
            workbook.getStylesSource().getTheme()
                    .readFrom(new java.io.ByteArrayInputStream(OFFICE_THEME.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    public static void setThemeColoredText(Sheet sheet, int r, int c, String value, int themeIndex, double tint) {
        Cell cell = row(sheet, r).createCell(c);
        cell.setCellValue(value);
        applyThemeFill(sheet, cell, themeIndex, tint);
    }

    public static void setThemeColoredBlank(Sheet sheet, int r, int c, int themeIndex, double tint) {
        applyThemeFill(sheet, row(sheet, r).createCell(c), themeIndex, tint);
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
