package com.spesetracker;

import com.spesetracker.service.excelimport.PoiCells;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static com.spesetracker.support.XlsxFixtures.row;
import static com.spesetracker.support.XlsxFixtures.setBoolean;
import static com.spesetracker.support.XlsxFixtures.setDate;
import static com.spesetracker.support.XlsxFixtures.setFormula;
import static com.spesetracker.support.XlsxFixtures.setNumeric;
import static com.spesetracker.support.XlsxFixtures.setText;
import static com.spesetracker.support.XlsxFixtures.setUnformattedDate;
import static com.spesetracker.support.XlsxFixtures.workbook;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Le letture di cella condivise dai due import. Sono quattro metodi statici, ma decidono
 * quali righe di un file entrano e quali spariscono: una cella letta null non produce un
 * errore da nessuna parte, produce un dato mancante.
 */
class PoiCellsTest {

    private final XSSFWorkbook wb = workbook("Foglio");
    private final Sheet sheet = wb.getSheetAt(0);

    @AfterEach
    void chiudi() throws Exception {
        wb.close();
    }

    @Test
    void readStringLeggeSoloLeCelleDiTesto() {
        setText(sheet, 0, 0, "Farmacia");
        setNumeric(sheet, 0, 1, 42);
        setText(sheet, 0, 2, "   ");

        assertThat(PoiCells.readString(row(sheet, 0).getCell(0))).isEqualTo("Farmacia");
        // Un numero non è una stringa, anche quando su schermo sembra tale.
        assertThat(PoiCells.readString(row(sheet, 0).getCell(1))).isNull();
        // Una cella di soli spazi è vuota, non una stringa vuota: chi chiama fa `!= null`.
        assertThat(PoiCells.readString(row(sheet, 0).getCell(2))).isNull();
        assertThat(PoiCells.readString(null)).isNull();
    }

    /**
     * La distinzione che regge l'intero import: in un .xlsx una data <em>è</em> un numero, e
     * l'unico modo per riconoscerla è il formato applicato alla cella. Un export che scrive le
     * date senza formato produce righe che il parser scarta — ed è anche il motivo per cui le
     * fixture della suite devono applicarlo davvero, altrimenti proverebbero il contrario.
     */
    @Test
    void readDateRiconosceUnaDataDalFormatoDellaCella() {
        setDate(sheet, 0, 0, LocalDate.of(2026, 3, 2));
        setUnformattedDate(sheet, 0, 1, LocalDate.of(2026, 3, 2));
        setText(sheet, 0, 2, "2026-03-02");

        assertThat(PoiCells.readDate(row(sheet, 0).getCell(0))).isEqualTo(LocalDate.of(2026, 3, 2));
        assertThat(PoiCells.readDate(row(sheet, 0).getCell(1))).isNull();
        // Una data scritta a mano come testo resta testo.
        assertThat(PoiCells.readDate(row(sheet, 0).getCell(2))).isNull();
        assertThat(PoiCells.readDate(null)).isNull();
    }

    @Test
    void readNumericArrotondaADueDecimali() {
        setNumeric(sheet, 0, 0, 42.456);
        setNumeric(sheet, 0, 1, 42.454);

        assertThat(PoiCells.readNumeric(row(sheet, 0).getCell(0), null)).isEqualByComparingTo("42.46");
        assertThat(PoiCells.readNumeric(row(sheet, 0).getCell(1), null)).isEqualByComparingTo("42.45");
    }

    // Una data non è un importo, anche se sotto è un numero: senza questo controllo un
    // 2 marzo 2026 diventerebbe una spesa da 46 083 euro.
    @Test
    void readNumericNonScambiaUnaDataPerUnImporto() {
        setDate(sheet, 0, 0, LocalDate.of(2026, 3, 2));

        assertThat(PoiCells.readNumeric(row(sheet, 0).getCell(0), null)).isNull();
    }

    /**
     * Il comportamento che rende fragile l'import dell'estratto conto: una formula senza
     * valutatore si legge null. Il parser della banca chiama {@code readNumeric} passando
     * {@code null}, quindi in quel file ogni importo calcolato è un importo assente — e nel
     * suo ciclo un importo assente termina la tabella.
     */
    @Test
    void unaFormulaSenzaValutatoreSiLeggeNulla() {
        setFormula(sheet, 0, 0, "35*2");

        assertThat(PoiCells.readNumeric(row(sheet, 0).getCell(0), null)).isNull();
    }

    @Test
    void conIlValutatoreLaFormulaSiRisolve() {
        setFormula(sheet, 0, 0, "35*2");
        FormulaEvaluator evaluator = wb.getCreationHelper().createFormulaEvaluator();

        assertThat(PoiCells.readNumeric(row(sheet, 0).getCell(0), evaluator)).isEqualByComparingTo("70.00");
    }

    @Test
    void unaFormulaCheProduceTestoNonEUnImporto() {
        setFormula(sheet, 0, 0, "\"totale\"");
        FormulaEvaluator evaluator = wb.getCreationHelper().createFormulaEvaluator();

        assertThat(PoiCells.readNumeric(row(sheet, 0).getCell(0), evaluator)).isNull();
    }

    /**
     * L'estratto conto ha colonne che la banca scrive a volte come testo e a volte come
     * numero, quindi qui non si può pretendere un tipo. La conversione dei numeri toglie gli
     * zeri in coda: senza, il numero del conto "1234" diventerebbe "1234.0".
     */
    @Test
    void readAnyAsStringLeggeQualunqueTipo() {
        setText(sheet, 0, 0, "  Bonifico  ");
        setNumeric(sheet, 0, 1, 1234);
        setBoolean(sheet, 0, 2, true);
        setDate(sheet, 0, 3, LocalDate.of(2026, 3, 2));

        assertThat(PoiCells.readAnyAsString(row(sheet, 0).getCell(0))).isEqualTo("Bonifico");
        assertThat(PoiCells.readAnyAsString(row(sheet, 0).getCell(1))).isEqualTo("1234");
        assertThat(PoiCells.readAnyAsString(row(sheet, 0).getCell(2))).isEqualTo("true");
        assertThat(PoiCells.readAnyAsString(row(sheet, 0).getCell(3))).isEqualTo("2026-03-02");
        assertThat(PoiCells.readAnyAsString(null)).isNull();
    }
}
