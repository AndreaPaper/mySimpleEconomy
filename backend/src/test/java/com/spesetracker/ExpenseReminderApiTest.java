package com.spesetracker;

import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// I promemoria sono spese fisse di cui non si conosce l'importo in anticipo: hanno
// comunque bisogno di una categoria di uscita dell'utente.
class ExpenseReminderApiTest extends AbstractIntegrationTest {

    @Test
    void createsAndListsAReminder() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);

        api.createReminder(token, category, "Bollo auto", LocalDate.now().plusDays(10));

        mockMvc.perform(get("/api/expense-reminders").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Bollo auto"));
    }

    // Regressione: i test storici creavano promemoria senza categoria e ricevevano 400,
    // perché ExpenseReminderRequest.categoryId è @NotNull.
    @Test
    void aReminderWithoutACategoryIsRejected() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Senza categoria","intervalUnit":"MONTH","intervalValue":1,\
                                "startDate":"%s","nextDueDate":"%s"}
                                """.formatted(LocalDate.now(), LocalDate.now())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anIncomeCategoryIsNotAcceptedForAReminder() throws Exception {
        String token = api.registerAndLogin();
        String income = api.createIncomeCategory(token);

        mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Sbagliata","intervalUnit":"MONTH","intervalValue":1,\
                                "startDate":"%s","nextDueDate":"%s"}
                                """.formatted(income, LocalDate.now(), LocalDate.now())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cannotUseAnotherUsersCategory() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);

        mockMvc.perform(post("/api/expense-reminders")
                        .header("Authorization", "Bearer " + bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","name":"Furtivo","intervalUnit":"MONTH","intervalValue":1,\
                                "startDate":"%s","nextDueDate":"%s"}
                                """.formatted(aliceCategory, LocalDate.now(), LocalDate.now())))
                .andExpect(status().isNotFound());
    }

    @Test
    void deactivateAndReactivate() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        String id = api.createReminder(token, category, "Assicurazione", LocalDate.now().plusDays(5));

        mockMvc.perform(post("/api/expense-reminders/" + id + "/deactivate")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is2xxSuccessful());
        mockMvc.perform(get("/api/expense-reminders").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$[0].active").value(false));

        mockMvc.perform(post("/api/expense-reminders/" + id + "/reactivate")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is2xxSuccessful());
        mockMvc.perform(get("/api/expense-reminders").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$[0].active").value(true));
    }

    @Test
    void upcomingProjectsTheReminderAcrossTheRequestedMonths() throws Exception {
        String token = api.registerAndLogin();
        String category = api.createExpenseCategory(token);
        api.createReminder(token, category, "Affitto", LocalDate.now().plusDays(3));

        mockMvc.perform(get("/api/expense-reminders/upcoming")
                        .param("months", "4")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.months.length()").value(4));
    }

    @Test
    void remindersAreIsolatedBetweenUsers() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        String aliceCategory = api.createExpenseCategory(alice);
        api.createReminder(alice, aliceCategory, "Solo di Alice", LocalDate.now().plusDays(3));

        mockMvc.perform(get("/api/expense-reminders").header("Authorization", "Bearer " + bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
