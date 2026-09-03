package com.spesetracker;

import com.spesetracker.service.excelimport.ExcelSheetParser;
import com.spesetracker.service.excelimport.ParsedWorkbook;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDate;

import static com.spesetracker.support.XlsxFixtures.setColoredBlank;
import static com.spesetracker.support.XlsxFixtures.setColoredText;
import static com.spesetracker.support.XlsxFixtures.setDate;
import static com.spesetracker.support.XlsxFixtures.setNumeric;
import static com.spesetracker.support.XlsxFixtures.setText;
import static com.spesetracker.support.XlsxFixtures.toBytes;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Il parser del diario spese in Excel dell'utente. La struttura del file non è documentata da
 * nessuna parte — è stata ricostruita guardandolo — quindi ogni regola qui è una convenzione
 * che vale finché qualcuno non tocca il foglio: un'intestazione spostata di una riga, uno
 * swatch colorato senza etichetta accanto, e il dato sparisce senza che nulla lo dica.
 *
 * <p>Il parser è puro: nessun repository, nessuna interpretazione. Si costruisce con
 * {@code new} e gira in millisecondi.
 */
class ExcelSheetParserTest {

    private final ExcelSheetParser parser = new ExcelSheetParser();

    private static final String ROSSO = "FFFF7575";
    private static final String VERDE = "FF8BF1BC";

    private XSSFWorkbook cartella(String... nomiFogli) {
        XSSFWorkbook wb = new XSSFWorkbook();
        for (String nome : nomiFogli) {
            wb.createSheet(nome);
        }
        return wb;
    }

    /** Le intestazioni delle due tabelle, "Fisse" a sinistra e "Non Fisse" a destra. */
    private void intestazioni(Sheet sheet, int riga) {
        setText(sheet, riga, 0, "Data");
        setText(sheet, riga, 1, "Nome");
        setText(sheet, riga, 2, "Costo");
        setText(sheet, riga, 4, "Data");
        setText(sheet, riga, 5, "Nome");
        setText(sheet, riga, 6, "Costo");
    }

    private ParsedWorkbook parse(XSSFWorkbook wb) throws IOException {
        return parser.parse(new ByteArrayInputStream(toBytes(wb)));
    }

    @Test
    void leggeLeDueTabelleDiUnFoglioMensile() throws Exception {
        XSSFWorkbook wb = cartella("Marzo");
        Sheet sheet = wb.getSheetAt(0);
        intestazioni(sheet, 1);
        setDate(sheet, 2, 0, LocalDate.of(2026, 3, 5));
        setText(sheet, 2, 1, "Affitto");
        setNumeric(sheet, 2, 2, 500);
        setDate(sheet, 2, 4, LocalDate.of(2026, 3, 7));
        setText(sheet, 2, 5, "Ekom");
        setNumeric(sheet, 2, 6, 42.50);

        ParsedWorkbook parsed = parse(wb);

        assertThat(parsed.fisseRows()).singleElement().satisfies(r -> {
            assertThat(r.name()).isEqualTo("Affitto");
            assertThat(r.amount()).isEqualByComparingTo("500.00");
            assertThat(r.sheetName()).isEqualTo("Marzo");
        });
        assertThat(parsed.nonFisseRows()).singleElement().satisfies(r -> {
            assertThat(r.name()).isEqualTo("Ekom");
            assertThat(r.date()).isEqualTo(LocalDate.of(2026, 3, 7));
        });
        assertThat(parsed.sheetsProcessed()).isEqualTo(1);
    }

    /**
     * La differenza fra le due tabelle, ed è voluta: una voce "Fissa" può non avere data —
     * sono gli abbonamenti ripetuti identici ogni mese — mentre una "Non Fissa" senza data
     * non è una spesa databile e resta fuori.
     */
    @Test
    void unaVoceFissaPuoNonAvereData() throws Exception {
        XSSFWorkbook wb = cartella("Marzo");
        Sheet sheet = wb.getSheetAt(0);
        intestazioni(sheet, 1);
        setText(sheet, 2, 1, "Netflix");
        setNumeric(sheet, 2, 2, 12.99);
        setText(sheet, 2, 5, "Spesa senza data");
        setNumeric(sheet, 2, 6, 30);

        ParsedWorkbook parsed = parse(wb);

        assertThat(parsed.fisseRows()).singleElement()
                .satisfies(r -> assertThat(r.date()).isNull());
        assertThat(parsed.nonFisseRows()).isEmpty();
    }

