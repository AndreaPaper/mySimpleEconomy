package com.spesetracker;

import com.spesetracker.support.AbstractIntegrationTest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Verifica l'importazione Excel end-to-end contro un workbook sintetico che
// riproduce la struttura reale scoperta nel file dell'utente (tabelle Fisse/Non
// Fisse, legenda colore per riga, foglio Stima con saldo) - non usa il file reale
// dell'utente, che non esiste fuori dalla sua macchina.
class ExcelImportSmokeTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void analyzeAndCommitFullFlow() throws Exception {
        String email = "excel+" + UUID.randomUUID() + "@example.com";
        MvcResult registerResult = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", email, "password", "password123"))))
                .andExpect(status().isCreated())
                .andReturn();
        String token = objectMapper.readTree(registerResult.getResponse().getContentAsString()).get("token").asText();

        byte[] workbookBytes = buildWorkbook();
        MockMultipartFile file = new MockMultipartFile(
                "file", "diario.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", workbookBytes);

        MvcResult analyzeResult = mockMvc.perform(MockMvcRequestBuilders.multipart("/api/import/excel/analyze")
                        .file(file)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode preview = objectMapper.readTree(analyzeResult.getResponse().getContentAsString());

        assertThat(preview.get("summary").get("sheetsProcessed").asInt()).isEqualTo(2);
        assertThat(preview.get("recurringTransactions")).hasSize(2);
        assertThat(preview.get("oneOffTransactions")).hasSize(8);
        assertThat(preview.get("summary").get("itemsNeedingCategory").asInt()).isEqualTo(2);
        assertThat(preview.get("summary").get("checkpointsDetected").asInt()).isEqualTo(3);

        JsonNode checkpointsPreview = preview.get("balanceCheckpoints");
        assertThat(checkpointsPreview).hasSize(3);
        assertThat(streamOf(checkpointsPreview)
                .anyMatch(c -> c.get("checkpointDate").asText().equals("2025-12-27") && c.get("balance").asDouble() == 3550.00))
                .isTrue();
        assertThat(streamOf(checkpointsPreview)
                .anyMatch(c -> c.get("checkpointDate").asText().equals("2026-01-27") && c.get("balance").asDouble() == 4390.00))
                .isTrue();

        // Le due voci "Stipendio" (una per foglio mensile) devono avere già una categoria
        // auto-risolta (nuova categoria INCOME "Stipendio"), senza bisogno di assegnazione manuale.
        JsonNode oneOffsPreview = preview.get("oneOffTransactions");
        long stipendioCount = streamOf(oneOffsPreview).filter(t -> t.get("name").asText().equals("Stipendio")).count();
        assertThat(stipendioCount).isEqualTo(2);
        assertThat(streamOf(oneOffsPreview).filter(t -> t.get("name").asText().equals("Stipendio"))
                .allMatch(t -> !t.get("needsCategory").asBoolean() && t.get("newCategoryTempId") != null && !t.get("newCategoryTempId").isNull()))
                .isTrue();

        // Aggiunge una categoria "Varie" per le voci senza colore (Gennaio/300, Bolletta enel/172).
        var newCategories = (com.fasterxml.jackson.databind.node.ArrayNode) preview.get("newCategorySuggestions");
        var varieCategory = objectMapper.createObjectNode()
                .put("tempId", "new-varie").put("name", "Varie").put("type", "EXPENSE");
        newCategories.add(varieCategory);

        var oneOffs = (com.fasterxml.jackson.databind.node.ArrayNode) preview.get("oneOffTransactions");
        for (JsonNode item : oneOffs) {
            if (item.get("needsCategory").asBoolean()) {
                ((com.fasterxml.jackson.databind.node.ObjectNode) item).put("newCategoryTempId", "new-varie");
            }
        }

        MvcResult commitResult = mockMvc.perform(post("/api/import/excel/commit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(preview.toString()))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode commitJson = objectMapper.readTree(commitResult.getResponse().getContentAsString());
        assertThat(commitJson.get("categoriesCreated").asInt()).isEqualTo(5);
        assertThat(commitJson.get("recurringTransactionsCreated").asInt()).isEqualTo(2);
        assertThat(commitJson.get("checkpointsCreated").asInt()).isEqualTo(3);
        assertThat(commitJson.get("transactionsCreated").asInt()).isGreaterThanOrEqualTo(10);

        MvcResult recurringResult = mockMvc.perform(get("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode recurring = objectMapper.readTree(recurringResult.getResponse().getContentAsString());
        assertThat(recurring).hasSize(2);
        recurring.forEach(rt -> assertThat(LocalDate.parse(rt.get("nextDueDate").asText())).isAfter(LocalDate.now()));

        MvcResult checkpointsResult = mockMvc.perform(get("/api/balance-checkpoints")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode checkpoints = objectMapper.readTree(checkpointsResult.getResponse().getContentAsString());
        assertThat(checkpoints).hasSize(3);
    }

    private java.util.stream.Stream<JsonNode> streamOf(JsonNode arrayNode) {
        return java.util.stream.StreamSupport.stream(arrayNode.spliterator(), false);
    }

    private byte[] buildWorkbook() throws Exception {
        try (Workbook workbook = new XSSFWorkbook()) {
            buildMonthSheet(workbook, "Gennaio",
                    null, "Spotify", 17.00,
                    null, "Disney", 11.00,
                    LocalDate.of(2026, 1, 25), "Gennaio", 300.00,
                    LocalDate.of(2025, 5, 6),
                    LocalDate.of(2026, 1, 3), "Ekom", 18.00,
                    LocalDate.of(2026, 1, 5), "Farmacia", 12.00,
                    LocalDate.of(2025, 12, 27), 3550.00, 1659.00);

            buildMonthSheet(workbook, "Febbraio",
                    null, "Spotify", 17.00,
                    null, "Disney", 11.00,
                    LocalDate.of(2026, 2, 10), "Bolletta enel", 172.00,
                    null,
                    LocalDate.of(2026, 2, 3), "Ekom", 20.00,
                    LocalDate.of(2026, 2, 6), "Farmacia", 13.00,
                    LocalDate.of(2026, 1, 27), 4390.00, 2042.00);

            Sheet stima = workbook.createSheet("Stima 2026");
            setText(stima, 0, 0, "Mese");
            setText(stima, 0, 1, "START");
            setText(stima, 1, 0, "Gennaio");
            setNumeric(stima, 1, 1, 3550.00);
            setText(stima, 2, 0, "Febbraio");
            setNumeric(stima, 2, 1, 4390.00);

            Sheet recurringSheet = workbook.createSheet("Spese ricorrenti");
            setText(recurringSheet, 0, 0, "(ignorato dall'importer)");

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        }
    }

    private void buildMonthSheet(
            Workbook workbook, String sheetName,
            LocalDate spotifyDate, String spotifyName, double spotifyAmount,
            LocalDate disneyDate, String disneyName, double disneyAmount,
            LocalDate oneOffDate, String oneOffName, double oneOffAmount,
            LocalDate spotifyAnchorDateOverride,
            LocalDate ekomDate, String ekomName, double ekomAmount,
            LocalDate farmaciaDate, String farmaciaName, double farmaciaAmount,
            LocalDate periodStartDate, double startBalance, double salaryAmount
    ) {
        Sheet sheet = workbook.createSheet(sheetName);

        setText(sheet, 1, 0, "Data");
        setText(sheet, 1, 1, "Nome");
        setText(sheet, 1, 2, "Costo");
        setText(sheet, 1, 4, "Data");
        setText(sheet, 1, 5, "Nome");
        setText(sheet, 1, 6, "Costo");

        LocalDate effectiveSpotifyDate = spotifyDate != null ? spotifyDate : spotifyAnchorDateOverride;
        if ("Gennaio".equals(sheetName)) {
            setDate(sheet, 2, 0, effectiveSpotifyDate);
        }
        setText(sheet, 2, 1, spotifyName);
        setNumeric(sheet, 2, 2, spotifyAmount);

        setText(sheet, 3, 1, disneyName);
        setNumeric(sheet, 3, 2, disneyAmount);

        setText(sheet, 4, 0, "Totale");

        setText(sheet, 5, 0, "Debito papà");

        setDate(sheet, 6, 0, oneOffDate);
        setText(sheet, 6, 1, oneOffName);
        setNumeric(sheet, 6, 2, oneOffAmount);

        setDate(sheet, 2, 4, ekomDate);
        setColoredText(sheet, 2, 5, ekomName, "FFFF7575");
        setNumeric(sheet, 2, 6, ekomAmount);

        setDate(sheet, 3, 4, farmaciaDate);
        setColoredText(sheet, 3, 5, farmaciaName, "FF8BF1BC");
        setNumeric(sheet, 3, 6, farmaciaAmount);

        setColoredBlank(sheet, 2, 15, "FFFF7575");
        setText(sheet, 2, 16, "Spese cibo");
        setColoredBlank(sheet, 3, 15, "FF8BF1BC");
        setText(sheet, 3, 16, "Farmacia");

        setText(sheet, 8, 0, "SALDO INIZIO MESE");
        setNumeric(sheet, 9, 0, startBalance);
        setText(sheet, 10, 0, "Stipendio");
        setDate(sheet, 11, 0, periodStartDate);
        setNumeric(sheet, 11, 1, salaryAmount);
    }

    private Row row(Sheet sheet, int r) {
        Row row = sheet.getRow(r);
        return row != null ? row : sheet.createRow(r);
    }

    private void setText(Sheet sheet, int r, int c, String value) {
        row(sheet, r).createCell(c).setCellValue(value);
    }

    private void setNumeric(Sheet sheet, int r, int c, double value) {
        row(sheet, r).createCell(c).setCellValue(value);
    }

    private void setDate(Sheet sheet, int r, int c, LocalDate value) {
        if (value == null) return;
        Cell cell = row(sheet, r).createCell(c);
        CellStyle style = sheet.getWorkbook().createCellStyle();
        style.setDataFormat(sheet.getWorkbook().getCreationHelper().createDataFormat().getFormat("yyyy-mm-dd"));
        cell.setCellStyle(style);
        cell.setCellValue(value);
    }

    private void setColoredText(Sheet sheet, int r, int c, String value, String argbHex) {
        Cell cell = row(sheet, r).createCell(c);
        cell.setCellValue(value);
        applyFill(sheet, cell, argbHex);
    }

    private void setColoredBlank(Sheet sheet, int r, int c, String argbHex) {
        Cell cell = row(sheet, r).createCell(c);
        applyFill(sheet, cell, argbHex);
    }

    private void applyFill(Sheet sheet, Cell cell, String argbHex) {
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
}
