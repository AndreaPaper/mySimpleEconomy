package com.spesetracker.service.bankimport;

import com.spesetracker.service.excelimport.PoiCells;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// Legge la "lista movimenti" esportata da Intesa Sanpaolo.
//
// Sopra la tabella il file ha un blocco di filtri (conto, periodo, tipo
// operazione) la cui altezza cambia da export a export, quindi l'intestazione
// si cerca invece di darla per fissa; e le colonne si leggono per nome, così
// se la banca ne aggiunge o ne sposta una l'import non si mette a leggere il
// campo sbagliato in silenzio.
@Component
public class IntesaSanpaoloParser {

    private static final int MAX_HEADER_SCAN_ROWS = 60;
    private static final String COL_DATE = "data";
    private static final String COL_OPERATION = "operazione";
    private static final String COL_DETAILS = "dettagli";
    private static final String COL_ACCOUNT = "conto o carta";
    private static final String COL_BOOKED = "contabilizzazione";
    private static final String COL_CATEGORY = "categoria";
    private static final String COL_AMOUNT = "importo";

    // Bastano queste tre a riconoscere la tabella: sono le uniche senza le
    // quali non si potrebbe comunque importare nulla.
    private static final List<String> REQUIRED = List.of(COL_DATE, COL_OPERATION, COL_AMOUNT);

    public List<BankStatementRow> parse(InputStream inputStream) throws IOException {
        // POI segnala un file che non e' un .xlsx con eccezioni non controllate
        // (NotOfficeXmlFileException e simili): senza tradurle, chi sbaglia file
        // si vede un errore del server invece della spiegazione.
        Workbook workbook;
        try {
            workbook = new XSSFWorkbook(inputStream);
        } catch (RuntimeException e) {
            throw badFile("Non riesco ad aprire il file: non sembra un .xlsx valido. "
                    + "Riscaricalo dall'app della banca senza aprirlo con altri programmi.");
        }

        try (workbook) {
            Sheet sheet = workbook.getNumberOfSheets() > 0 ? workbook.getSheetAt(0) : null;
            if (sheet == null) {
                throw badFile("Il file non contiene fogli di lavoro.");
            }

            Map<String, Integer> columns = null;
            int headerRow = -1;
            int scanLimit = Math.min(sheet.getLastRowNum(), MAX_HEADER_SCAN_ROWS);
            for (int r = sheet.getFirstRowNum(); r <= scanLimit; r++) {
                Map<String, Integer> candidate = readHeader(sheet.getRow(r));
                if (candidate != null) {
                    columns = candidate;
                    headerRow = r;
                    break;
                }
            }
            if (columns == null) {
                throw badFile("Non ho trovato la tabella dei movimenti: manca la riga con le "
                        + "intestazioni Data, Operazione e Importo. Hai selezionato il formato giusto?");
            }

            List<BankStatementRow> rows = new ArrayList<>();
            for (int r = headerRow + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                LocalDate date = PoiCells.readDate(cell(row, columns.get(COL_DATE)));
                BigDecimal amount = PoiCells.readNumeric(cell(row, columns.get(COL_AMOUNT)), null);
                // La tabella finisce alla prima riga senza data e importo: sotto
                // possono esserci totali o note, che non sono movimenti.
                if (date == null || amount == null) {
                    if (rows.isEmpty()) continue;
                    break;
                }

                String booked = text(row, columns.get(COL_BOOKED));
                rows.add(new BankStatementRow(
                        r + 1,
                        date,
                        text(row, columns.get(COL_OPERATION)),
                        text(row, columns.get(COL_DETAILS)),
                        text(row, columns.get(COL_ACCOUNT)),
                        // Solo un "SI" esplicito conta come contabilizzato: se la
                        // colonna manca, meglio trattare la riga come definitiva
                        // che tenerla provvisoria per sempre.
                        booked == null || booked.equalsIgnoreCase("SI"),
                        text(row, columns.get(COL_CATEGORY)),
                        amount));
            }

            if (rows.isEmpty()) {
                throw badFile("La tabella dei movimenti è vuota: nessuna riga con data e importo.");
            }
            return rows;
        }
    }

    // Restituisce la mappa colonna -> indice se la riga è l'intestazione della
    // tabella, altrimenti null.
    private Map<String, Integer> readHeader(Row row) {
        if (row == null) return null;
        Map<String, Integer> columns = new HashMap<>();
        for (int c = row.getFirstCellNum(); c >= 0 && c < row.getLastCellNum(); c++) {
            String label = PoiCells.readAnyAsString(row.getCell(c));
            if (label == null) continue;
            // "Categoria " nel file ha uno spazio in coda, e le maiuscole non
            // sono garantite: si confronta normalizzato.
            String key = label.toLowerCase(Locale.ITALIAN).trim();
            columns.putIfAbsent(key, c);
        }
        return columns.keySet().containsAll(REQUIRED) ? columns : null;
    }

    private Cell cell(Row row, Integer index) {
        return row == null || index == null ? null : row.getCell(index);
    }

    private String text(Row row, Integer index) {
        return PoiCells.readAnyAsString(cell(row, index));
    }

    private ResponseStatusException badFile(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