    /**
     * Il caso che perde dati senza dirlo, e che vale la pena avere scritto qui: l'intestazione
     * si cerca solo nelle prime cinque righe. Un foglio in cui la tabella comincia più in
     * basso — una riga di titolo aggiunta a mano basta — viene saltato per intero, eppure
     * viene <em>contato</em> fra quelli elaborati. Chi importa legge "5 fogli elaborati" e
     * conclude che sia andato tutto bene.
     */
    @Test
    void unFoglioConLIntestazioneTroppoInBassoVieneSaltatoMaContato() throws Exception {
        XSSFWorkbook wb = cartella("Marzo");
        Sheet sheet = wb.getSheetAt(0);
        intestazioni(sheet, 5);
        setDate(sheet, 6, 0, LocalDate.of(2026, 3, 5));
        setText(sheet, 6, 1, "Affitto");
        setNumeric(sheet, 6, 2, 500);

        ParsedWorkbook parsed = parse(wb);

        assertThat(parsed.fisseRows()).isEmpty();
        assertThat(parsed.sheetsProcessed()).isEqualTo(1);
    }

    // Il colore della cella del nome è la categoria: la legenda accosta lo swatch colorato
    // all'etichetta, in un punto qualunque del foglio.
    @Test
    void laLegendaDeiColoriAssegnaLaCategoria() throws Exception {
        XSSFWorkbook wb = cartella("Marzo");
        Sheet sheet = wb.getSheetAt(0);
        intestazioni(sheet, 1);
        setDate(sheet, 2, 4, LocalDate.of(2026, 3, 7));
        setColoredText(sheet, 2, 5, "Ekom", ROSSO);
        setNumeric(sheet, 2, 6, 42.50);
        setDate(sheet, 3, 4, LocalDate.of(2026, 3, 8));
        setColoredText(sheet, 3, 5, "Farmacia", VERDE);
        setNumeric(sheet, 3, 6, 12);

        setColoredBlank(sheet, 2, 15, ROSSO);
        setText(sheet, 2, 16, "Spese cibo");
        setColoredBlank(sheet, 3, 15, VERDE);
        setText(sheet, 3, 16, "Salute");

        assertThat(parse(wb).nonFisseRows())
                .extracting(ParsedWorkbook.NonFisseRow::matchedCategoryLabel)
                .containsExactly("Spese cibo", "Salute");
    }

    @Test
    void unColoreSenzaVoceInLegendaLasciaLaCategoriaVuota() throws Exception {
        XSSFWorkbook wb = cartella("Marzo");
        Sheet sheet = wb.getSheetAt(0);
        intestazioni(sheet, 1);
        setDate(sheet, 2, 4, LocalDate.of(2026, 3, 7));
        setColoredText(sheet, 2, 5, "Ekom", ROSSO);
        setNumeric(sheet, 2, 6, 42.50);

        assertThat(parse(wb).nonFisseRows()).singleElement()
                .satisfies(r -> assertThat(r.matchedCategoryLabel()).isNull());
    }

    @Test
    void leggeSaldoDiInizioMeseEStipendio() throws Exception {
        XSSFWorkbook wb = cartella("Marzo");
        Sheet sheet = wb.getSheetAt(0);
        intestazioni(sheet, 1);
        setText(sheet, 8, 0, "SALDO INIZIO MESE");
        setNumeric(sheet, 9, 0, 1200.50);
        setText(sheet, 10, 0, "Stipendio");
        setDate(sheet, 11, 0, LocalDate.of(2026, 2, 27));
        setNumeric(sheet, 11, 1, 1885.14);

        assertThat(parse(wb).periodStarts()).singleElement().satisfies(p -> {
            // Le due voci condividono la data dello stipendio: per l'utente il mese parte
            // il giorno in cui lo stipendio arriva, non il primo del mese.
            assertThat(p.date()).isEqualTo(LocalDate.of(2026, 2, 27));
            assertThat(p.startBalance()).isEqualByComparingTo("1200.50");
            assertThat(p.salaryAmount()).isEqualByComparingTo("1885.14");
        });
    }

