package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.spesetracker.support.AbstractIntegrationTest;
import com.spesetracker.support.ApiTestClient;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
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
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Verifica l'import dell'estratto conto contro un workbook sintetico che
// riproduce la struttura reale del file Intesa Sanpaolo (blocco di filtri sopra,
// intestazione a riga variabile, importi con segno, colonna Contabilizzazione).
//
// Il caso che conta davvero è il secondo passaggio: ripassare lo stesso estratto
// conto non deve produrre nulla, e un movimento che nel frattempo la banca ha
// contabilizzato deve aggiornare quello già importato invece di affiancarglisi.
class BankImportSmokeTest extends AbstractIntegrationTest {

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
    void riconosceCosaEGiaStatoImportato() throws Exception {
        String token = api().registerAndLogin();

        JsonNode preview = analyze(token, buildWorkbook(false));

        assertThat(preview.get("summary").get("rowsInFile").asInt()).isEqualTo(4);
        assertThat(preview.get("summary").get("nuove").asInt()).isEqualTo(4);
        assertThat(preview.get("summary").get("giaImportate").asInt()).isZero();
        // Tre categorie della banca: due in uscita e una in entrata.
        assertThat(preview.get("unmappedCategories")).hasSize(3);

        // Le entrate e le uscite non possono finire sulla stessa categoria.
        String spese = api().createExpenseCategory(token);
        String entrate = api().createIncomeCategory(token);
        ArrayNode mappings = mappingsFor(preview, spese, entrate);

        JsonNode result = commit(token, preview, mappings);
        assertThat(result.get("importate").asInt()).isEqualTo(4);
        assertThat(result.get("aggiornate").asInt()).isZero();
        assertThat(api().listTransactions(token)).hasSize(4);

        // Secondo passaggio con lo stesso identico file: non deve entrare niente.
        JsonNode again = analyze(token, buildWorkbook(false));
        assertThat(again.get("summary").get("nuove").asInt()).isZero();
        assertThat(again.get("summary").get("giaImportate").asInt()).isEqualTo(4);
        assertThat(api().listTransactions(token)).hasSize(4);
    }

    @Test
    void riabbinaIlMovimentoDiventatoDefinitivo() throws Exception {
        String token = api().registerAndLogin();

        JsonNode preview = analyze(token, buildWorkbook(false));
        String spese = api().createExpenseCategory(token);
        String entrate = api().createIncomeCategory(token);
        commit(token, preview, mappingsFor(preview, spese, entrate));
        assertThat(api().listTransactions(token)).hasSize(4);

        // Stesso estratto conto, ma la banca ha contabilizzato il movimento
        // provvisorio: cambiano descrizione e data, l'importo no.
        JsonNode settled = analyze(token, buildWorkbook(true));
        assertThat(settled.get("summary").get("nuove").asInt()).isZero();
        assertThat(settled.get("summary").get("daAggiornare").asInt()).isEqualTo(1);
        assertThat(settled.get("summary").get("giaImportate").asInt()).isEqualTo(3);

        JsonNode result = commit(token, settled, mappingsFor(settled, spese, entrate));
        assertThat(result.get("aggiornate").asInt()).isEqualTo(1);
        assertThat(result.get("importate").asInt()).isZero();

        // Il conto non cresce: la provvisoria è stata riscritta, non affiancata.
        JsonNode transactions = api().listTransactions(token);
        assertThat(transactions).hasSize(4);
        assertThat(streamOf(transactions).anyMatch(t -> t.get("description").asText().equals("Coop Genova Gastaldi")))
                .isTrue();
        assertThat(streamOf(transactions).anyMatch(t -> t.get("description").asText().equals("Supermercato Coop. Lig")))
                .isFalse();
    }

