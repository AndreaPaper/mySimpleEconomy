package com.spesetracker;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spesetracker.support.AbstractIntegrationTest;
import com.spesetracker.support.ApiTestClient;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// L'export deve raccontare gli stessi numeri dell'app: i fogli seguono i periodi
// da stipendio a stipendio, non i mesi di calendario, e gli importi hanno il
// segno cosi' che sommare la colonna dia il netto.
class ExcelExportSmokeTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private ApiTestClient api;

    private ApiTestClient api() {
        if (api == null) api = new ApiTestClient(mockMvc, objectMapper);
        return api;
    }

    @Test
    void iFogliSeguonoIPeriodiDaStipendioAStipendio() throws Exception {
        String token = api().registerAndLogin();
        setSalaryDay(token, 27);
        String expense = api().createExpenseCategory(token);
        String income = api().createIncomeCategory(token);

        // Due giorni consecutivi a cavallo dell'accredito: con giorno 27 devono
        // finire in due periodi diversi. Le date sono nel passato perche' senza
        // un "to" esplicito l'export si ferma a oggi.
        LocalDate base = LocalDate.now().minusMonths(2);
        LocalDate lastDayOfPeriod = base.withDayOfMonth(26);
        LocalDate firstDayOfNext = base.withDayOfMonth(27);

        api().createTransaction(token, expense, lastDayOfPeriod, "100.00", "EXPENSE");
        api().createTransaction(token, income, lastDayOfPeriod, "300.00", "INCOME");
        api().createTransaction(token, expense, firstDayOfNext, "40.00", "EXPENSE");

        try (Workbook workbook = export(token)) {
            List<String> sheets = sheetNames(workbook);
            assertThat(sheets).startsWith("Riepilogo");
            assertThat(sheets).contains("Categorie", "Ricorrenti e debiti", "Andamento del saldo");

            // Il periodo prende il nome dal mese in cui finisce: la spesa del 26
            // sta nel foglio del suo stesso mese, quella del 27 in quello dopo.
            String closingPeriod = monthSheetName(lastDayOfPeriod);
            String openingPeriod = monthSheetName(firstDayOfNext.plusMonths(1));
            assertThat(sheets).contains(closingPeriod, openingPeriod);
            assertThat(closingPeriod).isNotEqualTo(openingPeriod);

            Sheet closing = workbook.getSheet(closingPeriod);
            assertThat(amountsOf(closing)).containsExactlyInAnyOrder(-100.00, 300.00);
            assertThat(amountsOf(workbook.getSheet(openingPeriod))).containsExactly(-40.00);
        }
    }

    @Test
    void ilBloccoInTestaCoincideConLaSommaDellaColonna() throws Exception {
        String token = api().registerAndLogin();
        setSalaryDay(token, 27);
        String expense = api().createExpenseCategory(token);
        String income = api().createIncomeCategory(token);

        LocalDate day = LocalDate.now().minusMonths(2).withDayOfMonth(10);
        api().createTransaction(token, expense, day, "100.00", "EXPENSE");
        api().createTransaction(token, expense, day, "50.00", "EXPENSE");
        api().createTransaction(token, income, day, "400.00", "INCOME");

        try (Workbook workbook = export(token)) {
            Sheet sheet = workbook.getSheet(monthSheetName(day));
            assertThat(sheet).isNotNull();

            // Le uscite sono negative: la somma della colonna e' direttamente il
            // netto, ed e' il numero che il blocco in testa dichiara.
            double columnSum = amountsOf(sheet).stream().mapToDouble(Double::doubleValue).sum();
            assertThat(columnSum).isEqualTo(250.00);
            assertThat(keyValue(sheet, "Entrate")).isEqualTo(400.00);
            assertThat(keyValue(sheet, "Uscite")).isEqualTo(-150.00);
            assertThat(keyValue(sheet, "Risparmiato (entrate − uscite)")).isEqualTo(columnSum);
        }
    }

    @Test
    void leTransazioniPortanoCategoriaTipoEDescrizione() throws Exception {
        String token = api().registerAndLogin();
        String expense = api().createExpenseCategory(token);
        LocalDate day = LocalDate.now().minusMonths(1).withDayOfMonth(15);

        api().createTransaction(token, expense, day, "42.50", "EXPENSE");

        try (Workbook workbook = export(token)) {
            // Senza giorno di stipendio configurato il periodo e' il mese solare.
            Sheet sheet = workbook.getSheet(monthSheetName(day));
            int header = headerRowIndex(sheet);
            assertThat(sheet.getRow(header).getCell(0).getStringCellValue()).isEqualTo("Data");

            Row row = sheet.getRow(header + 1);
            assertThat(row.getCell(2).getStringCellValue()).isEqualTo("Uscita");
            assertThat(row.getCell(3).getStringCellValue()).isEqualTo("No");
            assertThat(row.getCell(4).getNumericCellValue()).isEqualTo(-42.50);
            assertThat(row.getCell(5).getStringCellValue()).isEqualTo("test");
        }
    }

    private void setSalaryDay(String token, int day) throws Exception {
        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"salaryDay\":%d}".formatted(day)))
                .andExpect(status().isOk());
    }

    private Workbook export(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/export/excel")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        byte[] content = result.getResponse().getContentAsByteArray();
        assertThat(content).isNotEmpty();
        return new XSSFWorkbook(new ByteArrayInputStream(content));
    }

    private List<String> sheetNames(Workbook workbook) {
        List<String> names = new ArrayList<>();
        for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
            names.add(workbook.getSheetName(i));
        }
        return names;
    }

    private String monthSheetName(LocalDate date) {
        String raw = date.format(java.time.format.DateTimeFormatter.ofPattern("MMMM yyyy", java.util.Locale.ITALIAN));
        return Character.toUpperCase(raw.charAt(0)) + raw.substring(1);
    }

    // La tabella non parte da riga 0: sopra ci sono titolo e numeri chiave.
    private int headerRowIndex(Sheet sheet) {
        for (int i = 0; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            Cell cell = row == null ? null : row.getCell(0);
            if (cell != null && cell.getCellType() == org.apache.poi.ss.usermodel.CellType.STRING
                    && "Data".equals(cell.getStringCellValue())) {
                return i;
            }
        }
        throw new AssertionError("Intestazione della tabella non trovata nel foglio " + sheet.getSheetName());
    }

    private List<Double> amountsOf(Sheet sheet) {
        List<Double> amounts = new ArrayList<>();
        for (int i = headerRowIndex(sheet) + 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null) break;
            Cell date = row.getCell(0);
            if (date == null || date.getCellType() != org.apache.poi.ss.usermodel.CellType.NUMERIC) break;
            amounts.add(row.getCell(4).getNumericCellValue());
        }
        return amounts;
    }

    private double keyValue(Sheet sheet, String label) {
        for (int i = 0; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            Cell cell = row == null ? null : row.getCell(0);
            if (cell != null && cell.getCellType() == org.apache.poi.ss.usermodel.CellType.STRING
                    && label.equals(cell.getStringCellValue())) {
                return row.getCell(1).getNumericCellValue();
            }
        }
        throw new AssertionError("Riga \"" + label + "\" non trovata nel foglio " + sheet.getSheetName());
    }
}
