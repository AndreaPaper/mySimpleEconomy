package com.spesetracker.service.bankimport;

import com.spesetracker.dto.bankimport.*;
import com.spesetracker.model.BankCategoryMapping;
import com.spesetracker.model.BankImportExclusion;
import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.enums.BankSource;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.BankCategoryMappingRepository;
import com.spesetracker.repository.BankImportExclusionRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

// Confronta l'estratto conto con quello che l'utente ha gia' in archivio e
// propone cosa fare riga per riga. Non scrive niente: tutte le decisioni
// passano dall'anteprima e le applica il commit.
@Service
@RequiredArgsConstructor
public class BankImportAnalysisService {

    // Fra l'autorizzazione di un pagamento e la sua contabilizzazione passano di
    // norma uno o due giorni; cinque danno margine ai fine settimana senza
    // arrivare ad abbracciare la spesa della settimana dopo.
    private static final int PROVISIONAL_MATCH_DAYS = 5;

    // Sotto questo scarto una spesa e una ricorrente si somigliano abbastanza da
    // meritare una segnalazione: bollette e rate variano poco. Vale solo quando la
    // categoria della riga è quella della regola, o non è ancora nota: vedi
    // looksLikeRecurring.
    private static final BigDecimal RECURRING_TOLERANCE = new BigDecimal("0.20");

    // La tolleranza quando la categoria della riga è nota e diversa da quella della
    // regola: abbastanza per un importo arrotondato nella regola, non per una spesa
    // qualsiasi che gli somiglia. Vedi looksLikeRecurring.
    private static final BigDecimal RECURRING_TOLERANCE_OTHER_CATEGORY = new BigDecimal("0.05");

    // Una ricorrente mensile non cade mai al giorno esatto (weekend, festivi),
    // ma nemmeno a due settimane di distanza.
    static final int RECURRING_MATCH_DAYS = 5;

    private final IntesaSanpaoloParser intesaParser;
    private final TransactionRepository transactionRepository;
    private final RecurringTransactionRepository recurringRepository;
    private final BankCategoryMappingRepository mappingRepository;
    private final BankImportExclusionRepository exclusionRepository;
    private final SalaryCategoryResolver salaryResolver;

