package com.spesetracker.service;

import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Workbook;

// Gli stili del file esportato, creati una volta sola: POI ha un tetto basso al
// numero di stili per workbook, e crearne uno per cella lo sfonda in fretta.
final class ExcelExportStyles {

    // Le uscite sono negative, e in rosso si distinguono senza dover leggere il
    // segno. Il formato e' quello di Excel: positivi;negativi.
    private static final String CURRENCY_FORMAT = "#,##0.00 €;[RED]-#,##0.00 €";

    final CellStyle date;
    final CellStyle currency;
    final CellStyle bold;
    final CellStyle boldCurrency;
    final CellStyle title;
    final CellStyle header;
    final CellStyle note;

    ExcelExportStyles(Workbook workbook) {
        short currencyFormat = workbook.getCreationHelper().createDataFormat().getFormat(CURRENCY_FORMAT);
        short dateFormat = workbook.getCreationHelper().createDataFormat().getFormat("dd/mm/yyyy");

        Font boldFont = workbook.createFont();
        boldFont.setBold(true);

        Font titleFont = workbook.createFont();
        titleFont.setBold(true);
        titleFont.setFontHeightInPoints((short) 13);

        Font noteFont = workbook.createFont();
        noteFont.setItalic(true);
        noteFont.setColor(Font.COLOR_NORMAL);

        date = workbook.createCellStyle();
        date.setDataFormat(dateFormat);

        currency = workbook.createCellStyle();
        currency.setDataFormat(currencyFormat);

        bold = workbook.createCellStyle();
        bold.setFont(boldFont);

        boldCurrency = workbook.createCellStyle();
        boldCurrency.setFont(boldFont);
        boldCurrency.setDataFormat(currencyFormat);

        title = workbook.createCellStyle();
        title.setFont(titleFont);

        // L'intestazione della tabella ha una riga sotto: con il blocco fermo in
        // alto e' quello che separa i titoli dai dati mentre si scorre.
        header = workbook.createCellStyle();
        header.setFont(boldFont);
        header.setBorderBottom(BorderStyle.THIN);

        note = workbook.createCellStyle();
        note.setFont(noteFont);
    }
}
