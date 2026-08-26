package com.spesetracker.service.bankimport;

import com.spesetracker.dto.bankimport.BankCategoryMappingDto;
import com.spesetracker.dto.bankimport.BankImportCommitRequest;
import com.spesetracker.dto.bankimport.BankImportCommitRow;
import com.spesetracker.dto.bankimport.BankImportExclusionDto;
import com.spesetracker.dto.bankimport.BankImportResult;
import com.spesetracker.model.BankCategoryMapping;
import com.spesetracker.model.BankImportExclusion;
import com.spesetracker.model.Category;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.BankSource;
import com.spesetracker.repository.BankCategoryMappingRepository;
import com.spesetracker.repository.BankImportExclusionRepository;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.TransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
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
                if (!Boolean.TRUE.equals(existing.getImportProvisional())) {
                    // Solo le provvisorie si riscrivono. Se non lo e' piu',
                    // qualcuno l'ha gia' aggiornata: non la si tocca due volte.
                    skipped++;
                    continue;
                }
                existing.setOccurredOn(row.occurredOn());
                existing.setAmount(row.amount());
                existing.setDescription(row.description());
                existing.setImportFingerprint(fingerprint);
                existing.setImportProvisional(row.provisional());
                if (row.categoryId() != null) {
                    existing.setCategory(requireCategory(categories, row.categoryId()));
                }
                known.add(fingerprint);
                updated++;
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

        List<BankCategoryMapping> toSave = new ArrayList<>();
        for (BankCategoryMappingDto dto : mappings) {
            if (!dto.isResolved()) continue;
            toSave.add(BankCategoryMapping.builder()
                    .user(user)
                    .source(source)
                    .bankCategory(BankImportAnalysisService.bankCategoryLabel(dto.bankCategory()))
                    .transactionType(dto.transactionType())
                    .category(dto.doNotImport() ? null : requireCategory(categories, dto.categoryId()))
                    .build());
        }
        if (toSave.isEmpty()) return 0;

        mappingRepository.deleteByUserIdAndSource(userId, source);
        mappingRepository.flush();
        mappingRepository.saveAll(toSave);
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
