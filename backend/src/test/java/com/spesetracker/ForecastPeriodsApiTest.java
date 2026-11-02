package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * La previsione con un giorno di stipendio configurato.
 *
 * <p>Prima la previsione ragionava per mesi di calendario mentre budget,
 * risparmio e la card "Spese per categoria" contavano da un accredito al
 * successivo: con l'accredito il 15, la Dashboard rispondeva "saldo a fine mese"
 * sul 30 settembre mentre tutto il resto della pagina parlava del periodo che
 * finisce il 14 ottobre.
 *
 * <p>I test di {@link ForecastApiTest} girano tutti <em>senza</em> giorno di
 * stipendio, dove periodo e mese coincidono per definizione: sono la rete che
 * dimostra che per quella configurazione non è cambiato niente. Qui si prova
 * l'altra metà, quella che prima non esisteva.
 */
class ForecastPeriodsApiTest extends AbstractIntegrationTest {

    /**
     * Solo il giorno, senza importo: valorizzare anche defaultSalaryAmount
     * farebbe creare la regola ricorrente dello stipendio, e le sue entrate
     * entrerebbero nei numeri che questi test contano.
     */
    private void impostaGiornoStipendio(String token, int giorno) throws Exception {
        mockMvc.perform(put("/api/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"salaryDay\":%d}".formatted(giorno)))
                .andExpect(status().isOk());
    }

    @Test
    void iPeriodiVannoDaUnAccreditoAlGiornoPrimaDelSuccessivo() throws Exception {
        String token = api.registerAndLogin();
        impostaGiornoStipendio(token, 15);

        JsonNode periodi = api.forecast(token, 2).get("periods");

        LocalDate inizio = LocalDate.parse(periodi.get(0).get("periodStart").asText());
        LocalDate fine = LocalDate.parse(periodi.get(0).get("periodEnd").asText());
        assertThat(inizio.getDayOfMonth()).isEqualTo(15);
        assertThat(fine.getDayOfMonth()).isEqualTo(14);
        // Il primo periodo è quello in corso: contiene oggi.
        assertThat(LocalDate.now()).isBetween(inizio, fine);
        // E il successivo attacca il giorno dopo, senza buchi né sovrapposizioni.
        assertThat(LocalDate.parse(periodi.get(1).get("periodStart").asText())).isEqualTo(fine.plusDays(1));
    }

    /**
     * Il test che distingue davvero le due letture.
     *
     * <p>Con un accredito diverso dal primo del mese, il primo e l'ultimo giorno
     * di un periodo cadono sempre in due mesi di calendario diversi. Due spese
     * su quei due giorni devono finire <em>entrambe</em> nella previsione del
     * periodo corrente: ragionando per mesi, quella dell'ultimo giorno finirebbe
     * nel periodo dopo, e la card dell'utente mostrerebbe un saldo di fine
     * periodo a cui manca una spesa che invece cade dentro.
     */
    @Test
    void unaSpesaNelMeseSuccessivoMaDentroIlPeriodoContaNelPeriodoCorrente() throws Exception {
        String token = api.registerAndLogin();
        impostaGiornoStipendio(token, 15);
        String categoria = api.createExpenseCategory(token);

        JsonNode primoPeriodo = api.forecast(token, 2).get("periods").get(0);
        LocalDate inizio = LocalDate.parse(primoPeriodo.get("periodStart").asText());
        LocalDate fine = LocalDate.parse(primoPeriodo.get("periodEnd").asText());
        assertThat(inizio.getMonth()).isNotEqualTo(fine.getMonth());

        api.createCheckpoint(token, inizio.minusDays(1), "1000.00");
        api.createTransaction(token, categoria, inizio, "100.00", "EXPENSE");
        api.createTransaction(token, categoria, fine, "50.00", "EXPENSE");

        JsonNode periodi = api.forecast(token, 2).get("periods");
        assertThat(periodi.get(0).get("projectedExpense").decimalValue()).isEqualByComparingTo("150.00");
        assertThat(periodi.get(0).get("runningBalance").decimalValue()).isEqualByComparingTo("850.00");
        // E niente è finito nel periodo successivo.
        assertThat(periodi.get(1).get("projectedExpense").decimalValue()).isEqualByComparingTo("0");
    }

