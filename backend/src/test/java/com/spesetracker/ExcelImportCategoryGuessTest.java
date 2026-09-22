package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

import static com.spesetracker.support.XlsxFixtures.setNumeric;
import static com.spesetracker.support.XlsxFixtures.setText;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * In quale categoria l'importazione propone di mettere una spesa fissa.
 *
 * <p>{@code guessRecurringCategoryName} smista per nome: gli abbonamenti video e
 * musicali sotto "Abbonamenti", gli operatori telefonici sotto "Utenze", e tutto
 * il resto sotto "Fisso". Di questi tre solo il primo era stato eseguito da un
 * test — il diario di prova contiene Spotify e Disney — quindi due categorie su
 * tre non erano mai state proposte da nessuna parte.
 *
 * <p>Non è un dettaglio estetico: la proposta arriva già spuntata nella
 * schermata di import, e chi conferma senza guardare si ritrova le bollette del
 * telefono dove non le cerca.
 */
class ExcelImportCategoryGuessTest extends AbstractIntegrationTest {

    @Test
    void smistaGliAbbonamentiGliOperatoriEIlResto() throws Exception {
        String token = api.registerAndLogin();

        JsonNode preview = analizza(token, diarioConFisse(List.of(
                new Fissa("Spotify", 11.00),
                new Fissa("Iliad", 9.99),
                new Fissa("Affitto garage", 60.00))));

        // Ogni spesa fissa porta il riferimento a una categoria proposta; qui si
        // guarda il nome che l'app ha scelto per ciascuna.
        assertThat(nomiCategorieProposte(preview))
                .contains("Abbonamenti", "Utenze", "Fisso");
    }

    /**
     * Quando una categoria con quel nome esiste già, l'importazione la riusa
     * invece di proporne una nuova. È il caso normale di chi importa nella
     * struttura che ha già costruito, e non era mai stato eseguito: senza quel
     * ramo l'import creerebbe un doppione con lo stesso nome — che il vincolo di
     * unicità sui nomi rifiuterebbe, facendo fallire l'importazione intera.
     */
    @Test
    void riusaUnaCategoriaEsistenteInveceDiProporneUnaNuova() throws Exception {
        String token = api.registerAndLogin();
        String esistente = api.createCategory(token, "Abbonamenti", "EXPENSE");

        JsonNode preview = analizza(token, diarioConFisse(List.of(new Fissa("Spotify", 11.00))));

        // Nessuna categoria da creare, e la spesa punta a quella che c'era già.
        assertThat(preview.get("newCategorySuggestions")).isEmpty();
        assertThat(preview.get("recurringTransactions").get(0).get("existingCategoryId").asText())
                .isEqualTo(esistente);
        assertThat(preview.get("summary").get("itemsNeedingCategory").asInt()).isZero();
    }

    /**
     * Le due guardie del commit, entrambe scoperte. Il frontend non lascia
     * arrivare fin qui né una voce senza categoria né un riferimento a una
     * categoria che non verrà creata — ma sono i due modi in cui un carico
     * malformato produrrebbe transazioni senza categoria in archivio, e il
     * backend non può fidarsi di chi lo chiama.
     */
    @Test
    void unaVoceSenzaCategoriaFermaIlCommit() throws Exception {
        String token = api.registerAndLogin();
        ObjectNode carico = (ObjectNode) analizza(token, diarioConFisse(List.of(new Fissa("Spotify", 11.00))));

        // Si toglie il riferimento alla categoria proposta: la voce resta orfana.
        ObjectNode fissa = (ObjectNode) carico.get("recurringTransactions").get(0);
        fissa.putNull("existingCategoryId");
        fissa.putNull("newCategoryTempId");

        // Il codice da solo non basta: le due guardie rispondono entrambe 400, e
        // senza guardare il messaggio questo test passava anche neutralizzando
        // quella che dice di provare.
        commitAtteso(token, carico, "Ogni transazione deve avere una categoria assegnata");
    }

    @Test
    void unRiferimentoAUnaCategoriaCheNessunoCreeraFermaIlCommit() throws Exception {
        String token = api.registerAndLogin();
        ObjectNode carico = (ObjectNode) analizza(token, diarioConFisse(List.of(new Fissa("Spotify", 11.00))));

        // La voce punta a una categoria proposta che però non è nell'elenco di
        // quelle da creare: il riferimento non si risolverà mai.
        ObjectNode fissa = (ObjectNode) carico.get("recurringTransactions").get(0);
        fissa.putNull("existingCategoryId");
        fissa.put("newCategoryTempId", "mai-proposta");

        commitAtteso(token, carico, "Riferimento a categoria sconosciuto");
    }

    // ------------------------------------------------------------------
    // Scorciatoie
    // ------------------------------------------------------------------

    /** Il commit deve fallire con 400 e con il messaggio indicato, non con un 400 qualsiasi. */
    private void commitAtteso(String token, ObjectNode carico, String messaggio) throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/api/import/excel/commit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(carico)))
                .andExpect(status().isBadRequest())
                .andExpect(result -> assertThat(result.getResolvedException())
                        .hasMessageContaining(messaggio));
    }

    private record Fissa(String nome, double importo) {
    }

    private List<String> nomiCategorieProposte(JsonNode preview) {
        List<String> nomi = new ArrayList<>();
        for (JsonNode c : preview.get("newCategorySuggestions")) nomi.add(c.get("name").asText());
        return nomi;
    }

    private JsonNode analizza(String token, byte[] file) throws Exception {
        MvcResult result = mockMvc.perform(MockMvcRequestBuilders
                        .multipart("/api/import/excel/analyze")
                        .file(new MockMultipartFile("file", "diario.xlsx",
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    /**
     * Un diario minimo con due mesi identici: una spesa è riconosciuta come
     * ricorrente solo se compare con lo stesso nome e importo in almeno due
     * fogli mensili.
     */
    private byte[] diarioConFisse(List<Fissa> fisse) throws Exception {
        try (Workbook workbook = new XSSFWorkbook()) {
            foglioMensile(workbook, "Gennaio", fisse);
            foglioMensile(workbook, "Febbraio", fisse);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        }
    }

    private void foglioMensile(Workbook workbook, String nome, List<Fissa> fisse) {
        Sheet sheet = workbook.createSheet(nome);
        setText(sheet, 1, 0, "Data");
        setText(sheet, 1, 1, "Nome");
        setText(sheet, 1, 2, "Costo");
        setText(sheet, 1, 4, "Data");
        setText(sheet, 1, 5, "Nome");
        setText(sheet, 1, 6, "Costo");

        int riga = 2;
        for (Fissa fissa : fisse) {
            // Senza data nella colonna delle fisse: è così che il diario segna
            // una spesa che si ripete ogni mese.
            setText(sheet, riga, 1, fissa.nome());
            setNumeric(sheet, riga, 2, fissa.importo());
            riga++;
        }
    }
}
