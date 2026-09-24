package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Le due stime della previsione: la media delle spese variabili e le rate dei debiti.
 *
 * <p>Nata da una segnalazione: il grafico "Andamento saldo" saliva senza fine. La
 * media c'era, ma divideva sempre per sei periodi anche con due mesi di storico,
 * quindi le spese future valevano una frazione del reale mentre lo stipendio — una
 * regola ricorrente — contava per intero. E le rate dei debiti non entravano
 * affatto finché non venivano registrate.
 *
 * <p>Tutti i test girano senza giorno di stipendio: periodo e mese di calendario
 * coincidono, e le date restano leggibili ("il mese scorso", "fra due mesi").
 */
class ForecastEstimatesApiTest extends AbstractIntegrationTest {

    private static LocalDate meseFa(int mesi) {
        return LocalDate.now().minusMonths(mesi).withDayOfMonth(15);
    }

    private static LocalDate fraMesi(int mesi) {
        return LocalDate.now().plusMonths(mesi).withDayOfMonth(15);
    }

    /**
     * Il divisore è l'arco di storico, non il numero di mesi con spese: dal mese
     * della transazione più vecchia a quello scorso. 300 € tre mesi fa e 300 € il
     * mese scorso sono tre mesi di storico, con uno in mezzo a zero: 600 / 3 = 200.
     *
     * <p>Le tre letture sbagliate danno tre numeri diversi, e questo test le
     * distingue tutte: divisore fisso a sei → 100; mesi con spese (due) → 300.
     */
    @Test
    void laMediaDividePerIPeriodiDiStoricoCheEsistono() throws Exception {
        String token = api.registerAndLogin();
        String spesa = api.createExpenseCategory(token);
        api.createTransaction(token, spesa, meseFa(3), "300.00", "EXPENSE");
        api.createTransaction(token, spesa, meseFa(1), "300.00", "EXPENSE");

        JsonNode previsione = api.forecast(token, 2);

        assertThat(previsione.get("historyPeriods").asInt()).isEqualTo(3);
        assertThat(previsione.get("variableExpenseAverage").decimalValue()).isEqualByComparingTo("200.00");
        assertThat(previsione.get("periods").get(1).get("projectedExpense").decimalValue())
                .isEqualByComparingTo("200.00");
    }

    /**
     * Sei è il tetto: con otto mesi di spese la finestra ne guarda sei, e divide
     * per sei. I due mesi più vecchi restano fuori sia dalla somma sia dal divisore.
     */
    @Test
    void conPiuDiSeiPeriodiDiStoricoIlDivisoreResta6() throws Exception {
        String token = api.registerAndLogin();
        String spesa = api.createExpenseCategory(token);
        for (int mesi = 1; mesi <= 8; mesi++) {
            api.createTransaction(token, spesa, meseFa(mesi), "70.00", "EXPENSE");
        }

        JsonNode previsione = api.forecast(token, 2);

        assertThat(previsione.get("historyPeriods").asInt()).isEqualTo(6);
        assertThat(previsione.get("variableExpenseAverage").decimalValue()).isEqualByComparingTo("70.00");
    }

    /**
     * Senza periodi conclusi non c'è niente da cui stimare: la media vale zero e
     * lo storico dice zero. È il caso che il frontend scrive come "storico
     * insufficiente" invece di disegnare una previsione che finge di sapere. Le
     * spese del mese in corso non contano: il mese non è finito.
     */
    @Test
    void senzaPeriodiConclusiLoStoricoEZero() throws Exception {
        String token = api.registerAndLogin();
        String spesa = api.createExpenseCategory(token);
        api.createTransaction(token, spesa, LocalDate.now(), "80.00", "EXPENSE");

        JsonNode previsione = api.forecast(token, 2);

        assertThat(previsione.get("historyPeriods").asInt()).isZero();
        assertThat(previsione.get("variableExpenseAverage").decimalValue()).isEqualByComparingTo("0");
        assertThat(previsione.get("periods").get(1).get("projectedExpense").decimalValue())
                .isEqualByComparingTo("0");
    }

    /**
     * Una rata per periodo futuro finché il residuo non finisce, e l'ultima è
     * parziale: 250 € con rata 100 → 100, 100, 50, poi niente. Nel periodo in corso
     * nessuna rata prevista: lì contano le spese reali, come per la media.
     */
    @Test
    void leRateDiUnDebitoEntranoFinoAEsaurireIlResiduo() throws Exception {
        String token = api.registerAndLogin();
        String prestito = api.createExpenseCategory(token);
        api.createDebt(token, prestito, "250.00", "100.00");

        JsonNode periodi = api.forecast(token, 5).get("periods");

        assertThat(periodi.get(0).get("projectedExpense").decimalValue()).isEqualByComparingTo("0");
        assertThat(periodi.get(1).get("projectedExpense").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(periodi.get(2).get("projectedExpense").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(periodi.get(3).get("projectedExpense").decimalValue()).isEqualByComparingTo("50.00");
        assertThat(periodi.get(4).get("projectedExpense").decimalValue()).isEqualByComparingTo("0");
    }

    /**
     * Una rata già registrata con data futura è già una spesa reale di quel periodo
     * ed è già fuori dal residuo: la previsione non ci aggiunge un'altra rata. Totale
     * 300, rata 100, 100 registrati il mese prossimo → il mese prossimo 100 (quella
     * vera), poi 100 e 100, poi niente. Contandola due volte, il mese prossimo
     * varrebbe 200.
     */
    @Test
    void unaRataGiaRegistrataConDataFuturaNonContaDueVolte() throws Exception {
        String token = api.registerAndLogin();
        String prestito = api.createExpenseCategory(token);
        api.createDebt(token, prestito, "300.00", "100.00");
        api.createTransaction(token, prestito, fraMesi(1), "100.00", "EXPENSE");

        JsonNode periodi = api.forecast(token, 5).get("periods");

        assertThat(periodi.get(1).get("projectedExpense").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(periodi.get(2).get("projectedExpense").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(periodi.get(3).get("projectedExpense").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(periodi.get(4).get("projectedExpense").decimalValue()).isEqualByComparingTo("0");
    }

    /**
     * I pagamenti passati di un debito non sono spese variabili: la previsione ne
     * prevede già le rate. Lasciarli nella media li conterebbe due volte — una come
     * media, una come rata. Qui il mese scorso ci sono 50 € di spesa normale e 100 di
     * rata: la media è 50, e il mese prossimo vale 50 + 100 di rata = 150, non 250.
     */
    @Test
    void iPagamentiPassatiDiUnDebitoNonEntranoNellaMedia() throws Exception {
        String token = api.registerAndLogin();
        String prestito = api.createExpenseCategory(token);
        String spesa = api.createExpenseCategory(token);
        api.createDebt(token, prestito, "1000.00", "100.00");
        api.createTransaction(token, prestito, meseFa(1), "100.00", "EXPENSE");
        api.createTransaction(token, spesa, meseFa(1), "50.00", "EXPENSE");

        JsonNode previsione = api.forecast(token, 2);

        assertThat(previsione.get("variableExpenseAverage").decimalValue()).isEqualByComparingTo("50.00");
        assertThat(previsione.get("periods").get(1).get("projectedExpense").decimalValue())
                .isEqualByComparingTo("150.00");
    }
}
