package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * La cascata di classificazione dell'import bancario.
 *
 * <p>Il motivo per cui questa classe esiste: fino a ieri <strong>tre dei sei esiti non venivano
 * prodotti da nessun test</strong>. {@code ESCLUSA}, {@code SOSPETTO_MANUALE} e
 * {@code SOSPETTO_RICORRENTE} sono esattamente i casi in cui l'app si ferma e chiede invece di
 * decidere da sola — cioè le uniche difese contro un doppione che entra in archivio senza che
 * nessuno se ne accorga. Erano tutte al buio.
 *
 * <p>Lo smoke test esistente copre il percorso felice (nuova → già importata → riabbinata);
 * qui si prova quello che succede quando qualcosa non torna.
 */
class BankImportOutcomesTest extends AbstractIntegrationTest {

    // Nel futuro di proposito: creare una regola ricorrente con scadenza passata la fa
    // recuperare subito (create -> processDueRule), e la scadenza scapperebbe via dalla
    // finestra di confronto prima ancora che il test cominci.
    private static final LocalDate DATA = LocalDate.now().plusDays(10);

    /** Una riga dell'estratto conto, con quel poco che serve a costruirla. */
    private record Movimento(LocalDate data, String operazione, String dettagli, boolean contabilizzato,
                             String categoriaBanca, double importo) {
    }

    private Movimento spesa(double importo) {
        return new Movimento(DATA, "Farmacia Economica", "FARMACIA ECONOMICA Carta n.5397",
                true, "Salute", -importo);
    }

    // ------------------------------------------------------------------
    // ESCLUSA
    // ------------------------------------------------------------------

    /**
     * La mappatura "non importare": si sceglie una volta che una categoria della banca non
     * interessa (i giroconti fra conti propri, per esempio) e da lì in poi quelle righe restano
     * fuori da sole.
     */
    @Test
    void unaCategoriaMappataANonImportareEsclueLeSueRighe() throws Exception {
        String token = api.registerAndLogin();
        byte[] file = workbook(List.of(spesa(57.40)));

        // Primo giro: si salva la mappatura con doNotImport, senza righe da importare.
        ArrayNode mappature = objectMapper.createArrayNode();
        ObjectNode m = mappature.addObject();
        m.put("bankCategory", "Salute");
        m.put("transactionType", "EXPENSE");
        m.putNull("categoryId");
        m.put("doNotImport", true);
        m.put("rowCount", 1);
        m.putNull("sampleDescription");
        commit(token, objectMapper.createArrayNode(), mappature, objectMapper.createArrayNode());

        JsonNode preview = analyze(token, file);

        assertThat(esiti(preview)).containsExactly("ESCLUSA");
    }

    /**
     * L'esclusione per testo, e con essa tutto il giro che non era mai stato percorso:
     * proposta → salvata al commit → applicata all'analisi successiva. Prima di questo test
     * {@code saveExclusions} non veniva <em>mai</em> eseguita.
     */
    @Test
    void unEsclusionePerTestoVieneSalvataEApplicataAlGiroDopo() throws Exception {
        String token = api.registerAndLogin();
        byte[] file = workbook(List.of(spesa(57.40)));

        ArrayNode esclusioni = objectMapper.createArrayNode();
        ObjectNode e = esclusioni.addObject();
        e.put("pattern", "FARMACIA");
        e.putNull("note");
        commit(token, objectMapper.createArrayNode(), objectMapper.createArrayNode(), esclusioni);

        JsonNode preview = analyze(token, file);

        assertThat(esiti(preview)).containsExactly("ESCLUSA");
    }

    // ------------------------------------------------------------------
    // SOSPETTO_MANUALE
    // ------------------------------------------------------------------

    /**
     * La spesa già scritta a mano. Senza questo controllo l'import la riscriverebbe, e l'utente
     * si ritroverebbe la stessa uscita due volte — con il saldo sbagliato e nessuna indicazione
     * su quale delle due cancellare.
     */
    @Test
    void unaSpesaGiaScrittaAManoDiventaSospetta() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        api.createTransaction(token, categoria, DATA, "57.40", "EXPENSE");

        JsonNode preview = analyze(token, workbook(List.of(spesa(57.40))));

