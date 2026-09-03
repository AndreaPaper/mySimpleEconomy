package com.spesetracker;

import com.spesetracker.repository.UserRepository;
import com.spesetracker.security.JwtService;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * I modi sbagliati di presentarsi all'API. I test esistenti verificano che un utente entri nei
 * propri dati e non in quelli altrui; qui si guarda cosa succede quando la richiesta è
 * malformata invece che ostile — che è il caso molto più frequente, e quello dove un 500 al
 * posto di un 401 o di un 400 fa sembrare guasto il server mentre il problema è nel client.
 */
class SecurityEdgeCasesTest extends AbstractIntegrationTest {

    @Autowired
    private JwtService jwtService;

    @Autowired
    private UserRepository userRepository;

    @Test
    void senzaTokenSiRiceve401() throws Exception {
        mockMvc.perform(get("/api/transactions")).andExpect(status().isUnauthorized());
    }

    // Il filtro riconosce solo il prefisso "Bearer ": un'intestazione con il token nudo va
    // trattata come assente, non come un tentativo valido.
    @Test
    void unTokenSenzaIlPrefissoBearerNonAutentica() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(get("/api/transactions").header("Authorization", token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unTokenMalformatoDa401ENonUnErroreDelServer() throws Exception {
        mockMvc.perform(get("/api/transactions").header("Authorization", "Bearer non-e-un-token"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * Il caso con il rischio più concreto, perché non è un attacco ma un incidente ordinario:
     * l'utente cancella l'account (o lo si cancella dal database) e il suo browser ha ancora un
     * token perfettamente firmato e non scaduto. La firma regge, quindi il filtro prova a
     * caricare l'utente — che non c'è più.
     *
     * <p>Deve venirne fuori un 401, non un 500: il client sa gestire "non sei più autenticato",
     * mentre davanti a un errore del server mostra un guasto e non manda l'utente al login.
     */
    @Test
    void unTokenValidoDiUnUtenteCancellatoDa401() throws Exception {
        String email = "cancellato+" + UUID.randomUUID() + "@example.com";
        String token = api.registerAndLogin(email, "password123");
        userRepository.delete(userRepository.findByEmail(email).orElseThrow());

        mockMvc.perform(get("/api/transactions").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    /**
     * Un token firmato con la chiave giusta ma per un utente che non è mai esistito: stessa
     * situazione del precedente, senza dipendere dalla cancellazione.
     */
    @Test
    void unTokenPerUnUtenteMaiEsistitoDa401() throws Exception {
        String token = jwtService.generateToken(UUID.randomUUID(), "fantasma@example.com");

        mockMvc.perform(get("/api/transactions").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    // Il sondaggio che sveglia il server dopo il sospensione: deve rispondere senza token,
    // altrimenti l'app non ha modo di sapere che il backend è tornato su.
    @Test
    void ilSondaggioRispondeSenzaAutenticazione() throws Exception {
        mockMvc.perform(get("/api/ping")).andExpect(status().isOk());
    }

    /**
     * L'unica ragione di esistere di {@code ApiExceptionHandler}: i vincoli sui parametri di
     * query sollevano {@code ConstraintViolationException}, che senza handler diventerebbe un
     * 500. Un input fuori intervallo è un errore del client e deve dare 400.
     */
    @Test
    void unParametroFuoriIntervalloDa400ENon500() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(get("/api/forecast").param("months", "0")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/forecast").param("months", "99")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unParametroNonNumericoDa400() throws Exception {
        String token = api.registerAndLogin();

        mockMvc.perform(get("/api/forecast").param("months", "molti")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }
}
