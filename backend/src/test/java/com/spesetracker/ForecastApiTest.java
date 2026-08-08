package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.job.ExpenseReminderGenerationService;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Confini di data del calcolo del saldo: è la parte più delicata del backend e ha già
// prodotto un bug in produzione (un saldo registrato "oggi" congelava il saldo attuale
// per tutto il giorno, perché la finestra partiva da checkpointDate + 1).
class ForecastApiTest extends AbstractIntegrationTest {

    // Usato per simulare il job di inizio mese senza aspettare lo scheduler.
    @Autowired
    private ExpenseReminderGenerationService reminderGenerationService;

    @Test
    void newUserWithoutCheckpointStartsFromZero() throws Exception {
        String token = api.registerAndLogin();

        JsonNode forecast = api.forecast(token, 3);

        assertThat(forecast.get("startingBalance").decimalValue()).isEqualByComparingTo("0");
        assertThat(forecast.get("currentBalance").decimalValue()).isEqualByComparingTo("0");
        assertThat(forecast.get("months")).hasSize(3);
    }

    @Test
    void withoutCheckpointAllTransactionsCountTowardsCurrentBalance() throws Exception {
        String token = api.registerAndLogin();
        String expense = api.createExpenseCategory(token);
        String income = api.createIncomeCategory(token);

        api.createTransaction(token, income, LocalDate.now().minusDays(10), "500.00", "INCOME");
        api.createTransaction(token, expense, LocalDate.now().minusDays(2), "120.00", "EXPENSE");

        assertThat(api.currentBalance(token)).isEqualByComparingTo("380.00");
    }

    // Regressione del bug segnalato: saldo di partenza registrato oggi (il default del
    // form in Profilo) e spesa datata oggi. Il checkpoint è il saldo a INIZIO giornata,
    // quindi la spesa deve comunque essere sottratta.
    @Test
    void transactionOnTheSameDayAsTheCheckpointIsCounted() throws Exception {
        String token = api.registerAndLogin();
        String expense = api.createExpenseCategory(token);

        api.createCheckpoint(token, LocalDate.now(), "2700.00");
        api.createTransaction(token, expense, LocalDate.now(), "100.00", "EXPENSE");

        assertThat(api.currentBalance(token)).isEqualByComparingTo("2600.00");
    }

    @Test
    void transactionsBeforeTheCheckpointAreIgnored() throws Exception {
        String token = api.registerAndLogin();
        String expense = api.createExpenseCategory(token);
        LocalDate checkpointDate = LocalDate.now().minusDays(10);

        // Già "dentro" il saldo dichiarato: non deve essere ricontata.
        api.createTransaction(token, expense, checkpointDate.minusDays(1), "999.00", "EXPENSE");
        api.createCheckpoint(token, checkpointDate, "1000.00");
        api.createTransaction(token, expense, checkpointDate.plusDays(3), "50.00", "EXPENSE");

        assertThat(api.currentBalance(token)).isEqualByComparingTo("950.00");
    }

    @Test
    void onlyTheLatestCheckpointNotAfterTodayIsUsed() throws Exception {
        String token = api.registerAndLogin();
        String expense = api.createExpenseCategory(token);

        api.createCheckpoint(token, LocalDate.now().minusMonths(2), "5000.00");
        api.createCheckpoint(token, LocalDate.now().minusDays(5), "800.00");
        // Un checkpoint futuro non deve essere scelto come punto di partenza.
        api.createCheckpoint(token, LocalDate.now().plusMonths(1), "9999.00");
        api.createTransaction(token, expense, LocalDate.now().minusDays(1), "30.00", "EXPENSE");

        assertThat(api.currentBalance(token)).isEqualByComparingTo("770.00");
    }

    // "Saldo attuale" è il saldo di oggi: una spesa con data futura non lo tocca ancora,
    // ma essendo un movimento certo deve entrare nella previsione di fine mese.
    @Test
    void futureDatedTransactionDoesNotAffectCurrentBalance() throws Exception {
        String token = api.registerAndLogin();
        String expense = api.createExpenseCategory(token);

        api.createCheckpoint(token, LocalDate.now().minusDays(1), "1000.00");
        api.createTransaction(token, expense, LocalDate.now().plusDays(3), "250.00", "EXPENSE");

        assertThat(api.currentBalance(token)).isEqualByComparingTo("1000.00");
    }

