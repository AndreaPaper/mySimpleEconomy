package com.spesetracker.service.bankimport;

import com.spesetracker.dto.bankimport.BankCategoryMappingDto;
import com.spesetracker.dto.bankimport.BankImportCommitRequest;
import com.spesetracker.dto.bankimport.BankImportCommitRow;
import com.spesetracker.dto.bankimport.BankImportExclusionDto;
import com.spesetracker.dto.bankimport.BankImportResult;
import com.spesetracker.model.BankCategoryMapping;
import com.spesetracker.model.BankImportExclusion;
import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.BankSource;
import com.spesetracker.repository.BankCategoryMappingRepository;
import com.spesetracker.repository.BankImportExclusionRepository;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.TransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

// Applica le decisioni prese nell'anteprima. Tutto in una transazione: se una
// riga non passa la validazione non resta un import a meta'.
@Service
@RequiredArgsConstructor
public class BankImportCommitService {

    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;
    private final BankCategoryMappingRepository mappingRepository;
    private final BankImportExclusionRepository exclusionRepository;
    private final RecurringTransactionRepository recurringRepository;

    /** Una transazione generata da una regola, che nessuna riga della banca ha ancora riscritto. */
    private boolean isUnreplacedOccurrence(Transaction transaction) {
        return transaction.getRecurringTransaction() != null && transaction.getImportFingerprint() == null;
    }

    /**
     * Riscrive una transazione esistente con i dati veri della banca. Il collegamento
     * alla regola, se c'è, resta: è ancora la sua occorrenza, solo con l'importo e la
     * data veri, e così resta fuori dalla media delle spese variabili della previsione.
     */
    private void rewrite(Transaction existing, BankImportCommitRow row, String fingerprint,
                         BankSource source, Map<UUID, Category> categories) {
        existing.setOccurredOn(row.occurredOn());
        existing.setAmount(row.amount());
        existing.setDescription(row.description());
        existing.setImportSource(source);
        existing.setImportFingerprint(fingerprint);
        existing.setImportProvisional(row.provisional());
        if (row.categoryId() != null) {
            existing.setCategory(requireCategory(categories, row.categoryId()));
        }
    }

    @Transactional
    public BankImportResult commit(UUID userId, BankImportCommitRequest request) {
        User user = userRepository.getReferenceById(userId);
        BankSource source = request.source();

        Map<UUID, Category> categories = new HashMap<>();
        for (Category category : categoryRepository.findByUserIdAndArchivedFalse(userId)) {
            categories.put(category.getId(), category);
        }

        // Le impronte gia' in archivio: il browser potrebbe rimandare indietro
        // una riga gia' importata (doppio invio, pagina riaperta), e senza questo
        // controllo passerebbe l'indice unico e fallirebbe l'intero import.
        Set<String> known = new HashSet<>(transactionRepository.findImportFingerprints(userId));

        int imported = 0;
        int updated = 0;
        int skipped = 0;

        for (BankImportCommitRow row : request.rows()) {
            // Il fingerprint si ricalcola qui dai campi grezzi: quello arrivato
            // dal browser non e' una fonte attendibile.
            String fingerprint = BankFingerprints.of(
                    row.occurredOn(), signedAmount(row), row.rawOperation(), row.rawDetails());

            if (row.updateTransactionId() != null) {
                Transaction existing = transactionRepository.findById(row.updateTransactionId())
                        .filter(t -> t.getUser().getId().equals(userId))
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.BAD_REQUEST, "Transazione da aggiornare non trovata"));
                if (!Boolean.TRUE.equals(existing.getImportProvisional()) && !isUnreplacedOccurrence(existing)) {
                    // Si riscrivono solo le provvisorie e le transazioni generate da una
                    // regola non ancora sostituite. Se non lo sono più, qualcuno le ha
                    // già aggiornate: non le si tocca due volte.
                    skipped++;
                    continue;
                }
                rewrite(existing, row, fingerprint, source, categories);
                known.add(fingerprint);
                updated++;
                continue;
            }