    @Test
    void rifiutaUnFileCheNonEUnEstrattoConto() throws Exception {
        String token = api().registerAndLogin();

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Altro");
            sheet.createRow(0).createCell(0).setCellValue("Niente a che vedere");
            workbook.write(out);

            mockMvc.perform(MockMvcRequestBuilders
                            .multipart("/api/import/bank/analyze")
                            .file(new MockMultipartFile("file", "altro.xlsx",
                                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                    out.toByteArray()))
                            .param("source", "INTESA_SANPAOLO")
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isBadRequest());
        }
    }

    private JsonNode analyze(String token, byte[] workbook) throws Exception {
        MvcResult result = mockMvc.perform(MockMvcRequestBuilders
                        .multipart("/api/import/bank/analyze")
                        .file(new MockMultipartFile("file", "movimenti.xlsx",
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", workbook))
                        .param("source", "INTESA_SANPAOLO")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    // Rimanda indietro le righe che entrano, come farebbe l'anteprima.
    private JsonNode commit(String token, JsonNode preview, ArrayNode mappings) throws Exception {
        ArrayNode rows = objectMapper.createArrayNode();
        for (JsonNode row : preview.get("rows")) {
            String outcome = row.get("outcome").asText();
            if (!outcome.equals("NUOVA") && !outcome.equals("AGGIORNA_PROVVISORIA")) continue;

            ObjectNode commitRow = objectMapper.createObjectNode();
            commitRow.put("occurredOn", row.get("occurredOn").asText());
            commitRow.put("rawOperation", row.get("rawOperation").asText());
            commitRow.put("rawDetails", row.get("rawDetails").asText());
            commitRow.put("bankCategory", row.get("bankCategory").asText());
            commitRow.put("amount", row.get("amount").asDouble());
            commitRow.put("type", row.get("type").asText());
            commitRow.put("provisional", row.get("provisional").asBoolean());
            commitRow.put("description", row.get("description").asText());
            commitRow.put("categoryId", categoryFor(mappings, row));
            commitRow.set("updateTransactionId", row.get("matchedTransactionId"));
            rows.add(commitRow);
        }

        ObjectNode request = objectMapper.createObjectNode();
        request.put("source", "INTESA_SANPAOLO");
        request.set("rows", rows);
        request.set("mappings", mappings);
        request.set("exclusions", objectMapper.createArrayNode());

        MvcResult result = mockMvc.perform(MockMvcRequestBuilders.post("/api/import/bank/commit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    // Al secondo passaggio le categorie sono già mappate e non tornano fra le
    // unmapped: si ricostruiscono dalle righe, che portano il loro categoryId.
    private ArrayNode mappingsFor(JsonNode preview, String expenseCategory, String incomeCategory) {
        ArrayNode mappings = objectMapper.createArrayNode();
        for (JsonNode unmapped : preview.get("unmappedCategories")) {
            String type = unmapped.get("transactionType").asText();
            ObjectNode mapping = objectMapper.createObjectNode();
            mapping.put("bankCategory", unmapped.get("bankCategory").asText());
            mapping.put("transactionType", type);
            mapping.put("categoryId", type.equals("INCOME") ? incomeCategory : expenseCategory);
            mapping.put("doNotImport", false);
            mapping.put("rowCount", unmapped.get("rowCount").asInt());
            mapping.putNull("sampleDescription");
            mappings.add(mapping);
        }
        return mappings;
    }

    private String categoryFor(ArrayNode mappings, JsonNode row) {
        if (!row.get("categoryId").isNull()) return row.get("categoryId").asText();
        for (JsonNode mapping : mappings) {
            if (mapping.get("bankCategory").asText().equals(row.get("bankCategory").asText())
                    && mapping.get("transactionType").asText().equals(row.get("type").asText())) {
                return mapping.get("categoryId").asText();
            }
        }
        throw new IllegalStateException("Riga senza categoria: " + row);
    }

    private java.util.stream.Stream<JsonNode> streamOf(JsonNode array) {
        return java.util.stream.StreamSupport.stream(array.spliterator(), false);
    }

    // Riproduce il file della banca: un blocco di filtri di altezza arbitraria,
    // poi l'intestazione, poi i movimenti. `settled` trasforma il movimento
    // provvisorio nella sua versione contabilizzata, come fa la banca.
    private byte[] buildWorkbook(boolean settled) throws Exception {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Lista Movimenti");

            CellStyle dateStyle = workbook.createCellStyle();
            dateStyle.setDataFormat(workbook.createDataFormat().getFormat("dd.mm.yyyy"));

            // Il blocco di filtri sopra la tabella: il parser deve scavalcarlo.
            sheet.createRow(0).createCell(1).setCellValue("Conti e Carte:");
            sheet.createRow(2).createCell(1).setCellValue("Numero movimenti:");
            sheet.createRow(4).createCell(1).setCellValue("Tipo operazione:");

            Row header = sheet.createRow(6);
            List<String> columns = List.of(
                    "Data", "Operazione", "Dettagli", "Conto o carta",
                    "Contabilizzazione", "Categoria ", "Valuta", "Importo");
            for (int c = 0; c < columns.size(); c++) {
                header.createCell(c).setCellValue(columns.get(c));
            }

            addRow(sheet, dateStyle, 7,
                    settled ? LocalDate.of(2026, 8, 26) : LocalDate.of(2026, 8, 25),
                    settled ? "Coop Genova Gastaldi" : "Pagamento Pos",
                    settled ? "Effettuato Il 25/08/2026 Alle Ore 1723 Presso Coop Genova Gastaldi" : "Supermercato Coop. Lig",
                    !settled ? "NO" : "SI", "Generi alimentari e supermercato", -20.99);
            addRow(sheet, dateStyle, 8, LocalDate.of(2026, 8, 24), "Mc Donald's Via Venti",
                    "MC DONALD'S 24/081207 Carta n.5397 XXXX", "SI", "Ristoranti e bar", -10.59);
            addRow(sheet, dateStyle, 9, LocalDate.of(2026, 8, 20), "Farmacia Economica",
                    "FARMACIA ECONOMICA 20/080930 Carta n.5397 XXXX", "SI", "Ristoranti e bar", -57.40);
            addRow(sheet, dateStyle, 10, LocalDate.of(2026, 7, 28), "Stipendio O Pensione",
                    "COD.DISP. 0126072846406016 Bonifico a Vostro favore", "SI", "Stipendi e pensioni", 2306.73);

            // Sotto la tabella la banca mette righe di coda: il parser si ferma
            // alla prima riga senza data e importo.
            sheet.createRow(12).createCell(1).setCellValue("Legenda");

            workbook.write(out);
            return out.toByteArray();
        }
    }

    private void addRow(Sheet sheet, CellStyle dateStyle, int rowNum, LocalDate date,
                        String operation, String details, String booked, String category, double amount) {
        Row row = sheet.createRow(rowNum);
        row.createCell(0).setCellValue(date);
        row.getCell(0).setCellStyle(dateStyle);
        row.createCell(1).setCellValue(operation);
        row.createCell(2).setCellValue(details);
        row.createCell(3).setCellValue("Conto 1000/00139572");
        row.createCell(4).setCellValue(booked);
        row.createCell(5).setCellValue(category);
        row.createCell(6).setCellValue("EUR");
        row.createCell(7).setCellValue(amount);
    }
}
