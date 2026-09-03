package com.spesetracker;

import com.spesetracker.support.AbstractIntegrationTest;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cosa c'è dentro il file esportato, non solo che esca senza errori.
 *
 * <p>Gli smoke test esistenti guardano il foglio del periodo e il riepilogo. Restano fuori le
 * parti che si vedono solo aprendo il file: il blocco del risparmio, la gerarchia delle
 * categorie, l'andamento del saldo e i tre parametri di filtro — che nessun test esercitava,
 * pur essendo l'unico modo in cui l'export viene invocato dall'app quando si esporta una
 * selezione. Un file sbagliato non dà errore: si apre, e racconta numeri che non tornano.
 */
class ExcelExportContentTest extends AbstractIntegrationTest {

    private static final LocalDate MARZO = LocalDate.of(2026, 3, 10);

    // ------------------------------------------------------------------
    // Risparmio
    // ------------------------------------------------------------------

    /**
     * Il blocco del risparmio compare solo se l'obiettivo è attivo sul profilo. Nessun test
     * lo attivava, quindi finora quel ramo non era mai stato eseguito: chi usa l'obiettivo
     * avrebbe scaricato un file senza la riga che gli interessa di più.
     */
    @Test
    void conLObiettivoAttivoIlPeriodoPortaObiettivoEScostamento() throws Exception {
        String token = api.registerAndLogin();
        impostaRisparmio(token, 20);
        String entrate = api.createIncomeCategory(token);
        String uscite = api.createExpenseCategory(token);
        api.createTransaction(token, entrate, MARZO, "1000.00", "INCOME");
        api.createTransaction(token, uscite, MARZO, "150.00", "EXPENSE");

        Sheet periodo = fogliettoDelPeriodo(esporta(token));

        assertThat(etichette(periodo)).anyMatch(l -> l.startsWith("Obiettivo del periodo"));
        // 20% di 1000 = 200; risparmiato 850. Le due cifre devono coincidere con quello che
        // la card Risparmio mostra a schermo, altrimenti il file contraddice l'app.
        assertThat(valore(periodo, l -> l.startsWith("Obiettivo del periodo"))).isEqualTo(200.00);
        assertThat(valore(periodo, "Risparmiato (entrate − uscite)")).isEqualTo(850.00);
    }

    @Test
    void senzaObiettivoIlBloccoDelRisparmioNonCompare() throws Exception {
        String token = api.registerAndLogin();
        String entrate = api.createIncomeCategory(token);
        api.createTransaction(token, entrate, MARZO, "1000.00", "INCOME");

        Sheet periodo = fogliettoDelPeriodo(esporta(token));

        assertThat(etichette(periodo)).noneMatch(l -> l.startsWith("Obiettivo del periodo"));
    }

    // ------------------------------------------------------------------
    // Categorie
    // ------------------------------------------------------------------

    /**
     * Il foglio Categorie non elenca le foglie: mostra la principale col totale che comprende
     * le sue sottocategorie. È la gerarchia a rendere utile il foglio — un elenco piatto di
     * nomi finali non dice quanto si è speso "in casa" — ed è esattamente ciò che si perde
     * per primo se qualcuno semplifica il raggruppamento.
     */
    @Test
    void ilFoglioCategorieSommaLeSottocategorieSottoLaPrincipale() throws Exception {
        String token = api.registerAndLogin();
        String casa = api.createCategory(token, "Casa-" + UUID.randomUUID(), "EXPENSE");
        String bollette = sottocategoria(token, "Bollette", casa);
        String spesa = sottocategoria(token, "Spesa", casa);
        api.createTransaction(token, bollette, MARZO, "80.00", "EXPENSE");
        api.createTransaction(token, spesa, MARZO, "45.00", "EXPENSE");

        Sheet categorie = esporta(token).getSheet("Categorie");

        assertThat(categorie).isNotNull();
        assertThat(etichette(categorie)).contains("Uscite");
        // Le due sottocategorie compaiono, e sopra di loro il totale della principale.
        // Le uscite escono col segno negativo, cosi che sommare la colonna dia il netto.
        assertThat(numeriDelFoglio(categorie)).contains(-125.00, -80.00, -45.00);
    }

