package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
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
    /**
     * La card "Saldo previsto a fine mese" conta il mese di CALENDARIO, non il
     * periodo: chi la guarda vuole sapere quanti soldi avrà il 30, non il giorno
     * prima del prossimo stipendio. Il resto della Dashboard resta a periodi.
     *
     * <p>Due asserzioni con due scopi. I confini sono la prova strutturale, vera
     * qualunque sia il giorno di oggi: se currentMonth venisse calcolato col
     * giorno di accredito, comincerebbe il 15 e non il primo. Le cifre sono la
     * prova nel merito: una spesa del primo del mese prossimo non entra nel mese
     * in corso nemmeno quando il periodo in corso la contiene.
     */
    @Test
    void laCardDelMeseContaIlMeseDiCalendarioNonIlPeriodo() throws Exception {
        String token = api.registerAndLogin();
        impostaGiornoStipendio(token, 15);
        String categoria = api.createExpenseCategory(token);

        LocalDate oggi = LocalDate.now();
        LocalDate primoDelMese = oggi.withDayOfMonth(1);
        LocalDate primoDelMeseProssimo = primoDelMese.plusMonths(1);

        api.createCheckpoint(token, primoDelMese.minusDays(1), "1000.00");
        api.createTransaction(token, categoria, primoDelMese, "100.00", "EXPENSE");
        api.createTransaction(token, categoria, primoDelMeseProssimo, "50.00", "EXPENSE");

        JsonNode previsione = api.forecast(token, 2);
        JsonNode mese = previsione.get("currentMonth");

        assertThat(LocalDate.parse(mese.get("periodStart").asText())).isEqualTo(primoDelMese);
        assertThat(LocalDate.parse(mese.get("periodEnd").asText()))
                .isEqualTo(primoDelMeseProssimo.minusDays(1));
        assertThat(mese.get("projectedExpense").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(mese.get("runningBalance").decimalValue()).isEqualByComparingTo("900.00");
        // E il primo periodo resta un periodo, che comincia il 15.
        assertThat(LocalDate.parse(previsione.get("periods").get(0).get("periodStart").asText())
                .getDayOfMonth()).isEqualTo(15);
    }
}
