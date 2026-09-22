package com.spesetracker;

import com.spesetracker.service.bankimport.BankStatementRow;
import com.spesetracker.service.bankimport.IntesaSanpaoloParser;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;

import static com.spesetracker.support.XlsxFixtures.setDate;
import static com.spesetracker.support.XlsxFixtures.setFormula;
import static com.spesetracker.support.XlsxFixtures.setNumeric;
import static com.spesetracker.support.XlsxFixtures.setText;
import static com.spesetracker.support.XlsxFixtures.toBytes;
import static com.spesetracker.support.XlsxFixtures.workbook;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Il parser dell'estratto conto Intesa Sanpaolo. Non ha dipendenze da Spring né dal database:
 * si costruisce con {@code new} e gira in millisecondi, il che lo rende il posto più economico
 * della suite dove verificare comportamenti che altrimenti costerebbero un test di integrazione.
 *
 * <p>Vale la pena testarlo perché è l'unico punto dell'app che legge un file scritto da qualcun
 * altro: quando la banca cambia l'export, qui è dove ce ne accorgiamo — o dove non ce ne
 * accorgiamo affatto.
 */
class IntesaSanpaoloParserTest {

    private final IntesaSanpaoloParser parser = new IntesaSanpaoloParser();

    private static final LocalDate PRIMO = LocalDate.of(2026, 3, 2);

    /** Un foglio con il blocco di filtri in testa e l'intestazione alla riga indicata. */
    private XSSFWorkbook estrattoConto(int rigaIntestazione) {
        XSSFWorkbook wb = workbook("Lista Movimenti");
        Sheet sheet = wb.getSheetAt(0);
        setText(sheet, 0, 0, "Conto corrente");
        setText(sheet, 1, 0, "Periodo: 01/03/2026 - 31/03/2026");
        setText(sheet, rigaIntestazione, 0, "Data");
        setText(sheet, rigaIntestazione, 1, "Operazione");
        setText(sheet, rigaIntestazione, 2, "Dettagli");
        setText(sheet, rigaIntestazione, 3, "Conto o carta");
        setText(sheet, rigaIntestazione, 4, "Contabilizzazione");
        setText(sheet, rigaIntestazione, 5, "Categoria ");
        setText(sheet, rigaIntestazione, 6, "Importo");
        return wb;
    }

    private void movimento(Sheet sheet, int r, LocalDate data, String operazione, double importo) {
        setDate(sheet, r, 0, data);
        setText(sheet, r, 1, operazione);
        setText(sheet, r, 2, "dettagli " + operazione);
        setText(sheet, r, 3, "Conto 1234");
        setText(sheet, r, 4, "SI");
        setText(sheet, r, 5, "Bonifici in uscita");
        setNumeric(sheet, r, 6, importo);
    }

    private List<BankStatementRow> parse(XSSFWorkbook wb) throws IOException {
        return parser.parse(new ByteArrayInputStream(toBytes(wb)));
    }

    @Test
    void leggeIMovimentiConTutteLeColonne() throws Exception {
        XSSFWorkbook wb = estrattoConto(4);
        Sheet sheet = wb.getSheetAt(0);
        movimento(sheet, 5, PRIMO, "Pagamento POS", -42.50);
        movimento(sheet, 6, PRIMO.plusDays(1), "Bonifico", -70.00);

        List<BankStatementRow> rows = parse(wb);

        assertThat(rows).hasSize(2);
        BankStatementRow prima = rows.get(0);
        assertThat(prima.date()).isEqualTo(PRIMO);
        assertThat(prima.operation()).isEqualTo("Pagamento POS");
        assertThat(prima.amount()).isEqualByComparingTo("-42.50");
        assertThat(prima.bankCategory()).isEqualTo("Bonifici in uscita");
        assertThat(prima.booked()).isTrue();
        // Il numero di riga è quello che si legge in Excel (1-based), non l'indice POI:
        // serve a chi apre il file per confrontare una riga sospetta.
        assertThat(prima.rowNumber()).isEqualTo(6);
    }