    @Test
    void entrateEUsciteHannoSezioniDistinte() throws Exception {
        String token = api.registerAndLogin();
        api.createTransaction(token, api.createIncomeCategory(token), MARZO, "1000.00", "INCOME");
        api.createTransaction(token, api.createExpenseCategory(token), MARZO, "42.50", "EXPENSE");

        assertThat(etichette(esporta(token).getSheet("Categorie"))).contains("Uscite", "Entrate");
    }

    // ------------------------------------------------------------------
    // Andamento del saldo
    // ------------------------------------------------------------------

    /**
     * Ogni riga si ancora al saldo registrato più vicino invece di sommare a catena dal primo
     * periodo. È il motivo per cui il foglio non contraddice la Dashboard quando c'è un saldo
     * scritto a metà dell'intervallo esportato — e un errore qui produrrebbe una curva
     * sbagliata ma plausibile, che è il modo peggiore di sbagliare.
     */
    @Test
    void lAndamentoDelSaldoParteDalSaldoRegistrato() throws Exception {
        String token = api.registerAndLogin();
        api.createCheckpoint(token, LocalDate.of(2026, 2, 28), "1000.00");
        api.createTransaction(token, api.createExpenseCategory(token), MARZO, "150.00", "EXPENSE");

        Sheet andamento = esporta(token).getSheet("Andamento del saldo");

        assertThat(andamento).isNotNull();
        Row riga = primaRigaDati(andamento, "Periodo");
        assertThat(riga.getCell(3).getNumericCellValue()).isEqualTo(1000.00);   // saldo iniziale
        assertThat(riga.getCell(5).getNumericCellValue()).isEqualTo(-150.00);   // uscite col segno
        assertThat(riga.getCell(6).getNumericCellValue()).isEqualTo(850.00);    // saldo finale
    }

    // ------------------------------------------------------------------
    // Filtri
    // ------------------------------------------------------------------

    /**
     * I tre parametri di filtro sono l'unico modo in cui l'app invoca l'export quando si
     * esporta una selezione, e nessun test li esercitava. Se smettessero di funzionare il file
     * conterrebbe più dati del richiesto: nessun errore, solo un file che dice altro.
     */
    @Test
    void ilFiltroPerDataRestringeIlContenuto() throws Exception {
        String token = api.registerAndLogin();
        String uscite = api.createExpenseCategory(token);
        api.createTransaction(token, uscite, LocalDate.of(2026, 1, 10), "10.00", "EXPENSE");
        api.createTransaction(token, uscite, MARZO, "42.50", "EXPENSE");

        Workbook filtrato = esporta(token, "from=2026-03-01&to=2026-03-31");

        assertThat(nomiFogli(filtrato)).doesNotContain("Gennaio 2026");
        assertThat(numeriDelFoglio(filtrato.getSheet("Categorie"))).contains(-42.50).doesNotContain(-10.00);
    }

    @Test
    void ilFiltroPerCategoriaTieneSoloQuella() throws Exception {
        String token = api.registerAndLogin();
        String tenuta = api.createExpenseCategory(token);
        String esclusa = api.createExpenseCategory(token);
        api.createTransaction(token, tenuta, MARZO, "42.50", "EXPENSE");
        api.createTransaction(token, esclusa, MARZO, "99.00", "EXPENSE");

        Workbook filtrato = esporta(token, "categoryId=" + tenuta);

        assertThat(numeriDelFoglio(filtrato.getSheet("Categorie"))).contains(-42.50).doesNotContain(-99.00);
    }

    /**
     * E la nota che lo dice: un file filtrato deve dichiararlo, altrimenti fra sei mesi
     * nessuno saprà più perché quei numeri non tornano con l'app.
     */
    @Test
    void unFileFiltratoLoDichiaraNelRiepilogo() throws Exception {
        String token = api.registerAndLogin();
        api.createTransaction(token, api.createExpenseCategory(token), MARZO, "42.50", "EXPENSE");

        List<String> note = etichette(esporta(token, "from=2026-03-01").getSheet("Riepilogo"));

        assertThat(note).anyMatch(n -> n.contains("Contenuto filtrato") && n.contains("dal 01/03/2026"));
    }

    @Test
    void unFileNonFiltratoNonPortaLaNota() throws Exception {
        String token = api.registerAndLogin();
        api.createTransaction(token, api.createExpenseCategory(token), MARZO, "42.50", "EXPENSE");

        assertThat(etichette(esporta(token).getSheet("Riepilogo")))
                .noneMatch(n -> n.contains("Contenuto filtrato"));
    }