            if (row.recurringTransactionId() != null) {
                if (known.contains(fingerprint)) {
                    skipped++;
                    continue;
                }
                RecurringTransaction rule = recurringRepository.findById(row.recurringTransactionId())
                        .filter(r -> r.getUser().getId().equals(userId))
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.BAD_REQUEST, "Regola ricorrente non trovata"));
                // Fra l'anteprima e la conferma il job può aver generato l'occorrenza
                // (un'anteprima aperta il 26, confermata il 27): allora la si riscrive,
                // invece di affiancarle la riga della banca.
                Optional<Transaction> generatedMeanwhile = transactionRepository
                        .findByUserIdAndOccurredOnBetween(userId,
                                row.occurredOn().minusDays(BankImportAnalysisService.RECURRING_MATCH_DAYS),
                                row.occurredOn().plusDays(BankImportAnalysisService.RECURRING_MATCH_DAYS))
                        .stream()
                        .filter(t -> t.getRecurringTransaction() != null
                                && t.getRecurringTransaction().getId().equals(rule.getId()))
                        .filter(this::isUnreplacedOccurrence)
                        .findFirst();
                if (generatedMeanwhile.isPresent()) {
                    rewrite(generatedMeanwhile.get(), row, fingerprint, source, categories);
                    known.add(fingerprint);
                    updated++;
                    continue;
                }

                transactionRepository.save(Transaction.builder()
                        .user(user)
                        .category(row.categoryId() != null ? requireCategory(categories, row.categoryId()) : rule.getCategory())
                        .recurringTransaction(rule)
                        .amount(row.amount())
                        .type(row.type())
                        .occurredOn(row.occurredOn())
                        .description(row.description())
                        .importSource(source)
                        .importFingerprint(fingerprint)
                        .importProvisional(row.provisional())
                        .build());
                // La regola passa alla scadenza dopo, così il job non genera la stessa
                // occorrenza una seconda volta. Solo se la scadenza è ancora quella
                // accanto alla riga: se nel frattempo il job l'ha già fatta avanzare,
                // farla avanzare ancora salterebbe la scadenza del mese dopo. (Un invio
                // ripetuto della stessa riga non arriva qui: lo ferma l'impronta.)
                if (Math.abs(ChronoUnit.DAYS.between(rule.getNextDueDate(), row.occurredOn()))
                        <= BankImportAnalysisService.RECURRING_MATCH_DAYS) {
                    rule.advanceNextDueDate();
                }
                known.add(fingerprint);
                imported++;
                continue;
            }

            if (known.contains(fingerprint)) {
                skipped++;
                continue;
            }
            if (row.categoryId() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Manca la categoria per il movimento del " + row.occurredOn());
            }

            transactionRepository.save(Transaction.builder()
                    .user(user)
                    .category(requireCategory(categories, row.categoryId()))
                    .amount(row.amount())
                    .type(row.type())
                    .occurredOn(row.occurredOn())
                    .description(row.description())
                    .importSource(source)
                    .importFingerprint(fingerprint)
                    .importProvisional(row.provisional())
                    .build());
            known.add(fingerprint);
            imported++;
        }

        int savedMappings = saveMappings(userId, user, source, request.mappings(), categories);
        int savedExclusions = saveExclusions(userId, user, source, request.exclusions());

        return new BankImportResult(imported, updated, skipped, savedMappings, savedExclusions);
    }

    // L'importo torna al segno della banca prima di essere ridotto a impronta,
    // perche' e' cosi' che l'ha calcolato l'analisi.
    private java.math.BigDecimal signedAmount(BankImportCommitRow row) {
        return row.type() == com.spesetracker.model.enums.TransactionType.EXPENSE
                ? row.amount().negate()
                : row.amount();
    }

    private Category requireCategory(Map<UUID, Category> categories, UUID categoryId) {
        Category category = categories.get(categoryId);
        if (category == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Categoria non trovata: " + categoryId);
        }
        return category;
    }

    // Le mappature si riscrivono per intero: la schermata le manda tutte, e
    // sostituirle e' piu' semplice e piu' prevedibile che riconciliarle.
    private int saveMappings(
            UUID userId, User user, BankSource source,
            List<BankCategoryMappingDto> mappings, Map<UUID, Category> categories) {
        if (mappings.isEmpty()) return 0;

        // Si aggiornano solo le corrispondenze di questo import e si lasciano le altre.
        // Prima le si cancellava tutte e si salvavano solo queste — ma il frontend manda
        // solo le categorie della banca che l'analisi non conosceva ancora, quindi ogni
        // import buttava via quelle decise negli import precedenti, e l'app tornava a
        // chiederle ("dagli import successivi non te lo chiederò più" era falso).
        Map<String, BankCategoryMapping> existing = new HashMap<>();
        for (BankCategoryMapping m : mappingRepository.findByUserIdAndSource(userId, source)) {
            existing.put(BankImportAnalysisService.mappingKey(m.getBankCategory(), m.getTransactionType()), m);
        }

        Map<String, BankCategoryMapping> toSave = new LinkedHashMap<>();
        for (BankCategoryMappingDto dto : mappings) {
            if (!dto.isResolved()) continue;
            String label = BankImportAnalysisService.bankCategoryLabel(dto.bankCategory());
            String key = BankImportAnalysisService.mappingKey(label, dto.transactionType());
            BankCategoryMapping mapping = existing.getOrDefault(key, BankCategoryMapping.builder()
                    .user(user)
                    .source(source)
                    .bankCategory(label)
                    .transactionType(dto.transactionType())
                    .build());
            mapping.setCategory(dto.doNotImport() ? null : requireCategory(categories, dto.categoryId()));
            toSave.put(key, mapping);
        }
        if (toSave.isEmpty()) return 0;

        mappingRepository.saveAll(toSave.values());
        return toSave.size();
    }

    private int saveExclusions(UUID userId, User user, BankSource source, List<BankImportExclusionDto> exclusions) {
        if (exclusions.isEmpty()) return 0;

        List<BankImportExclusion> toSave = exclusions.stream()
                .filter(dto -> dto.pattern() != null && !dto.pattern().isBlank())
                .map(dto -> BankImportExclusion.builder()
                        .user(user)
                        .source(source)
                        .pattern(dto.pattern().trim())
                        .note(dto.note())
                        .build())
                .toList();
        if (toSave.isEmpty()) return 0;

        exclusionRepository.deleteByUserIdAndSource(userId, source);
        exclusionRepository.flush();
        exclusionRepository.saveAll(toSave);
        return toSave.size();
    }
}