    @Transactional(readOnly = true)
    public BankImportPreviewResponse analyze(UUID userId, BankSource source, MultipartFile file) throws IOException {
        List<BankStatementRow> rows = parse(source, file.getInputStream());

        LocalDate firstDate = rows.stream().map(BankStatementRow::date).min(Comparator.naturalOrder()).orElseThrow();
        LocalDate lastDate = rows.stream().map(BankStatementRow::date).max(Comparator.naturalOrder()).orElseThrow();

        Set<String> knownFingerprints = new HashSet<>(transactionRepository.findImportFingerprints(userId));
        List<Transaction> provisional = transactionRepository.findByUserIdAndImportProvisionalTrue(userId);
        // Il confronto con le transazioni scritte a mano si limita al periodo del
        // file: fuori da li' non ci puo' essere un doppione.
        List<Transaction> inRange = transactionRepository.findByUserIdAndOccurredOnBetween(
                userId, firstDate.minusDays(PROVISIONAL_MATCH_DAYS), lastDate.plusDays(PROVISIONAL_MATCH_DAYS));
        List<RecurringTransaction> recurring = recurringRepository.findByUserIdAndActiveTrue(userId);

        Map<String, BankCategoryMapping> mappings = mappingRepository.findByUserIdAndSource(userId, source).stream()
                .collect(Collectors.toMap(
                        m -> mappingKey(m.getBankCategory(), m.getTransactionType()), m -> m, (a, b) -> a));
        List<BankImportExclusion> exclusions = exclusionRepository.findByUserIdAndSource(userId, source);

        // La categoria stipendio del profilo, da proporre per la categoria con
        // cui la banca chiama l'accredito. Null se lo stipendio non e' ancora
        // configurato: in quel caso non c'e' niente da proporre.
        UUID salaryCategoryId = salaryResolver.profileSalaryCategory(userId).map(Category::getId).orElse(null);

        List<BankImportRowPreview> previews = new ArrayList<>();
        Map<String, BankCategoryMappingDto> unmapped = new LinkedHashMap<>();
        // Una provvisoria puo' essere il definitivo di una sola riga: senza
        // questo, due spese uguali si abbinerebbero entrambe alla stessa.
        Set<UUID> claimedProvisional = new HashSet<>();
        // Lo stesso per le occorrenze delle regole ricorrenti (transazioni generate e
        // regole non ancora scadute): una sola riga può prenderne il posto.
        Set<UUID> claimedRecurring = new HashSet<>();

        for (BankStatementRow row : rows) {
            TransactionType type = row.amount().signum() < 0 ? TransactionType.EXPENSE : TransactionType.INCOME;
            BigDecimal amount = row.amount().abs();
            String fingerprint = BankFingerprints.of(row.date(), row.amount(), row.operation(), row.details());
            String description = BankDescriptions.describe(row.operation(), row.details());

            BankCategoryMapping mapping = mappings.get(mappingKey(row.bankCategory(), type));
            UUID categoryId = mapping != null && mapping.getCategory() != null ? mapping.getCategory().getId() : null;
            boolean mappedToSkip = mapping != null && mapping.getCategory() == null;

            BankImportOutcome outcome;
            UUID matchedTransactionId = null;
            UUID matchedRecurringId = null;
            String conflict = null;

            if (knownFingerprints.contains(fingerprint)) {
                outcome = BankImportOutcome.GIA_IMPORTATA;
            } else if (mappedToSkip || matchesExclusion(row, exclusions)) {
                outcome = BankImportOutcome.ESCLUSA;
            } else {
                List<Transaction> candidates = row.booked()
                        ? findProvisionalCandidates(provisional, claimedProvisional, row.date(), amount, type)
                        : List.of();

                if (candidates.size() == 1) {
                    Transaction match = candidates.get(0);
                    claimedProvisional.add(match.getId());
                    outcome = BankImportOutcome.AGGIORNA_PROVVISORIA;
                    matchedTransactionId = match.getId();
                    conflict = "Importata quando era ancora provvisoria: " + describeTransaction(match);
                } else if (candidates.size() > 1) {
                    // Indovinare qui vorrebbe dire riscrivere la spesa sbagliata
                    // senza dirlo: meglio chiedere.
                    outcome = BankImportOutcome.SOSPETTO_MANUALE;
                    conflict = candidates.size() + " movimenti provvisori con lo stesso importo in questi giorni: "
                            + "non so quale di loro sia diventato questo.";
                } else if (!row.booked() && settledVersion(inRange, row.date(), amount, type).isPresent()) {
                    // Un export vecchio ripassato dopo uno piu' recente: qui la
                    // riga e' ancora provvisoria, ma in archivio c'e' gia' la sua
                    // versione definitiva, con un'altra impronta. Senza questo
                    // controllo rientrerebbe come nuova e sarebbe un doppione.
                    outcome = BankImportOutcome.SOSPETTO_MANUALE;
                    conflict = "Sembra la versione provvisoria di un movimento gia' definitivo in archivio: "
                            + describeTransaction(settledVersion(inRange, row.date(), amount, type).get());
                } else {
                    // La categoria con cui confrontare la riga: quella mappata o, per una
                    // categoria della banca non ancora mappata che è chiaramente lo
                    // stipendio, quella dello stipendio del profilo.
                    UUID effectiveCategoryId = categoryId != null
                            ? categoryId
                            : salaryCategoryId != null && salaryResolver.looksLikeSalary(row.bankCategory(), type)
                                    ? salaryCategoryId
                                    : null;
                    RecurringOccurrence occurrence = findRecurringOccurrence(
                            inRange, recurring, claimedRecurring, row.date(), amount, type, effectiveCategoryId);
                    Optional<Transaction> manual = occurrence != null
                            ? Optional.empty()
                            : findManualDuplicate(inRange, row.date(), amount, type);
                    String recurringConflict = occurrence != null || manual.isPresent()
                            ? null
                            : findRecurringConflict(inRange, recurring, row.date(), amount, type, categoryId);
                    if (occurrence != null) {
                        outcome = BankImportOutcome.SOSTITUISCE_RICORRENTE;
                        if (occurrence.generated() != null) {
                            claimedRecurring.add(occurrence.generated().getId());
                            matchedTransactionId = occurrence.generated().getId();
                            conflict = "Prende il posto della transazione della regola: "
                                    + describeTransaction(occurrence.generated());
                        } else {
                            claimedRecurring.add(occurrence.rule().getId());
                            matchedRecurringId = occurrence.rule().getId();
                            conflict = "È la scadenza del " + occurrence.rule().getNextDueDate()
                                    + " della regola " + occurrence.rule().getName()
                                    + ": entra al suo posto, e la regola non la genererà una seconda volta";
                        }
                        if (categoryId == null) {
                            categoryId = effectiveCategoryId;
                        }
                    } else if (manual.isPresent()) {
                        outcome = BankImportOutcome.SOSPETTO_MANUALE;
                        conflict = "Gia' presente, scritta a mano: " + describeTransaction(manual.get());
                    } else if (recurringConflict != null) {
                        outcome = BankImportOutcome.SOSPETTO_RICORRENTE;
                        conflict = recurringConflict;
                    } else {
                        outcome = BankImportOutcome.NUOVA;
                    }
                }
            }

            boolean needsCategory = mapping == null
                    && outcome != BankImportOutcome.GIA_IMPORTATA
                    && outcome != BankImportOutcome.ESCLUSA;
            if (needsCategory) {
                collectUnmapped(unmapped, row, type, description, salaryCategoryId);
            }

            previews.add(new BankImportRowPreview(
                    row.rowNumber(),
                    row.date(),
                    description,
                    row.operation(),
                    row.details(),
                    bankCategoryLabel(row.bankCategory()),
                    amount,
                    type,
                    !row.booked(),
                    outcome,
                    categoryId,
                    matchedTransactionId,
                    matchedRecurringId,
                    conflict,
                    outcome == BankImportOutcome.NUOVA
                            || outcome == BankImportOutcome.AGGIORNA_PROVVISORIA
                            || outcome == BankImportOutcome.SOSTITUISCE_RICORRENTE));
        }

        // Le proposte di esclusione hanno senso solo la prima volta: dopo, la
        // lista dell'utente e' la risposta, anche se e' vuota per sua scelta.
        List<BankImportExclusionDto> suggested = exclusions.isEmpty()
                ? BankExclusionSuggestions.suggest(rows)
                : List.of();

        return new BankImportPreviewResponse(
                previews,
                List.copyOf(unmapped.values()),
                exclusions.stream().map(e -> new BankImportExclusionDto(e.getPattern(), e.getNote())).toList(),
                suggested,
                summarize(previews, unmapped.size(), firstDate, lastDate));
    }