    /**
     * Il caso peggiore del parser, ed è per questo che è il primo test della classe.
     *
     * <p>La tabella "finisce" alla prima riga senza data o importo, perché sotto la banca
     * scrive totali e note. Ma una riga vuota <em>dentro</em> la tabella — che gli export
     * producono, per esempio come separatore fra periodi — ha lo stesso aspetto: l'import si
     * ferma lì e i movimenti successivi non entrano. Nessun errore, nessun avviso: l'utente
     * vede solo un estratto conto importato a metà, e non ha modo di sapere che manca qualcosa.
     *
     * <p>Il test fissa il comportamento di oggi. Serve a rendere visibile la perdita a chi
     * lavorerà su questo file: se un domani si decide di saltare le righe vuote invece di
     * fermarsi, questo test fallisce e va aggiornato — consapevolmente.
     */
    @Test
    void unaRigaVuotaAMetaTabellaTroncaLImportInSilenzio() throws Exception {
        XSSFWorkbook wb = estrattoConto(4);
        Sheet sheet = wb.getSheetAt(0);
        movimento(sheet, 5, PRIMO, "Pagamento POS", -42.50);
        // riga 6 lasciata vuota
        movimento(sheet, 7, PRIMO.plusDays(2), "Bonifico psicologa", -70.00);
        movimento(sheet, 8, PRIMO.plusDays(3), "Stipendio", 1885.14);

        List<BankStatementRow> rows = parse(wb);

        assertThat(rows).hasSize(1);
        assertThat(rows).extracting(BankStatementRow::operation).containsExactly("Pagamento POS");
    }

    /**
     * L'altra faccia della stessa regola, e il motivo per cui non è semplicemente un errore:
     * le righe vuote <em>prima</em> del primo movimento vanno saltate, perché fra
     * l'intestazione e i dati l'export lascia spesso una riga di stacco.
     */
    @Test
    void leRigheVuotePrimaDelPrimoMovimentoSonoSaltate() throws Exception {
        XSSFWorkbook wb = estrattoConto(4);
        Sheet sheet = wb.getSheetAt(0);
        // righe 5 e 6 vuote
        movimento(sheet, 7, PRIMO, "Pagamento POS", -42.50);

        assertThat(parse(wb)).hasSize(1);
    }

    /**
     * E il caso che rende il troncamento pericoloso invece che teorico: {@code readNumeric}
     * viene chiamato dal parser <em>senza valutatore di formule</em>, quindi un importo scritto
     * come formula si legge null. Una sola cella così a metà tabella si comporta esattamente
     * come una riga vuota: l'import si ferma, in silenzio.
     */
    @Test
    void unImportoScrittoComeFormulaTroncaLaTabella() throws Exception {
        XSSFWorkbook wb = estrattoConto(4);
        Sheet sheet = wb.getSheetAt(0);
        movimento(sheet, 5, PRIMO, "Pagamento POS", -42.50);
        setDate(sheet, 6, 0, PRIMO.plusDays(1));
        setText(sheet, 6, 1, "Bonifico calcolato");
        setFormula(sheet, 6, 6, "-35*2");
        movimento(sheet, 7, PRIMO.plusDays(2), "Ultimo", -10.00);

        assertThat(parse(wb)).hasSize(1);
    }

    /** Sotto la tabella la banca scrive i totali: non sono movimenti e devono restare fuori. */
    @Test
    void iTotaliSottoLaTabellaNonEntrano() throws Exception {
        XSSFWorkbook wb = estrattoConto(4);
        Sheet sheet = wb.getSheetAt(0);
        movimento(sheet, 5, PRIMO, "Pagamento POS", -42.50);
        setText(sheet, 6, 0, "Totale uscite");
        setNumeric(sheet, 6, 6, -42.50);

        assertThat(parse(wb)).hasSize(1);
    }

