package com.spesetracker.service.bankimport;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.Locale;

// L'export della banca non ha un identificativo di transazione, quindi il
// riconoscimento dei doppioni si basa sul contenuto della riga. Data, importo,
// operazione e dettagli insieme sono più che sufficienti: nel file di prova non
// ci sono collisioni nemmeno sulla sola coppia data+importo, e i dettagli
// contengono quasi sempre un orario o un codice che li rende unici.
public final class BankFingerprints {

    private BankFingerprints() {
    }

    public static String of(LocalDate date, BigDecimal amount, String operation, String details) {
        String payload = String.join("|",
                date == null ? "" : date.toString(),
                amount == null ? "" : amount.stripTrailingZeros().toPlainString(),
                normalize(operation),
                normalize(details));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 fa parte della piattaforma: se manca non c'è ripiego sensato.
            throw new IllegalStateException("SHA-256 non disponibile", e);
        }
    }

    // La banca non è coerente sulle maiuscole né sugli spazi fra un export e
    // l'altro, quindi si confronta il testo normalizzato.
    private static String normalize(String value) {
        if (value == null) return "";
        return value.trim().replaceAll("\\s{2,}", " ").toUpperCase(Locale.ITALIAN);
    }
}