        assertThat(esiti(preview)).containsExactly("SOSPETTO_MANUALE");
        assertThat(preview.get("rows").get(0).get("conflictDescription").asText())
                .contains("Gia' presente, scritta a mano");
    }

    /**
     * Due provvisorie con lo stesso importo negli stessi giorni: indovinare quale sia diventata
     * definitiva vorrebbe dire riscrivere la spesa sbagliata senza dirlo. L'app si ferma e
     * chiede.
     */
    @Test
    void duePrevvisorieAmbigueFannoFermareLApp() throws Exception {
        String token = api.registerAndLogin();
        byte[] provvisorio = workbook(List.of(
                new Movimento(DATA, "Pagamento Pos", "PRIMO NEGOZIO", false, "Salute", -57.40),
                new Movimento(DATA.plusDays(1), "Pagamento Pos", "SECONDO NEGOZIO", false, "Salute", -57.40)));
        importaTutto(token, provvisorio);

        // Ora la banca contabilizza: una sola riga, ma due candidate in archivio.
        JsonNode preview = analyze(token, workbook(List.of(
                new Movimento(DATA.plusDays(2), "Farmacia Economica", "DEFINITIVO", true, "Salute", -57.40))));

        assertThat(esiti(preview)).containsExactly("SOSPETTO_MANUALE");
        assertThat(preview.get("rows").get(0).get("conflictDescription").asText())
                .contains("non so quale di loro sia diventato questo");
    }

    /**
     * L'export vecchio ripassato dopo uno più recente: nel file la riga è ancora provvisoria, ma
     * in archivio c'è già la sua versione definitiva, con un'altra impronta. Senza questo
     * controllo rientrerebbe come nuova, e sarebbe un doppione.
     */
    @Test
    void unExportVecchioNonRientraComeNuovo() throws Exception {
        String token = api.registerAndLogin();
        // Prima si importa la versione definitiva.
        importaTutto(token, workbook(List.of(
                new Movimento(DATA, "Farmacia Economica", "DEFINITIVO", true, "Salute", -57.40))));

        // Poi si ripassa un export più vecchio, dove lo stesso movimento è ancora provvisorio.
        JsonNode preview = analyze(token, workbook(List.of(
                new Movimento(DATA.minusDays(1), "Pagamento Pos", "ANCORA PROVVISORIO", false, "Salute", -57.40))));

        assertThat(esiti(preview)).containsExactly("SOSPETTO_MANUALE");
        assertThat(preview.get("rows").get(0).get("conflictDescription").asText())
                .contains("versione provvisoria di un movimento gia' definitivo");
    }

    // ------------------------------------------------------------------
    // SOSPETTO_RICORRENTE
    // ------------------------------------------------------------------

    /**
     * La regola ricorrente che sta per generare la stessa spesa. Il confronto è a tolleranza
     * (20%) e su una finestra di pochi giorni: una regola mensile è attiva tutto l'anno, e
     * guardare solo l'importo la farebbe accostare a qualsiasi spesa simile.
     */
    @Test
    void unaRegolaRicorrenteInArrivoRendeLaRigaSospetta() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        // Scadenza a due giorni dalla riga, importo entro il 20%.
        creaRicorrente(token, categoria, "Bolletta luce", "60.00", DATA.plusDays(2));

        JsonNode preview = analyze(token, workbook(List.of(spesa(57.40))));

        assertThat(esiti(preview)).containsExactly("SOSPETTO_RICORRENTE");
        assertThat(preview.get("rows").get(0).get("conflictDescription").asText())
                .contains("Sta per generarla la regola ricorrente");
    }

    /**
     * L'altra metà del conflitto ricorrente, e quella che conta di più: non una
     * regola che <em>sta per</em> generare, ma la transazione che ha <em>già</em>
     * generato. È il caso in cui il doppio conteggio è reale e non ipotetico —
     * la spesa è in archivio due volte se la riga entra — ed era l'unico dei due
     * rami senza test.
     *
     * <p>Serve una data nel passato — le altre prove di questo file usano una
     * data futura — perché una regola genera l'occorrenza solo quando la
     * scadenza è arrivata: alla creazione la regola recupera l'arretrato, e da
     * lì in archivio c'è una transazione legata a una regola.
     */
    @Test
    void unaSpesaGiaGenerataDaUnaRegolaRendeLaRigaSospetta() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        LocalDate passata = LocalDate.now().minusDays(5);
        creaRicorrente(token, categoria, "Bolletta luce", "57.40", passata);

        JsonNode preview = analyze(token, workbook(List.of(
                new Movimento(passata, "Farmacia Economica", "FARMACIA ECONOMICA Carta n.5397",
                        true, "Salute", -57.40))));

        assertThat(esiti(preview)).containsExactly("SOSPETTO_RICORRENTE");
        // Il messaggio distingue i due casi: "l'ha già generata" invece di "sta
        // per generarla". Chi legge deve sapere se la spesa è già in archivio.
        assertThat(preview.get("rows").get(0).get("conflictDescription").asText())
                .contains("gia' generata da una regola ricorrente");
    }

    /**
     * E il verso opposto, che è ciò che rende utile la tolleranza invece di dannosa: un importo
     * fuori dal 20% non è la stessa spesa, e la riga resta nuova. Senza questo, un bonifico da
     * 87 euro si accosterebbe alla "Bolletta luce" da 95.
     */
    @Test
    void unImportoFuoriTolleranzaNonVieneAccostatoAllaRegola() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        creaRicorrente(token, categoria, "Bolletta luce", "150.00", DATA.plusDays(2));

        assertThat(esiti(analyze(token, workbook(List.of(spesa(57.40)))))).containsExactly("NUOVA");
    }

    @Test
    void unaRegolaLontanaNelTempoNonCentraNulla() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        // Importo compatibile, ma scadenza fuori dalla finestra di pochi giorni.
        creaRicorrente(token, categoria, "Bolletta luce", "60.00", DATA.plusDays(20));

        assertThat(esiti(analyze(token, workbook(List.of(spesa(57.40)))))).containsExactly("NUOVA");
    }

    // ------------------------------------------------------------------
    // Le guardie del commit
    // ------------------------------------------------------------------

    /**
     * Il browser può rimandare indietro una riga già importata — un doppio invio, un ritorno
     * sulla pagina. Senza questa guardia il vincolo di unicità sull'impronta farebbe fallire
     * l'intero import, non solo quella riga.
     */
    @Test
    void unaRigaGiaImportataRimandataAlCommitVieneSaltata() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        byte[] file = workbook(List.of(spesa(57.40)));
        JsonNode preview = analyze(token, file);
        ArrayNode righe = righeDaImportare(preview, categoria);

        JsonNode primo = commit(token, righe, objectMapper.createArrayNode(), objectMapper.createArrayNode());
        assertThat(primo.get("importate").asInt()).isEqualTo(1);

        // Le stesse righe, rimandate identiche.
        JsonNode secondo = commit(token, righe, objectMapper.createArrayNode(), objectMapper.createArrayNode());

        assertThat(secondo.get("importate").asInt()).isZero();
        assertThat(secondo.get("saltate").asInt()).isEqualTo(1);
        assertThat(api.listTransactions(token)).hasSize(1);
    }

    @Test
    void unaRigaNuovaSenzaCategoriaVieneRifiutata() throws Exception {
        String token = api.registerAndLogin();
        JsonNode preview = analyze(token, workbook(List.of(spesa(57.40))));
        ArrayNode righe = righeDaImportare(preview, null);

        ObjectNode request = objectMapper.createObjectNode();
        request.put("source", "INTESA_SANPAOLO");
        request.set("rows", righe);
        request.set("mappings", objectMapper.createArrayNode());
        request.set("exclusions", objectMapper.createArrayNode());

        mockMvc.perform(MockMvcRequestBuilders.post("/api/import/bank/commit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    /**
     * La terza guardia contro il doppio invio, l'unica che restava scoperta.
     *
     * <p>Una riga può chiedere di <em>riscrivere</em> una transazione già in
     * archivio, ma solo se quella è ancora segnata come provvisoria. Se non lo è
     * più — perché un invio precedente l'ha già resa definitiva — la riga viene
     * saltata invece di riscriverla una seconda volta. Senza, un doppio clic
     * sul pulsante di conferma sovrascriverebbe una transazione già sistemata,
     * magari corretta a mano nel frattempo.
     */
    @Test
    void unaRigaCheChiedeDiRiscrivereQualcosaDiGiaDefinitivoVieneSaltata() throws Exception {
        String token = api.registerAndLogin();
        String categoria = api.createExpenseCategory(token);
        // Una transazione normale: non è provvisoria, quindi non è riscrivibile.
        String definitiva = api.createTransaction(
                token, categoria, LocalDate.of(2026, 3, 2), "57.40", "EXPENSE");

        JsonNode preview = analyze(token, workbook(List.of(spesa(57.40))));
        ArrayNode righe = righeDaImportare(preview, categoria);
        ((ObjectNode) righe.get(0)).put("updateTransactionId", definitiva);

        JsonNode esito = commit(token, righe, objectMapper.createArrayNode(), objectMapper.createArrayNode());

        assertThat(esito.get("saltate").asInt()).isEqualTo(1);
        assertThat(esito.get("importate").asInt()).isZero();
        // E la transazione di partenza è rimasta com'era.
        assertThat(api.listTransactions(token)).hasSize(1);
    }

    /**
     * Una categoria che non esiste nel corpo del commit dà 400, non 500. Il
     * frontend la manda sempre valida, quindi ci si arriva solo con un id
     * rimasto in una scheda aperta da ore — cioè proprio quando serve un
     * messaggio comprensibile invece di un errore imprevisto.
     */
    @Test
    void unaCategoriaInesistenteNelCommitVieneRifiutata() throws Exception {
        String token = api.registerAndLogin();
        JsonNode preview = analyze(token, workbook(List.of(spesa(57.40))));
        ArrayNode righe = righeDaImportare(preview, "00000000-0000-4000-8000-000000000000");

        ObjectNode request = objectMapper.createObjectNode();
        request.put("source", "INTESA_SANPAOLO");
        request.set("rows", righe);
        request.set("mappings", objectMapper.createArrayNode());
        request.set("exclusions", objectMapper.createArrayNode());

        mockMvc.perform(MockMvcRequestBuilders.post("/api/import/bank/commit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------
    // Scorciatoie
    // ------------------------------------------------------------------

    private List<String> esiti(JsonNode preview) {
        List<String> out = new ArrayList<>();
        for (JsonNode row : preview.get("rows")) out.add(row.get("outcome").asText());
        return out;
    }

    private JsonNode analyze(String token, byte[] file) throws Exception {
        MvcResult result = mockMvc.perform(MockMvcRequestBuilders
                        .multipart("/api/import/bank/analyze")
                        .file(new MockMultipartFile("file", "movimenti.xlsx",
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file))
                        .param("source", "INTESA_SANPAOLO")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode commit(String token, ArrayNode rows, ArrayNode mappings, ArrayNode exclusions) throws Exception {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("source", "INTESA_SANPAOLO");
        request.set("rows", rows);
        request.set("mappings", mappings);
        request.set("exclusions", exclusions);

        MvcResult result = mockMvc.perform(MockMvcRequestBuilders.post("/api/import/bank/commit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    /** Le righe importabili dell'anteprima, con la categoria indicata (null per ometterla). */
    private ArrayNode righeDaImportare(JsonNode preview, String categoriaId) {
        ArrayNode rows = objectMapper.createArrayNode();
        for (JsonNode row : preview.get("rows")) {
            String outcome = row.get("outcome").asText();
            if (!outcome.equals("NUOVA") && !outcome.equals("AGGIORNA_PROVVISORIA")) continue;
            ObjectNode r = rows.addObject();
            r.put("occurredOn", row.get("occurredOn").asText());
            r.put("rawOperation", row.get("rawOperation").asText());
            r.put("rawDetails", row.get("rawDetails").asText());
            r.put("bankCategory", row.get("bankCategory").asText());
            r.put("amount", row.get("amount").asDouble());
            r.put("type", row.get("type").asText());
            r.put("provisional", row.get("provisional").asBoolean());
            r.put("description", row.get("description").asText());
            if (categoriaId == null) r.putNull("categoryId");
            else r.put("categoryId", categoriaId);
            r.set("updateTransactionId", row.get("matchedTransactionId"));
        }
        return rows;
    }

    /** Analizza e importa tutto quello che si può, creando una categoria al volo. */
    private void importaTutto(String token, byte[] file) throws Exception {
        String categoria = api.createExpenseCategory(token);
        JsonNode preview = analyze(token, file);
        commit(token, righeDaImportare(preview, categoria),
                objectMapper.createArrayNode(), objectMapper.createArrayNode());
    }

    private void creaRicorrente(String token, String categoria, String nome, String importo, LocalDate scadenza)
            throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"%s","defaultAmount":%s,"intervalUnit":"MONTH",\
                                "intervalValue":1,"startDate":"%s","nextDueDate":"%s"}
                                """.formatted(categoria, nome, importo, scadenza, scadenza)))
                .andExpect(status().isCreated());
    }

    /** Un estratto conto con le righe indicate, nella forma che il parser si aspetta. */
    private byte[] workbook(List<Movimento> movimenti) throws Exception {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Lista Movimenti");
            CellStyle dateStyle = workbook.createCellStyle();
            dateStyle.setDataFormat(workbook.createDataFormat().getFormat("dd.mm.yyyy"));

            sheet.createRow(0).createCell(1).setCellValue("Conti e Carte:");
            Row header = sheet.createRow(2);
            List<String> columns = List.of("Data", "Operazione", "Dettagli", "Conto o carta",
                    "Contabilizzazione", "Categoria ", "Valuta", "Importo");
            for (int c = 0; c < columns.size(); c++) header.createCell(c).setCellValue(columns.get(c));

            int r = 3;
            for (Movimento m : movimenti) {
                Row row = sheet.createRow(r++);
                row.createCell(0).setCellValue(m.data());
                row.getCell(0).setCellStyle(dateStyle);
                row.createCell(1).setCellValue(m.operazione());
                row.createCell(2).setCellValue(m.dettagli());
                row.createCell(3).setCellValue("Conto 1000/00139572");
                row.createCell(4).setCellValue(m.contabilizzato() ? "SI" : "NO");
                row.createCell(5).setCellValue(m.categoriaBanca());
                row.createCell(6).setCellValue("EUR");
                row.createCell(7).setCellValue(m.importo());
            }
            sheet.createRow(r + 1).createCell(1).setCellValue("Legenda");

            workbook.write(out);
            return out.toByteArray();
        }
    }
}