    @Test
    void futureDatedTransactionInThisMonthIsCountedInTheEndOfMonthForecast() throws Exception {
        String token = api.registerAndLogin();
        String expense = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        // Una data futura ancora dentro il mese corrente (il giorno 1 non è mai futuro,
        // quindi si usa la fine del mese quando oggi è già a fine mese).
        LocalDate futureThisMonth = LocalDate.now().withDayOfMonth(LocalDate.now().lengthOfMonth());
        api.createTransaction(token, expense, futureThisMonth, "250.00", "EXPENSE");

        JsonNode currentMonth = api.forecast(token, 1).get("months").get(0);
        assertThat(currentMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("250.00");
        assertThat(currentMonth.get("runningBalance").decimalValue()).isEqualByComparingTo("750.00");
    }

    @Test
    void anActiveReminderIsIncludedInTheMonthItFallsIn() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        // Promemoria con prezzo noto in scadenza entro il mese corrente.
        LocalDate due = LocalDate.now().withDayOfMonth(LocalDate.now().lengthOfMonth());
        mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Affitto","amount":400.00,"intervalUnit":"MONTH",\
                                "intervalValue":1,"startDate":"%s","nextDueDate":"%s"}
                                """.formatted(category, due, due)))
                .andExpect(status().isCreated());

        JsonNode currentMonth = api.forecast(token, 1).get("months").get(0);
        assertThat(currentMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("400.00");
        assertThat(currentMonth.get("runningBalance").decimalValue()).isEqualByComparingTo("600.00");
    }

    // Il job di inizio mese trasforma il promemoria in una transazione reale: da quel
    // momento l'importo deve essere contato una volta sola.
    @Test
    void aReminderAlreadyMaterialisedAsATransactionIsNotCountedTwice() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        LocalDate due = LocalDate.now().withDayOfMonth(LocalDate.now().lengthOfMonth());
        String reminderId = api.json(mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Affitto","amount":400.00,"intervalUnit":"MONTH",\
                                "intervalValue":1,"startDate":"%s","nextDueDate":"%s"}
                                """.formatted(category, due, due)))
                .andExpect(status().isCreated())
                .andReturn())
                .get("id").asText();

        reminderGenerationService.generateForMonth(
                java.util.UUID.fromString(reminderId), java.time.YearMonth.now());

        JsonNode currentMonth = api.forecast(token, 1).get("months").get(0);
        assertThat(currentMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("400.00");
        assertThat(currentMonth.get("runningBalance").decimalValue()).isEqualByComparingTo("600.00");
    }

    @Test
    void aReminderWithoutAPriceOrHistoryIsNotGuessed() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        api.createReminder(token, category, "Importo ignoto",
                LocalDate.now().withDayOfMonth(LocalDate.now().lengthOfMonth()));

        JsonNode currentMonth = api.forecast(token, 1).get("months").get(0);
        assertThat(currentMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("0");
        assertThat(currentMonth.get("runningBalance").decimalValue()).isEqualByComparingTo("1000.00");
    }

    @Test
    void incomeAndExpenseMoveTheBalanceInOppositeDirections() throws Exception {
        String token = api.registerAndLogin();
        String expense = api.createExpenseCategory(token);
        String income = api.createIncomeCategory(token);
        api.createCheckpoint(token, LocalDate.now().minusDays(2), "1000.00");

        api.createTransaction(token, income, LocalDate.now(), "300.00", "INCOME");
        assertThat(api.currentBalance(token)).isEqualByComparingTo("1300.00");

        api.createTransaction(token, expense, LocalDate.now(), "100.00", "EXPENSE");
        assertThat(api.currentBalance(token)).isEqualByComparingTo("1200.00");
    }

    @Test
    void activeRecurringRuleIsProjectedIntoFutureMonths() throws Exception {
        String token = api.registerAndLogin();
        String income = api.createIncomeCategory(token);
        api.createCheckpoint(token, LocalDate.now().minusDays(1), "1000.00");
        // Scadenza nel mese prossimo: non genera nulla adesso, ma va proiettata.
        api.createRecurring(token, income, "Stipendio", "2000.00", LocalDate.now().plusMonths(1));

        JsonNode forecast = api.forecast(token, 3);
        JsonNode nextMonth = forecast.get("months").get(1);

        assertThat(nextMonth.get("projectedIncome").decimalValue()).isEqualByComparingTo("2000.00");
        assertThat(nextMonth.get("runningBalance").decimalValue())
                .isEqualByComparingTo(new BigDecimal("3000.00"));
    }

    @Test
    void currentMonthForecastReflectsTransactionsAlreadyRecorded() throws Exception {
        String token = api.registerAndLogin();
        String expense = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        api.createTransaction(token, expense, LocalDate.now(), "150.00", "EXPENSE");

        JsonNode currentMonth = api.forecast(token, 2).get("months").get(0);
        assertThat(currentMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("150.00");
        assertThat(currentMonth.get("runningBalance").decimalValue()).isEqualByComparingTo("850.00");
    }

    // Una transazione futura inserita a mano si somma alla ricorrenza proiettata: senza
    // un collegamento esplicito alla regola non è possibile stabilire che sia la stessa
    // spesa, e dedurlo dalla categoria nasconderebbe costi reali (vedi il caso "Farmaci"
    // qui sotto). La generazione automatica non passa da qui: quelle transazioni portano
    // il riferimento alla regola e non vengono mai proiettate due volte.
    @Test
    void aHandEnteredFutureTransactionAddsUpToTheProjectedOccurrence() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        LocalDate nextMonthDue = LocalDate.now().plusMonths(1).withDayOfMonth(15);
        api.createRecurring(token, category, "Netflix", "9.99", nextMonthDue);
        api.createTransaction(token, category, nextMonthDue, "9.99", "EXPENSE");

        JsonNode nextMonth = api.forecast(token, 2).get("months").get(1);
        assertThat(nextMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("19.98");
    }

    // Le occorrenze generate dal job restano collegate alla regola e non vengono
    // proiettate anche come stima: quelle non si contano mai due volte.
    @Test
    void anAutomaticallyGeneratedOccurrenceIsNotAlsoProjected() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        // Scadenza già passata: il recupero crea subito la transazione reale.
        api.createRecurring(token, category, "Abbonamento", "20.00", LocalDate.now().minusDays(1));

        JsonNode currentMonth = api.forecast(token, 1).get("months").get(0);
        assertThat(currentMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("20.00");
    }

    // Scenario reale: la categoria "Farmaci" ospita sia una ricorrenza (i farmaci presi
    // ogni mese) sia acquisti una tantum. Un acquisto occasionale non è l'occorrenza
    // della regola e non deve farla sparire dalla previsione.
    @Test
    void aOneOffPurchaseSharingTheCategoryWithARuleDoesNotReplaceIt() throws Exception {
        String token = api.registerAndLogin();
        String farmaci = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        LocalDate ruleDue = LocalDate.now().plusMonths(1).withDayOfMonth(10);
        LocalDate oneOff = LocalDate.now().plusMonths(1).withDayOfMonth(20);
        api.createRecurring(token, farmaci, "Farmaci mensili", "30.00", ruleDue);
        api.createTransaction(token, farmaci, oneOff, "15.00", "EXPENSE");

        JsonNode nextMonth = api.forecast(token, 2).get("months").get(1);
        assertThat(nextMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("45.00");
    }

    @Test
    void forecastIsScopedToTheRequestingUser() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);

        api.createCheckpoint(alice, LocalDate.now().minusDays(1), "1000.00");
        api.createTransaction(alice, aliceCategory, LocalDate.now(), "100.00", "EXPENSE");

        assertThat(api.currentBalance(alice)).isEqualByComparingTo("900.00");
        assertThat(api.currentBalance(bob)).isEqualByComparingTo("0");
    }
}
