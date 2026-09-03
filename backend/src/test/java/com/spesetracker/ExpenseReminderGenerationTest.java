package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.job.ExpenseReminderGenerationService;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La transazione riepilogativa generata a inizio mese da un promemoria di spesa fissa.
 * Due comportamenti che si notano solo contando: che non ne generi due per lo stesso mese,
 * e da dove prenda l'importo quando il promemoria non ne ha uno.
 */
class ExpenseReminderGenerationTest extends AbstractIntegrationTest {

    private static final YearMonth MARZO = YearMonth.of(2026, 3);
    private static final LocalDate SCADENZA = LocalDate.of(2026, 3, 20);

    @Autowired
    private ExpenseReminderGenerationService generationService;

    // Senza importo e senza storico non c'è nulla da cui stimare: il job preferisce non
    // generare niente piuttosto che inventare una cifra.
    @Test
    void senzaImportoESenzaStoricoNonGeneraNulla() throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        UUID id = UUID.fromString(api.createReminder(token, categoryId, "Bollo auto", SCADENZA));

        generationService.generateForMonth(id, MARZO);

        assertThat(api.listTransactions(token)).isEmpty();
    }

    /**
     * Il ripiego che rende utili i promemoria senza prezzo: si stima sull'<em>ultima</em> spesa
     * registrata nella stessa categoria. Servono almeno due storici per provare che sia davvero
     * la più recente e non la prima trovata — con uno solo il test passerebbe anche con
     * l'ordinamento invertito.
     */
    @Test
    void senzaImportoStimaSullUltimaSpesaDellaCategoria() throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        api.createTransaction(token, categoryId, LocalDate.of(2025, 3, 20), "310.00", "EXPENSE");
        api.createTransaction(token, categoryId, LocalDate.of(2026, 1, 20), "480.00", "EXPENSE");
        UUID id = UUID.fromString(api.createReminder(token, categoryId, "Assicurazione", SCADENZA));

        generationService.generateForMonth(id, MARZO);

        JsonNode transazioni = api.listTransactions(token);
        assertThat(transazioni).hasSize(3);
        assertThat(transazioni).anySatisfy(t -> {
            assertThat(t.get("occurredOn").asText()).isEqualTo("2026-03-01");
            assertThat(t.get("amount").decimalValue()).isEqualByComparingTo("480.00");
            assertThat(t.get("description").asText()).isEqualTo("Assicurazione");
        });
    }

    @Test
    void unImportoEsplicitoBattoLoStorico() throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        api.createTransaction(token, categoryId, LocalDate.of(2026, 1, 20), "480.00", "EXPENSE");
        UUID id = UUID.fromString(api.createReminder(
                token, categoryId, "Assicurazione", SCADENZA, "MONTH", 1, null, null, "99.00"));

        generationService.generateForMonth(id, MARZO);

        JsonNode transazioni = api.listTransactions(token);
        assertThat(transazioni).anySatisfy(t -> {
            assertThat(t.get("occurredOn").asText()).isEqualTo("2026-03-01");
            assertThat(t.get("amount").decimalValue()).isEqualByComparingTo("99.00");
        });
    }

    /**
     * La guardia contro i doppioni: il job gira una volta al mese, ma un riavvio o una
     * riesecuzione manuale non devono raddoppiare la spesa. Il controllo è sul mese intero,
     * non sulla data esatta, così vale anche se la transazione è stata spostata a mano.
     */
    @Test
    void unaSecondaEsecuzioneNelloStessoMeseNonDuplica() throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        UUID id = UUID.fromString(api.createReminder(
                token, categoryId, "Assicurazione", SCADENZA, "MONTH", 1, null, null, "99.00"));

        generationService.generateForMonth(id, MARZO);
        generationService.generateForMonth(id, MARZO);

        assertThat(api.listTransactions(token)).hasSize(1);
    }

    @Test
    void meseSuccessivoGeneraDiNuovo() throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        UUID id = UUID.fromString(api.createReminder(
                token, categoryId, "Assicurazione", SCADENZA, "MONTH", 1, null, null, "99.00"));

        generationService.generateForMonth(id, MARZO);
        generationService.generateForMonth(id, MARZO.plusMonths(1));

        assertThat(api.listTransactions(token).findValuesAsText("occurredOn").stream().sorted().toList())
                .containsExactly("2026-03-01", "2026-04-01");
    }

    @Test
    void unPromemoriaInesistenteNonFaEsplodereIlJob() {
        generationService.generateForMonth(UUID.randomUUID(), MARZO);
    }
}
