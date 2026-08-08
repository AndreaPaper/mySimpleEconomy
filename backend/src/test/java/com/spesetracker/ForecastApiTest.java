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

    // Registrare a mano l'occorrenza futura di una ricorrenza non deve farla contare
    // due volte: vale l'importo reale inserito, non la proiezione.
    @Test
    void manuallyRecordingAFutureRecurringOccurrenceDoesNotDoubleCount() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        LocalDate nextMonthDue = LocalDate.now().plusMonths(1).withDayOfMonth(15);
        api.createRecurring(token, category, "Netflix", "9.99", nextMonthDue);
        api.createTransaction(token, category, nextMonthDue, "9.99", "EXPENSE");

        JsonNode nextMonth = api.forecast(token, 2).get("months").get(1);
        assertThat(nextMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("9.99");
    }

    // L'importo realmente registrato prevale sulla stima della regola.
    @Test
    void theHandEnteredAmountWinsOverTheRuleDefault() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        LocalDate nextMonthDue = LocalDate.now().plusMonths(1).withDayOfMonth(15);
        api.createRecurring(token, category, "Enel", "50.00", nextMonthDue);
        api.createTransaction(token, category, nextMonthDue, "73.40", "EXPENSE");

        JsonNode nextMonth = api.forecast(token, 2).get("months").get(1);
        assertThat(nextMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("73.40");
    }

    // Il riconoscimento è per categoria: una spesa futura in un'altra categoria non
    // deve far sparire la ricorrenza dalla previsione.
    @Test
    void aFutureTransactionInAnotherCategoryDoesNotSuppressTheProjection() throws Exception {
        String token = api.registerAndLogin();
        String subscriptions = api.createExpenseCategory(token);
        String groceries = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        LocalDate nextMonthDue = LocalDate.now().plusMonths(1).withDayOfMonth(15);
        api.createRecurring(token, subscriptions, "Netflix", "9.99", nextMonthDue);
        api.createTransaction(token, groceries, nextMonthDue, "40.00", "EXPENSE");

        JsonNode nextMonth = api.forecast(token, 2).get("months").get(1);
        assertThat(nextMonth.get("projectedExpense").decimalValue()).isEqualByComparingTo("49.99");
    }

    // Una regola settimanale ha più occorrenze legittime nello stesso mese: una sola
    // registrazione manuale deve annullarne una sola, non tutte.
    @Test
    void onlyOneOccurrenceIsSuppressedPerHandEnteredTransaction() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        api.createCheckpoint(token, LocalDate.now().withDayOfMonth(1), "1000.00");

        // Regola settimanale che parte dal primo giorno del mese prossimo.
        LocalDate start = LocalDate.now().plusMonths(1).withDayOfMonth(1);
        mockMvc.perform(post("/api/recurring-transactions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Spesa settimanale","defaultAmount":10.00,\
                                "intervalUnit":"WEEK","intervalValue":1,"startDate":"%s","nextDueDate":"%s"}
                                """.formatted(category, start, start)))
                .andExpect(status().isCreated());

        JsonNode withoutManual = api.forecast(token, 2).get("months").get(1);
        java.math.BigDecimal projectedAlone = withoutManual.get("projectedExpense").decimalValue();

        api.createTransaction(token, category, start.plusDays(1), "10.00", "EXPENSE");

        JsonNode withManual = api.forecast(token, 2).get("months").get(1);
        // Una proiezione da 10.00 sostituita dalla transazione reale da 10.00: il totale
        // del mese non cambia, ma non raddoppia nemmeno.
        assertThat(withManual.get("projectedExpense").decimalValue()).isEqualByComparingTo(projectedAlone);
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
