package com.spesetracker.service.bankimport;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

// Da "Operazione" e "Dettagli" a una descrizione leggibile.
//
// La colonna Operazione di solito contiene gia' il nome dell'esercente
// ("Coop Genova Gastaldi Genova") ed e' la scelta migliore. Sui movimenti non
// ancora contabilizzati pero' la banca ci mette il tipo di pagamento
// ("Pagamento Pos") e il nome finisce nei Dettagli: in quel caso si ripiega su
// quelli, ripuliti dai codici di carta e dai riferimenti interni, che
// occuperebbero tutta la riga dell'elenco senza dire niente.
public final class BankDescriptions {

    private static final int MAX_LENGTH = 255;

    // Termini che descrivono il mezzo di pagamento, non chi ha incassato.
    private static final List<String> GENERIC = List.of(
            "pagamento pos",
            "pagamento tramite pos",
            "pagamento su pos",
            "pagamento carta",
            "operazione",
            "movimento");

    private static final List<Pattern> NOISE = List.of(
            // "Carta n.5397 XXXX XXXX XX57" e varianti
            Pattern.compile("(?i)\\bcarta\\s*n?[.\\s]*\\d[\\dxX*\\s]{6,}"),
            Pattern.compile("(?i)\\bmediante\\s+la\\s+carta\\s+[\\dxX*\\s]{6,}"),
            Pattern.compile("(?i)\\babi\\s*\\d+"),
            Pattern.compile("(?i)\\bcod\\.?\\s*(disp\\.?)?\\s*[\\d/]{4,}"),
            Pattern.compile("(?i)\\bmandato\\s+\\S{6,}"),
            Pattern.compile("(?i)\\bbic\\.?\\s*\\S*$"),
            // "Effettuato Il 16/08/2026 Alle Ore 1723 Mediante La Carta ... Presso X"
            Pattern.compile("(?i)\\beffettuato\\s+il\\s+\\d{2}/\\d{2}/\\d{4}\\s+alle\\s+ore\\s+\\d+"),
            Pattern.compile("(?i)\\bpresso\\b"),
            Pattern.compile("(?i)\\bidentific\\.?\\s*univoco\\s+transazione\\s+\\S+"),
            // Codici di riferimento lunghi, senza spazi: non dicono niente a chi legge.
            Pattern.compile("\\b[A-Z0-9]{12,}\\b"));

    private BankDescriptions() {
    }

    public static String describe(String operation, String details) {
        if (isUsable(operation)) {
            return truncate(operation.trim());
        }
        String cleaned = clean(details);
        if (cleaned != null && !cleaned.isBlank()) {
            return truncate(cleaned);
        }
        // Meglio un'etichetta generica che una descrizione vuota: la riga resta
        // comunque riconoscibile da data e importo.
        return truncate(operation != null && !operation.isBlank() ? operation.trim() : "Movimento");
    }

    private static boolean isUsable(String operation) {
        if (operation == null || operation.isBlank()) return false;
        String normalized = operation.toLowerCase(Locale.ITALIAN).trim();
        return GENERIC.stream().noneMatch(normalized::equals);
    }

    private static String clean(String details) {
        if (details == null) return null;
        String out = details;
        for (Pattern pattern : NOISE) {
            out = pattern.matcher(out).replaceAll(" ");
        }
        return out.replaceAll("\\s{2,}", " ").trim();
    }

    private static String truncate(String value) {
        return value.length() <= MAX_LENGTH ? value : value.substring(0, MAX_LENGTH);
    }
}
