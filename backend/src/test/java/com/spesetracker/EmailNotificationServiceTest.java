package com.spesetracker;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.model.User;
import com.spesetracker.service.EmailNotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * L'unica email che l'applicazione manda davvero.
 *
 * <p>Nel giro precedente avevo scritto che testarla richiedeva uno stub HTTP e che la logica
 * andasse prima estratta dal costruttore. Era sbagliato due volte:
 * {@link MockRestServiceServer#bindTo(RestClient.Builder)} si lega al <em>builder</em>, quindi il
 * servizio si costruisce a mano e il test resta puro — niente Spring, niente container, nessuna
 * dipendenza in piu' oltre a spring-boot-starter-test, che c'era gia'.
 *
 * <p>Vale la pena averlo: e' l'unico testo che esce dall'applicazione e arriva a una persona, e
 * nessuno lo rilegge prima che parta.
 */
class EmailNotificationServiceTest {

    private static final String CHIAVE = "re_chiave_di_prova";
    private static final String MITTENTE = "promemoria@example.com";

    private MockRestServiceServer resend;
    private EmailNotificationService servizio;

    @BeforeEach
    void preparaIlFintoResend() {
        RestClient.Builder builder = RestClient.builder();
        resend = MockRestServiceServer.bindTo(builder).build();
        servizio = new EmailNotificationService(builder, CHIAVE, MITTENTE);
    }

    private User utente() {
        User user = new User();
        user.setEmail("andrea@example.com");
        return user;
    }

    private ExpenseReminder promemoria(String nome, LocalDate scadenza) {
        return ExpenseReminder.builder().name(nome).nextDueDate(scadenza).build();
    }

    /** Un promemoria che scade fra i giorni indicati a partire da oggi. */
    private ExpenseReminder fraGiorni(long giorni) {
        return promemoria("Bollo auto", LocalDate.now().plusDays(giorni));
    }

    // ------------------------------------------------------------------
    // La richiesta
    // ------------------------------------------------------------------

    @Test
    void mandaLaRichiestaAResendConChiaveDestinatarioEContenuto() {
        LocalDate scadenza = LocalDate.now().plusDays(5);
        resend.expect(requestTo("https://api.resend.com/emails"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + CHIAVE))
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$.from").value(MITTENTE))
                .andExpect(jsonPath("$.to[0]").value("andrea@example.com"))
                .andExpect(jsonPath("$.subject").value("Promemoria: Bollo auto tra 5 giorni"))
                .andExpect(jsonPath("$.text").value(
                        "Il promemoria \"Bollo auto\" scade il "
                                + scadenza.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"))
                                + " (tra 5 giorni)."))
                .andRespond(withSuccess("{\"id\":\"abc\"}", org.springframework.http.MediaType.APPLICATION_JSON));

        servizio.sendReminderNotification(utente(), promemoria("Bollo auto", scadenza));

        resend.verify();
    }

    // ------------------------------------------------------------------
    // Quando scade
    // ------------------------------------------------------------------

    /**
     * Il bug che questo test ha fatto emergere: fino a ieri qui c'era scritto
     * <em>"tra 1 giorni"</em>. E' l'avviso del giorno prima della scadenza, cioe' quello che
     * quasi tutti leggono — l'unico che arriva quando c'e' ancora tempo per agire.
     */
    @Test
    void ilGiornoPrimaUsaIlSingolare() {
        attendiOggettoCheContiene("tra 1 giorno");

        servizio.sendReminderNotification(utente(), fraGiorni(1));

        resend.verify();
    }

    @Test
    void oltreIlGiornoUsaIlPlurale() {
        attendiOggettoCheContiene("tra 3 giorni");

        servizio.sendReminderNotification(utente(), fraGiorni(3));

        resend.verify();
    }

    @Test
    void ilGiornoStessoDiceOggi() {
        attendiOggettoCheContiene("oggi");

        servizio.sendReminderNotification(utente(), fraGiorni(0));

        resend.verify();
    }

    /**
     * Una scadenza gia' passata dice comunque "oggi", non "tra -2 giorni". Capita quando il job
     * delle notifiche gira dopo un fermo: l'avviso e' in ritardo, ma resta leggibile.
     */
    @Test
    void unaScadenzaGiaPassataDiceOggiENonUnNumeroNegativo() {
        attendiOggettoCheContiene("oggi");

        servizio.sendReminderNotification(utente(), fraGiorni(-2));

        resend.verify();
    }

    // ------------------------------------------------------------------
    // Errori
    // ------------------------------------------------------------------

    /**
     * La premessa su cui poggia il test della notifica non consumata
     * ({@code ExpenseReminderNotificationTest}): un errore qui deve <em>propagare</em>. Se questo
     * servizio inghiottisse il fallimento, il chiamante segnerebbe la notifica come inviata e
     * l'utente non riceverebbe mai l'avviso — senza che nulla, da nessuna parte, lo segnali.
     */
    @Test
    void unErroreDiResendPropagaInveceDiEssereInghiottito() {
        resend.expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> servizio.sendReminderNotification(utente(), fraGiorni(3)))
                .isInstanceOf(RestClientResponseException.class);
    }

    @Test
    void ancheUnGuastoDelServizioPropaga() {
        resend.expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> servizio.sendReminderNotification(utente(), fraGiorni(3)))
                .isInstanceOf(RestClientResponseException.class);
    }

    // Una risposta vuota va bene: il corpo non viene letto (toBodilessEntity).
    @Test
    void unaRispostaSenzaCorpoNonEUnProblema() {
        resend.expect(requestTo("https://api.resend.com/emails")).andRespond(withSuccess());

        assertThatCode(() -> servizio.sendReminderNotification(utente(), fraGiorni(3)))
                .doesNotThrowAnyException();
    }

    private void attendiOggettoCheContiene(String quando) {
        resend.expect(requestTo("https://api.resend.com/emails"))
                .andExpect(jsonPath("$.subject").value("Promemoria: Bollo auto " + quando))
                .andExpect(jsonPath("$.text").value(org.hamcrest.Matchers.containsString("(" + quando + ")")))
                .andRespond(withSuccess());
    }
}