    private List<BankStatementRow> parse(BankSource source, InputStream stream) throws IOException {
        // Un solo formato per ora; lo switch e' il punto in cui aggiungerne altri.
        return switch (source) {
            case INTESA_SANPAOLO -> intesaParser.parse(stream);
        };
    }

    private void collectUnmapped(
            Map<String, BankCategoryMappingDto> unmapped, BankStatementRow row, TransactionType type, String sample,
            UUID salaryCategoryId) {
        String key = mappingKey(row.bankCategory(), type);
        BankCategoryMappingDto existing = unmapped.get(key);
        if (existing == null) {
            // La categoria con cui la banca chiama lo stipendio arriva gia'
            // puntata su quella del profilo invece che da scegliere: sono la
            // stessa cosa, e lasciarle separate rompe il calcolo del risparmio.
            // Resta una proposta, visibile nel menu e modificabile.
            UUID suggested = salaryResolver.looksLikeSalary(row.bankCategory(), type) ? salaryCategoryId : null;
            unmapped.put(key, new BankCategoryMappingDto(
                    bankCategoryLabel(row.bankCategory()), type, suggested, false, 1, sample));
        } else {
            unmapped.put(key, new BankCategoryMappingDto(
                    existing.bankCategory(), existing.transactionType(), existing.categoryId(), false,
                    existing.rowCount() + 1, existing.sampleDescription()));
        }
    }