    // Un utente senza dati deve comunque ottenere un file apribile, con la sua ossatura:
    // scaricare un file corrotto sarebbe peggio che scaricarne uno vuoto.
    @Test
    void unUtenteSenzaDatiOttieneUnFileValido() throws Exception {
        Workbook vuoto = esporta(api.registerAndLogin());

        assertThat(nomiFogli(vuoto)).contains("Riepilogo", "Categorie", "Ricorrenti e debiti", "Andamento del saldo");
    }

    // ------------------------------------------------------------------
    // Scorciatoie
    // ------------------------------------------------------------------

    private void impostaRisparmio(String token, int percentuale) throws Exception {
        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"savingsEnabled":true,"savingsPercent":%d}
                                """.formatted(percentuale)))
                .andExpect(status().isOk());
    }

    private String sottocategoria(String token, String nome, String parentId) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","type":"EXPENSE","color":"#3B82F6","parentId":"%s"}
                                """.formatted(nome + "-" + UUID.randomUUID(), parentId)))
                .andExpect(status().isCreated())
                .andReturn();
        return api.json(result).get("id").asText();
    }

    private Workbook esporta(String token) throws Exception {
        return esporta(token, null);
    }

    private Workbook esporta(String token, String queryString) throws Exception {
        var request = get("/api/export/excel" + (queryString == null ? "" : "?" + queryString))
                .header("Authorization", "Bearer " + token);
        MvcResult result = mockMvc.perform(request).andExpect(status().isOk()).andReturn();
        return new XSSFWorkbook(new ByteArrayInputStream(result.getResponse().getContentAsByteArray()));
    }

    /** L'unico foglio di periodo presente: i test creano transazioni in un solo periodo. */
    private Sheet fogliettoDelPeriodo(Workbook workbook) {
        for (String nome : nomiFogli(workbook)) {
            if (!List.of("Riepilogo", "Categorie", "Ricorrenti e debiti", "Andamento del saldo").contains(nome)) {
                return workbook.getSheet(nome);
            }
        }
        throw new AssertionError("Nessun foglio di periodo nel file");
    }

    private List<String> nomiFogli(Workbook workbook) {
        List<String> nomi = new ArrayList<>();
        for (int i = 0; i < workbook.getNumberOfSheets(); i++) nomi.add(workbook.getSheetName(i));
        return nomi;
    }

    /** Tutte le celle di testo della prima colonna: titoli, note ed etichette. */
    private List<String> etichette(Sheet sheet) {
        List<String> etichette = new ArrayList<>();
        for (int i = 0; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            Cell cell = row == null ? null : row.getCell(0);
            if (cell != null && cell.getCellType() == CellType.STRING) {
                etichette.add(cell.getStringCellValue());
            }
        }
        return etichette;
    }

    private double valore(Sheet sheet, String etichetta) {
        return valore(sheet, etichetta::equals);
    }

    private double valore(Sheet sheet, java.util.function.Predicate<String> corrisponde) {
        for (int i = 0; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            Cell cell = row == null ? null : row.getCell(0);
            if (cell != null && cell.getCellType() == CellType.STRING && corrisponde.test(cell.getStringCellValue())) {
                return row.getCell(1).getNumericCellValue();
            }
        }
        throw new AssertionError("Etichetta non trovata nel foglio " + sheet.getSheetName());
    }

    /** Tutti i numeri del foglio, per verificare un totale senza dipendere da dove sta. */
    private List<Double> numeriDelFoglio(Sheet sheet) {
        List<Double> numeri = new ArrayList<>();
        for (int i = 0; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            for (int c = 0; c < row.getLastCellNum(); c++) {
                Cell cell = row.getCell(c);
                if (cell != null && cell.getCellType() == CellType.NUMERIC) {
                    numeri.add(cell.getNumericCellValue());
                }
            }
        }
        return numeri;
    }

    /** La riga subito dopo l'intestazione che comincia con l'etichetta indicata. */
    private Row primaRigaDati(Sheet sheet, String primaColonnaIntestazione) {
        for (int i = 0; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            Cell cell = row == null ? null : row.getCell(0);
            if (cell != null && cell.getCellType() == CellType.STRING
                    && primaColonnaIntestazione.equals(cell.getStringCellValue())) {
                return sheet.getRow(i + 1);
            }
        }
        throw new AssertionError("Intestazione \"" + primaColonnaIntestazione + "\" non trovata");
    }
}