    /**
     * Se la colonna della contabilizzazione manca, la riga va considerata definitiva. Il
     * contrario — trattarla come provvisoria — la lascerebbe in attesa per sempre di una
     * conferma che nessun export porterà mai.
     */
    @Test
    void senzaLaColonnaContabilizzazioneLaRigaEDefinitiva() throws Exception {
        XSSFWorkbook wb = workbook("Lista Movimenti");
        Sheet sheet = wb.getSheetAt(0);
        setText(sheet, 0, 0, "Data");
        setText(sheet, 0, 1, "Operazione");
        setText(sheet, 0, 2, "Importo");
        setDate(sheet, 1, 0, PRIMO);
        setText(sheet, 1, 1, "Pagamento POS");
        setNumeric(sheet, 1, 2, -42.50);

        List<BankStatementRow> rows = parse(wb);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).booked()).isTrue();
    }

    // Solo un "SI" esplicito conta come contabilizzato; qualunque altra cosa è provvisoria.
    @Test
    void soloUnSiEsplicitoContabilizzaLaRiga() throws Exception {
        XSSFWorkbook wb = estrattoConto(4);
        Sheet sheet = wb.getSheetAt(0);
        movimento(sheet, 5, PRIMO, "Contabilizzata", -10.00);
        movimento(sheet, 6, PRIMO, "Provvisoria", -20.00);
        setText(sheet, 6, 4, "NO");
        movimento(sheet, 7, PRIMO, "Minuscolo", -30.00);
        setText(sheet, 7, 4, "si");

        assertThat(parse(wb)).extracting(BankStatementRow::booked)
                .containsExactly(true, false, true);
    }

    // L'intestazione si cerca invece di darla per fissa: il blocco dei filtri sopra la tabella
    // cambia altezza da un export all'altro.
    @Test
    void trovaLIntestazioneOvunqueSiaEntroIlLimiteDiScansione() throws Exception {
        XSSFWorkbook wb = estrattoConto(30);
        movimento(wb.getSheetAt(0), 31, PRIMO, "Pagamento POS", -42.50);

        assertThat(parse(wb)).hasSize(1);
    }

    @Test
    void oltreIlLimiteDiScansioneRinunciaConUnMessaggioLeggibile() throws Exception {
        XSSFWorkbook wb = estrattoConto(70);
        movimento(wb.getSheetAt(0), 71, PRIMO, "Pagamento POS", -42.50);

        assertThatThrownBy(() -> parse(wb))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Non ho trovato la tabella dei movimenti");
    }

    // Le colonne si leggono per nome: "Categoria " ha uno spazio in coda nel file vero, e le
    // maiuscole non sono garantite.
    @Test
    void leIntestazioniSiConfrontanoNormalizzate() throws Exception {
        XSSFWorkbook wb = workbook("Lista Movimenti");
        Sheet sheet = wb.getSheetAt(0);
        setText(sheet, 0, 0, "  DATA  ");
        setText(sheet, 0, 1, "Operazione");
        setText(sheet, 0, 2, "IMPORTO");
        setDate(sheet, 1, 0, PRIMO);
        setText(sheet, 1, 1, "Pagamento POS");
        setNumeric(sheet, 1, 2, -42.50);

        assertThat(parse(wb)).hasSize(1);
    }

    @Test
    void unaTabellaSenzaMovimentiLoDiceInveceDiRestituireUnElencoVuoto() throws Exception {
        assertThatThrownBy(() -> parse(estrattoConto(4)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("La tabella dei movimenti è vuota");
    }

    /**
     * Chi sbaglia file — un .csv, un .xls vecchio, un PDF rinominato — deve leggere cosa fare,
     * non un errore del server. POI segnala questi casi con eccezioni non controllate, che
     * senza traduzione diventerebbero un 500.
     */
    @Test
    void unFileCheNonEUnXlsxSpiegaCosaFare() {
        byte[] nonUnXlsx = "Data;Operazione;Importo\n2026-03-02;POS;-42,50\n".getBytes();

        assertThatThrownBy(() -> parser.parse(new ByteArrayInputStream(nonUnXlsx)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("non sembra un .xlsx valido");
    }

    @Test
    void unFileSenzaFogliLoDice() throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook();

        assertThatThrownBy(() -> parse(wb))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("non contiene fogli di lavoro");
    }
}