    private List<Transaction> findProvisionalCandidates(
            List<Transaction> provisional, Set<UUID> claimed, LocalDate date, BigDecimal amount, TransactionType type) {
        return provisional.stream()
                .filter(t -> !claimed.contains(t.getId()))
                .filter(t -> t.getType() == type)
                .filter(t -> t.getAmount().compareTo(amount) == 0)
                .filter(t -> Math.abs(ChronoUnit.DAYS.between(t.getOccurredOn(), date)) <= PROVISIONAL_MATCH_DAYS)
                .toList();
    }

    // La versione gia' contabilizzata di un movimento che nel file e' ancora
    // provvisorio: stesso importo, data vicina, e in archivio ci e' arrivata da
    // un import (le scritte a mano le guarda findManualDuplicate).
    private Optional<Transaction> settledVersion(
            List<Transaction> inRange, LocalDate date, BigDecimal amount, TransactionType type) {
        return inRange.stream()
                .filter(t -> t.getImportFingerprint() != null)
                .filter(t -> !Boolean.TRUE.equals(t.getImportProvisional()))
                .filter(t -> t.getType() == type)
                .filter(t -> t.getAmount().compareTo(amount) == 0)
                .filter(t -> Math.abs(ChronoUnit.DAYS.between(t.getOccurredOn(), date)) <= PROVISIONAL_MATCH_DAYS)
                .findFirst();
    }

    private Optional<Transaction> findManualDuplicate(
            List<Transaction> inRange, LocalDate date, BigDecimal amount, TransactionType type) {
        return inRange.stream()
                .filter(t -> t.getImportFingerprint() == null)
                // Le transazioni generate da una regola non sono scritte a mano: le guarda
                // findRecurringConflict, che lo dice nel messaggio. Da quando sono datate
                // alla scadenza reale cadono spesso lo stesso giorno e con lo stesso
                // importo della riga della banca, e questo controllo — che viene prima —
                // le avrebbe chiamate "scritte a mano".
                .filter(t -> t.getRecurringTransaction() == null)
                .filter(t -> t.getType() == type)
                .filter(t -> t.getOccurredOn().equals(date))
                .filter(t -> t.getAmount().compareTo(amount) == 0)
                .findFirst();
    }

    /** L'occorrenza di una regola di cui una riga prende il posto: già generata, o non ancora. */
    private record RecurringOccurrence(Transaction generated, RecurringTransaction rule) {
    }