    /**
     * L'altro punto in cui un dato sparisce in silenzio: è la riga dello stipendio a portare
     * l'unica data, quindi senza di essa anche il saldo di inizio mese viene scartato — pur
     * essendo lì, leggibile, nel foglio. Un mese in cui lo stipendio non è stato scritto perde
     * il proprio saldo di partenza.
     */
    @Test
    void unSaldoSenzaLaRigaDelloStipendioVieneScartato() throws Exception {
        XSSFWorkbook wb = cartella("Marzo");
        Sheet sheet = wb.getSheetAt(0);
        intestazioni(sheet, 1);
        setText(sheet, 8, 0, "SALDO INIZIO MESE");
        setNumeric(sheet, 9, 0, 1200.50);

        assertThat(parse(wb).periodStarts()).isEmpty();
    }

    // Il foglio di stima porta il saldo di riferimento e non è un foglio mensile: non va
    // contato né letto come tabella di spese.
    @Test
    void ilFoglioDiStimaDaIlSaldoERestaFuoriDalConteggio() throws Exception {
        XSSFWorkbook wb = cartella("Marzo", "Stima 2025");
        intestazioni(wb.getSheetAt(0), 1);
        Sheet stima = wb.getSheetAt(1);
        setText(stima, 0, 0, "Mese");
        setText(stima, 1, 0, "gennaio");
        setNumeric(stima, 1, 1, 1000);
        setText(stima, 2, 0, "febbraio");
        setNumeric(stima, 2, 1, 1450.75);

        ParsedWorkbook parsed = parse(wb);

        // "L'ultimo saldo disponibile" è quello più in basso, non il più alto né il primo.
        assertThat(parsed.checkpointDate()).isEqualTo(LocalDate.of(2025, 2, 1));
        assertThat(parsed.checkpointBalance()).isEqualByComparingTo("1450.75");
        assertThat(parsed.sheetsProcessed()).isEqualTo(1);
    }

    // Il foglio "Spese ricorrenti" ha solo date e nessun importo: leggerlo produrrebbe righe
    // senza costo, quindi è escluso per nome.
    @Test
    void ilFoglioDelleSpeseRicorrentiEEscluso() throws Exception {
        XSSFWorkbook wb = cartella("Marzo", "Spese ricorrenti");
        intestazioni(wb.getSheetAt(0), 1);
        intestazioni(wb.getSheetAt(1), 1);
        setText(wb.getSheetAt(1), 2, 1, "Netflix");
        setNumeric(wb.getSheetAt(1), 2, 2, 12.99);

        ParsedWorkbook parsed = parse(wb);

        assertThat(parsed.fisseRows()).isEmpty();
        assertThat(parsed.sheetsProcessed()).isEqualTo(1);
    }

    // Un nome di mese che non esiste non produce un checkpoint sbagliato: viene ignorato.
    @Test
    void unaRigaDiStimaConUnMeseIrriconoscibileNonContaminaIlSaldo() throws Exception {
        XSSFWorkbook wb = cartella("Marzo", "Stima 2025");
        intestazioni(wb.getSheetAt(0), 1);
        Sheet stima = wb.getSheetAt(1);
        // La riga di intestazione c'e' sempre nel file vero, ed e' necessaria: il parser salta
        // la prima riga del foglio dando per scontato che sia quella.
        setText(stima, 0, 0, "Mese");
        setText(stima, 1, 0, "gennaio");
        setNumeric(stima, 1, 1, 1000);
        setText(stima, 2, 0, "Totale");
        setNumeric(stima, 2, 1, 99999);

        ParsedWorkbook parsed = parse(wb);

        assertThat(parsed.checkpointDate()).isEqualTo(LocalDate.of(2025, 1, 1));
        assertThat(parsed.checkpointBalance()).isEqualByComparingTo("1000.00");
    }

    @Test
    void unFoglioSenzaTabelleNonRompeNulla() throws Exception {
        XSSFWorkbook wb = cartella("Copertina");
        setText(wb.getSheetAt(0), 0, 0, "Diario spese 2026");

        ParsedWorkbook parsed = parse(wb);

        assertThat(parsed.fisseRows()).isEmpty();
        assertThat(parsed.nonFisseRows()).isEmpty();
        assertThat(parsed.checkpointDate()).isNull();
    }
}
