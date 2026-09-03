package com.spesetracker;

import com.spesetracker.security.JwtProperties;
import com.spesetracker.security.JwtService;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La verifica dei token. È l'unico controllo fra una richiesta e i dati di qualcun altro, e
 * come i parser non ha bisogno di Spring: {@code JwtProperties} è un semplice contenitore di
 * due valori, quindi il servizio si costruisce a mano e i casi limite costano millisecondi.
 *
 * <p>Il valore di questi test sta tutto in un punto: {@code isTokenValid} deve rispondere
 * <em>false</em>, non sollevare un'eccezione. Un token malformato che esplode invece di essere
 * rifiutato diventa un 500 al posto di un 401 — e un 500 su un token scaduto è indistinguibile,
 * per chi guarda i log, da un guasto vero.
 */
class JwtServiceTest {

    private static final String SEGRETO = "un-segreto-abbastanza-lungo-per-hmac-sha256-almeno-32-byte";

    private JwtService servizio(long durataMs) {
        JwtProperties properties = new JwtProperties();
        properties.setSecret(SEGRETO);
        properties.setExpirationMs(durataMs);
        return new JwtService(properties);
    }

    @Test
    void unTokenAppenaEmessoEValidoEPortaLIdDellUtente() {
        JwtService jwt = servizio(3_600_000);
        UUID userId = UUID.randomUUID();

        String token = jwt.generateToken(userId, "andrea@example.com");

        assertThat(jwt.isTokenValid(token)).isTrue();
        assertThat(jwt.extractUserId(token)).isEqualTo(userId);
        assertThat(jwt.extractClaims(token).get("email", String.class)).isEqualTo("andrea@example.com");
    }

    // Una durata già trascorsa: il token nasce scaduto, che è il modo più diretto di provare
    // la scadenza senza far aspettare la suite.
    @Test
    void unTokenScadutoNonEValido() {
        JwtService jwt = servizio(-1_000);

        String token = jwt.generateToken(UUID.randomUUID(), "andrea@example.com");

        assertThat(jwt.isTokenValid(token)).isFalse();
    }

    /**
     * Il caso che conta davvero: un token firmato con un'altra chiave non deve passare. Se
     * passasse, chiunque potrebbe emettersi da sé un token per l'utente che vuole.
     */
    @Test
    void unTokenFirmatoConUnAltraChiaveNonEValido() {
        JwtProperties altre = new JwtProperties();
        altre.setSecret("un-altro-segreto-altrettanto-lungo-per-hmac-sha256-ok");
        altre.setExpirationMs(3_600_000);

        String tokenEstraneo = new JwtService(altre).generateToken(UUID.randomUUID(), "altro@example.com");

        assertThat(servizio(3_600_000).isTokenValid(tokenEstraneo)).isFalse();
    }

    @Test
    void unTokenManomessoNonEValido() {
        JwtService jwt = servizio(3_600_000);
        String token = jwt.generateToken(UUID.randomUUID(), "andrea@example.com");

        // Si cambia l'ultimo carattere della firma: il contenuto resta leggibile, la firma no.
        String manomesso = token.substring(0, token.length() - 1)
                + (token.endsWith("A") ? "B" : "A");

        assertThat(jwt.isTokenValid(manomesso)).isFalse();
    }

    // Non solo i token "quasi giusti": anche una stringa qualunque deve essere rifiutata,
    // non far esplodere il filtro.
    @Test
    void unaStringaQualunqueNonEValida() {
        JwtService jwt = servizio(3_600_000);

        assertThat(jwt.isTokenValid("non-e-un-token")).isFalse();
        assertThat(jwt.isTokenValid("")).isFalse();
        assertThat(jwt.isTokenValid("a.b.c")).isFalse();
    }
}
