package com.spesetracker;

import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Registrazione, login e protezione degli endpoint: è il perimetro di sicurezza
// dell'applicazione, prima non coperto da nessun test.
class AuthApiTest extends AbstractIntegrationTest {

    private String randomEmail() {
        return "auth+" + UUID.randomUUID() + "@example.com";
    }

    private String registerBody(String email, String password) {
        return """
                {"email":"%s","password":"%s"}
                """.formatted(email, password);
    }

    @Test
    void registerReturnsTokenAndEmail() throws Exception {
        String email = randomEmail();

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email, "password123")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.email").value(email));
    }

    @Test
    void registerRejectsDuplicateEmail() throws Exception {
        String email = randomEmail();
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email, "password123")))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email, "password123")))
                .andExpect(status().isConflict());
    }

    @Test
    void registerRejectsInvalidEmailAndShortPassword() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody("non-una-email", "password123")))
                .andExpect(status().isBadRequest());

        // La password ha un minimo di 8 caratteri (RegisterRequest).
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(randomEmail(), "corta")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loginSucceedsWithCorrectCredentialsAndFailsOtherwise() throws Exception {
        String email = randomEmail();
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email, "password123")))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email, "password123")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email, "password-sbagliata")))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(randomEmail(), "password123")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void protectedEndpointsRequireAValidToken() throws Exception {
        mockMvc.perform(get("/api/categories"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/categories").header("Authorization", "Bearer non-un-jwt"))
                .andExpect(status().isUnauthorized());

        String token = api.registerAndLogin();
        mockMvc.perform(get("/api/categories").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void tokenOfOneUserNeverSeesAnotherUsersData() throws Exception {
        String alice = api.registerAndLogin();
        String bob = api.registerAndLogin();
        api.createCategory(alice, "Solo-di-Alice", "EXPENSE");

        assertThat(api.json(mockMvc.perform(get("/api/categories")
                        .header("Authorization", "Bearer " + bob))
                .andExpect(status().isOk())
                .andReturn()))
                .isEmpty();
    }
}