    /**
     * La riga della banca è l'occorrenza di una regola ricorrente, e ne prende il posto.
     *
     * <p>Serve la <em>stessa categoria</em> della regola, e una data a pochi giorni dalla
     * sua scadenza: insieme sono un indizio forte, e allora l'importo non conta. È il
     * caso dello stipendio con il bonus — la regola dice 1.800, la banca accredita
     * 2.300 — che con un confronto sull'importo entrava come nuovo e si sommava alla
     * transazione della regola: due stipendi. Con indizi più deboli (categoria diversa
     * o sconosciuta) la riga non sostituisce niente da sola: findRecurringConflict la
     * segnala, e decide l'utente.
     *
     * <p>Prima le transazioni già generate dalla regola e non ancora sostituite (senza
     * impronta della banca): la riga le riscrive. Poi le regole non ancora scadute — lo
     * stipendio pagato il venerdì prima di un 27 di domenica: la riga entra al posto
     * dell'occorrenza, e la regola passa alla scadenza dopo. Fra più candidati, quello
     * con l'importo più vicino.
     */
    private RecurringOccurrence findRecurringOccurrence(
            List<Transaction> inRange, List<RecurringTransaction> rules, Set<UUID> claimed,
            LocalDate date, BigDecimal amount, TransactionType type, UUID rowCategoryId) {
        if (rowCategoryId == null) return null;

        Optional<Transaction> generated = inRange.stream()
                .filter(t -> t.getRecurringTransaction() != null)
                .filter(t -> t.getImportFingerprint() == null)
                .filter(t -> !claimed.contains(t.getId()))
                .filter(t -> t.getType() == type)
                .filter(t -> rowCategoryId.equals(t.getCategory().getId()))
                .filter(t -> Math.abs(ChronoUnit.DAYS.between(t.getOccurredOn(), date)) <= RECURRING_MATCH_DAYS)
                .min(Comparator.comparing(t -> t.getAmount().subtract(amount).abs()));
        if (generated.isPresent()) {
            return new RecurringOccurrence(generated.get(), null);
        }

        CategoryType categoryType = type == TransactionType.EXPENSE ? CategoryType.EXPENSE : CategoryType.INCOME;
        return rules.stream()
                .filter(r -> !claimed.contains(r.getId()))
                .filter(r -> r.getCategory().getType() == categoryType)
                .filter(r -> rowCategoryId.equals(r.getCategory().getId()))
                .filter(r -> Math.abs(ChronoUnit.DAYS.between(r.getNextDueDate(), date)) <= RECURRING_MATCH_DAYS)
                .min(Comparator.comparing(r -> r.getDefaultAmount().subtract(amount).abs()))
                .map(r -> new RecurringOccurrence(null, r))
                .orElse(null);
    }

    // Il rischio di contare due volte non nasce dall'esistere di una regola, ma
    // dalla transazione che la regola genera. Quindi si cerca prima quella; e in
    // mancanza, una regola cha sta per generarla. Guardare solo l'importo dentro
    // il periodo di validita' non basta: una regola mensile e' attiva tutti i
    // giorni dell'anno, e finirebbe per accostarsi a qualsiasi spesa di importo
    // simile (un bonifico da 87 euro alla "Bolletta luce" da 95).
    private String findRecurringConflict(
            List<Transaction> inRange, List<RecurringTransaction> rules,
            LocalDate date, BigDecimal amount, TransactionType type, UUID rowCategoryId) {
        Optional<Transaction> generated = inRange.stream()
                .filter(t -> t.getRecurringTransaction() != null)
                .filter(t -> t.getType() == type)
                .filter(t -> Math.abs(ChronoUnit.DAYS.between(t.getOccurredOn(), date)) <= RECURRING_MATCH_DAYS)
                .filter(t -> looksLikeRecurring(amount, rowCategoryId, t.getAmount(), t.getCategory().getId()))
                .findFirst();
        if (generated.isPresent()) {
            return "L'app l'ha gia' generata da una regola ricorrente: " + describeTransaction(generated.get());
        }

        CategoryType categoryType = type == TransactionType.EXPENSE ? CategoryType.EXPENSE : CategoryType.INCOME;
        return rules.stream()
                .filter(r -> r.getCategory().getType() == categoryType)
                .filter(r -> Math.abs(ChronoUnit.DAYS.between(r.getNextDueDate(), date)) <= RECURRING_MATCH_DAYS)
                .filter(r -> looksLikeRecurring(amount, rowCategoryId, r.getDefaultAmount(), r.getCategory().getId()))
                .findFirst()
                .map(r -> "Sta per generarla la regola ricorrente " + r.getName() + " · "
                        + r.getDefaultAmount() + " € del " + r.getNextDueDate())
                .orElse(null);
    }

