package com.spesetracker.service.bankimport;

import com.spesetracker.dto.bankimport.BankImportExclusionDto;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

// Al primo import propone le regole di esclusione che si leggono dai dati.
//
// Nell'estratto conto ci sono righe che muovono soldi senza essere spese: i
// giroconti verso un altro conto proprio e i prelievi di contante, che diventano
// una spesa solo quando quei contanti vengono spesi. Importarle come uscite
// gonfierebbe il totale, quindi si propone di escluderle. Sono proposte: le
// conferma l'utente e da quel momento diventano regole sue, modificabili.
public final class BankExclusionSuggestions {

    // "Bonifico ... a favore di MARIO ROSSI"
    private static final Pattern BENEFICIARY =
            Pattern.compile("(?i)a\\s+favore\\s+di\\s+([\\p{L}'\\s]{3,60}?)(?=\\s{2,}|\\s*$|\\s+MANDATO|\\s+COD)");
    // "... BENEF. MARIO ROSSI ..." nelle entrate: e' il titolare del conto.
    private static final Pattern ACCOUNT_HOLDER =
            Pattern.compile("(?i)BENEF\\.?\\s+([\\p{L}'\\s]{3,60}?)(?=\\s+BIC|\\s+MITT|\\s{2,}|\\s*$)");
    private static final Pattern CASH_WITHDRAWAL = Pattern.compile("(?i)\\bprelievo\\b");

    private BankExclusionSuggestions() {
    }

    public static List<BankImportExclusionDto> suggest(List<BankStatementRow> rows) {
        List<BankImportExclusionDto> suggestions = new ArrayList<>();
        suggestions.addAll(selfTransfers(rows));
        cashWithdrawal(rows).ifPresent(suggestions::add);
        return suggestions;
    }

    // Un bonifico in uscita il cui beneficiario e' lo stesso nome che compare
    // come beneficiario delle entrate: cioe' l'utente che sposta soldi fra conti
    // suoi. Il nome si ricava dal file, senza chiederlo e senza indovinarlo.
    private static List<BankImportExclusionDto> selfTransfers(List<BankStatementRow> rows) {
        Set<String> holders = rows.stream()
                .filter(row -> row.amount().signum() > 0)
                .map(row -> firstMatch(ACCOUNT_HOLDER, row.searchableText()))
                .filter(name -> name != null && !name.isBlank())
                .map(BankExclusionSuggestions::nameKey)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (holders.isEmpty()) return List.of();

        Set<String> patterns = new LinkedHashSet<>();
        for (BankStatementRow row : rows) {
            if (row.amount().signum() >= 0) continue;
            String beneficiary = firstMatch(BENEFICIARY, row.searchableText());
            if (beneficiary == null || beneficiary.isBlank()) continue;
            if (holders.contains(nameKey(beneficiary))) {
                patterns.add("a favore di " + beneficiary.trim());
            }
        }

        return patterns.stream()
                .map(pattern -> new BankImportExclusionDto(
                        pattern, "Giroconto verso un tuo conto: sposta soldi, non li spende"))
                .toList();
    }

    private static java.util.Optional<BankImportExclusionDto> cashWithdrawal(List<BankStatementRow> rows) {
        boolean present = rows.stream()
                .filter(row -> row.amount().signum() < 0)
                .anyMatch(row -> CASH_WITHDRAWAL.matcher(row.searchableText()).find());
        return present
                ? java.util.Optional.of(new BankImportExclusionDto(
                        "Prelievo", "I contanti diventano una spesa quando li spendi, non quando li ritiri"))
                : java.util.Optional.empty();
    }

    private static String firstMatch(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.group(1).trim() : null;
    }

    // "ANDREA BATTISTINI" e "Battistini Andrea" sono la stessa persona: si
    // confrontano le parole, non la stringa.
    private static String nameKey(String name) {
        return Arrays.stream(name.toLowerCase(Locale.ITALIAN).split("\\s+"))
                .filter(word -> !word.isBlank())
                .sorted()
                .collect(Collectors.joining(" "));
    }
}
