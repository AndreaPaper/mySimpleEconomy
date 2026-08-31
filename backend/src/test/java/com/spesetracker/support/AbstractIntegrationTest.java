package com.spesetracker.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Base di tutti i test di integrazione: avvia un Postgres usa e getta con Testcontainers
 * e lo collega automaticamente al context Spring, così {@code ./mvnw test} funziona su un
 * checkout pulito senza impostare DATABASE_URL a mano (serve solo Docker in esecuzione).
 *
 * <p>Il container è {@code static} e non viene mai fermato esplicitamente: Testcontainers lo
 * riusa per tutte le classi di test della stessa JVM (pattern "singleton container") e lo
 * elimina a fine build tramite Ryuk. Lo schema è creato una sola volta da {@code db/schema.sql},
 * lo stesso file usato per il database reale (il pom lo copia nel classpath di test).
 *
 * <p>Attenzione: i dati NON vengono ripuliti tra un test e l'altro. Ogni test deve creare il
 * proprio utente ({@link ApiTestClient#registerAndLogin()}) e asserire solo su dati propri —
 * le query dell'applicazione sono già filtrate per utente, quindi l'isolamento è garantito
 * dall'utente e non dal database.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
public abstract class AbstractIntegrationTest {

    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withInitScript("schema.sql");

    static {
        POSTGRES.start();
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    /** Scorciatoie per creare lo stato di partenza via API. */
    protected ApiTestClient api;

    @BeforeEach
    void initApiTestClient() {
        api = new ApiTestClient(mockMvc, objectMapper);
    }
}