    /**
     * Se una riga somiglia abbastanza a una ricorrente da poter essere la stessa spesa.
     *
     * <p>Quando la categoria della riga è già nota (la categoria della banca è
     * mappata) ed è <em>diversa</em> da quella della regola, il 20% di tolleranza è
     * troppo largo: su importi piccoli copre mezzo scaffale del supermercato. Una
     * spesa da 8,61 € da In's Mercato, categoria Supermercato, veniva accostata
     * all'abbonamento Apple TV da 9,99 € della stessa settimana (14% di scarto).
     * Con categorie diverse la tolleranza scende al 5%: un abbonamento fisso che la
     * banca classifica a modo suo viene ancora segnalato, la spesa che gli somiglia
     * no.
     *
     * <p>Non l'importo identico, come in una prima versione: chi scrive una regola
     * arrotonda ("Iliad Casa", 20,00 €) e la banca addebita il prezzo vero (19,99 €).
     * Con l'identità quel doppione vero passava, ed entrava due volte.
     *
     * <p>Con la stessa categoria, o con la riga ancora senza categoria, resta la
     * tolleranza piena: è il caso delle bollette, che variano di mese in mese.
     */
    private boolean looksLikeRecurring(
            BigDecimal amount, UUID rowCategoryId, BigDecimal reference, UUID recurringCategoryId) {
        if (rowCategoryId != null && !rowCategoryId.equals(recurringCategoryId)) {
            return withinTolerance(amount, reference, RECURRING_TOLERANCE_OTHER_CATEGORY);
        }
        return withinTolerance(amount, reference, RECURRING_TOLERANCE);
    }

    private boolean withinTolerance(BigDecimal amount, BigDecimal reference, BigDecimal tolerance) {
        if (reference == null || reference.signum() == 0) return false;
        return amount.subtract(reference).abs().compareTo(reference.multiply(tolerance)) <= 0;
    }

    private boolean matchesExclusion(BankStatementRow row, List<BankImportExclusion> exclusions) {
        String text = row.searchableText().toUpperCase(Locale.ITALIAN);
        return exclusions.stream().anyMatch(e -> text.contains(e.getPattern().toUpperCase(Locale.ITALIAN)));
    }

    private String describeTransaction(Transaction transaction) {
        return transaction.getOccurredOn() + " · " + transaction.getAmount() + " € · "
                + (transaction.getDescription() == null ? "(senza descrizione)" : transaction.getDescription());
    }

    // La banca lascia spazi in coda alle intestazioni e non e' coerente sulle
    // maiuscole: senza normalizzare, la stessa categoria genererebbe due
    // mappature diverse fra un export e l'altro.
    static String bankCategoryLabel(String bankCategory) {
        return bankCategory == null || bankCategory.isBlank() ? "(senza categoria)" : bankCategory.trim();
    }

    static String mappingKey(String bankCategory, TransactionType type) {
        return bankCategoryLabel(bankCategory).toLowerCase(Locale.ITALIAN) + "|" + type;
    }

    private BankImportSummary summarize(
            List<BankImportRowPreview> rows, int unmappedCount, LocalDate first, LocalDate last) {
        Map<BankImportOutcome, Long> byOutcome = rows.stream()
                .collect(Collectors.groupingBy(BankImportRowPreview::outcome, Collectors.counting()));
        return new BankImportSummary(
                rows.size(), first, last,
                count(byOutcome, BankImportOutcome.NUOVA),
                count(byOutcome, BankImportOutcome.GIA_IMPORTATA),
                // Le sostituzioni di una ricorrente aggiornano anche loro qualcosa che
                // c'è già (o che la regola avrebbe creato): stanno nello stesso conto.
                count(byOutcome, BankImportOutcome.AGGIORNA_PROVVISORIA)
                        + count(byOutcome, BankImportOutcome.SOSTITUISCE_RICORRENTE),
                count(byOutcome, BankImportOutcome.SOSPETTO_MANUALE),
                count(byOutcome, BankImportOutcome.SOSPETTO_RICORRENTE),
                count(byOutcome, BankImportOutcome.ESCLUSA),
                unmappedCount);
    }

    private int count(Map<BankImportOutcome, Long> counts, BankImportOutcome outcome) {
        return counts.getOrDefault(outcome, 0L).intValue();
    }
}
