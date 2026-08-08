package com.spesetracker;

import com.fasterxml.jackson.databind.JsonNode;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

// Confini di data del calcolo del saldo: è la parte più delicata del backend e ha già
// prodotto un bug in produzione (un saldo registrato "oggi" congelava il saldo attuale
// per tutto il giorno, perché la finestra partiva da checkpointDate + 1).
class ForecastApiTest extends AbstractIntegrationTest {

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

    // Documenta il comportamento attuale: "Saldo attuale" è il saldo di oggi, quindi una
    // spesa con data futura non lo tocca ancora (comparirà nella previsione del mese).
    @Test
    void futureDatedTransactionDoesNotAffectCurrentBalance() throws Exception {
        String token = api.registerAndLogin();
        String expense = api.createExpenseCategory(token);

        api.createCheckpoint(token, LocalDate.now().minusDays(1), "1000.00");
        api.createTransaction(token, expense, LocalDate.now().plusDays(3), "250.00", "EXPENSE");

        assertThat(api.currentBalance(token)).isEqualByComparingTo("1000.00");
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