    /**
     * Il saldo di partenza è quello a inizio periodo, non a inizio mese: una
     * spesa registrata prima dell'accredito appartiene al periodo precedente e
     * deve essere già dentro il saldo da cui la previsione parte, non comparire
     * come spesa del periodo in corso.
     */
    @Test
    void cioCheStaPrimaDellAccreditoEGiaDentroIlSaldoDiPartenza() throws Exception {
        String token = api.registerAndLogin();
        impostaGiornoStipendio(token, 15);
        String categoria = api.createExpenseCategory(token);

        JsonNode primoPeriodo = api.forecast(token, 1).get("periods").get(0);
        LocalDate inizio = LocalDate.parse(primoPeriodo.get("periodStart").asText());

        api.createCheckpoint(token, inizio.minusDays(3), "1000.00");
        api.createTransaction(token, categoria, inizio.minusDays(1), "200.00", "EXPENSE");

        JsonNode periodo = api.forecast(token, 1).get("periods").get(0);
        assertThat(periodo.get("projectedExpense").decimalValue()).isEqualByComparingTo("0");
        assertThat(periodo.get("runningBalance").decimalValue()).isEqualByComparingTo("800.00");
    }
    // ------------------------------------------------------------------
    // La card "Saldo previsto a fine …"
    //
    // Conta per mese di CALENDARIO, non per periodo, e guarda alla fine del mese
    // in cui arriva il prossimo stipendio, così lo contiene sempre: chi la guarda
    // vuole sapere quanti soldi avrà a fine mese, stipendio in arrivo compreso.
    // Guardava sempre al mese in corso, e dal giorno dello stipendio a fine mese
    // mostrava lo stesso numero del saldo attuale.
    //
    // I due test che seguono scelgono il giorno di accredito rispetto a oggi, per
    // cadere sempre nel ramo che vogliono provare. Uno dei due rami non esiste in
    // certi giorni — il primo del mese non c'è un accredito già passato, l'ultimo
    // non ce n'è uno ancora da arrivare — e lì il test si salta invece di provare
    // la cosa sbagliata.
    // ------------------------------------------------------------------

    /**
     * Prima dello stipendio del mese la card guarda alla fine di questo mese, e
     * lo stipendio in arrivo c'è dentro.
     */
    @Test
    void primaDelloStipendioLaCardGuardaAFineDiQuestoMese() throws Exception {
        LocalDate oggi = LocalDate.now();
        assumeTrue(oggi.getDayOfMonth() < oggi.lengthOfMonth(), "l'ultimo giorno del mese non c'è un accredito ancora da arrivare");
        String token = api.registerAndLogin();
        impostaGiornoStipendio(token, oggi.getDayOfMonth() + 1);
        String stipendio = api.createIncomeCategory(token);
        api.createCheckpoint(token, oggi, "1000.00");
        api.createRecurring(token, stipendio, "Stipendio", "2000.00", oggi.plusDays(1));

        JsonNode mese = api.forecast(token, 2).get("monthEndForecast");

        assertThat(mese.get("period").asText()).isEqualTo(YearMonth.from(oggi).toString());
        assertThat(LocalDate.parse(mese.get("periodStart").asText())).isEqualTo(oggi.withDayOfMonth(1));
        assertThat(LocalDate.parse(mese.get("periodEnd").asText())).isEqualTo(YearMonth.from(oggi).atEndOfMonth());
        assertThat(mese.get("projectedIncome").decimalValue()).isEqualByComparingTo("2000.00");
        assertThat(mese.get("runningBalance").decimalValue()).isEqualByComparingTo("3000.00");
    }

    /**
     * Passato lo stipendio del mese la card guarda alla fine del mese prossimo,
     * dove cade quello in arrivo. Il saldo passa anche per il resto di questo
     * mese: la spesa dell'ultimo giorno ci deve essere.
     *
     * <p>Guardando al mese in corso — com'era — il periodo sarebbe questo, e lo
     * stipendio in arrivo non ci sarebbe: è il caso segnalato, una card uguale al
     * saldo attuale negli ultimi giorni del mese.
     */
    @Test
    void passatoLoStipendioLaCardGuardaAFineDelMeseProssimo() throws Exception {
        LocalDate oggi = LocalDate.now();
        assumeTrue(oggi.getDayOfMonth() >= 2, "nessun accredito già passato il primo del mese");
        String token = api.registerAndLogin();
        impostaGiornoStipendio(token, 2);
        String stipendio = api.createIncomeCategory(token);
        String spesa = api.createExpenseCategory(token);
        YearMonth prossimo = YearMonth.from(oggi).plusMonths(1);
        api.createCheckpoint(token, oggi.withDayOfMonth(1).minusDays(1), "1000.00");
        api.createTransaction(token, spesa, YearMonth.from(oggi).atEndOfMonth(), "100.00", "EXPENSE");
        api.createRecurring(token, stipendio, "Stipendio", "2000.00", prossimo.atDay(2));

        JsonNode mese = api.forecast(token, 2).get("monthEndForecast");

        assertThat(mese.get("period").asText()).isEqualTo(prossimo.toString());
        assertThat(LocalDate.parse(mese.get("periodStart").asText())).isEqualTo(prossimo.atDay(1));
        assertThat(LocalDate.parse(mese.get("periodEnd").asText())).isEqualTo(prossimo.atEndOfMonth());
        assertThat(mese.get("projectedIncome").decimalValue()).isEqualByComparingTo("2000.00");
        assertThat(mese.get("runningBalance").decimalValue()).isEqualByComparingTo("2900.00");
    }

    /** Senza giorno di accredito non c'è uno stipendio da inseguire: il mese è quello in corso. */
    @Test
    void senzaAccreditoLaCardGuardaAlMeseInCorso() throws Exception {
        String token = api.registerAndLogin();

        JsonNode mese = api.forecast(token, 2).get("monthEndForecast");

        assertThat(mese.get("period").asText()).isEqualTo(YearMonth.now().toString());
    }
}
