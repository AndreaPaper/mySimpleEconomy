package com.spesetracker.service.bankimport;

import com.spesetracker.dto.bankimport.BankCategoryMappingDto;
import com.spesetracker.model.Category;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

// La scorciatoia per chi non ha voglia di mappare: crea una categoria per ogni
// categoria della banca, con lo stesso nome, e restituisce le mappature gia'
// risolte. Chi preferisce ricondurle alle proprie categorie usa la schermata di
// mappatura e ignora questo pulsante.
@Service
@RequiredArgsConstructor
public class BankCategoryShortcutService {

    // Lunghezza della colonna categories.name.
    private static final int MAX_NAME_LENGTH = 100;

    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;
    private final SalaryCategoryResolver salaryResolver;

    @Transactional
    public List<BankCategoryMappingDto> createFromBankCategories(UUID userId, List<BankCategoryMappingDto> requested) {
        User user = userRepository.getReferenceById(userId);
        List<BankCategoryMappingDto> resolved = new ArrayList<>();

        for (BankCategoryMappingDto dto : requested) {
            // Chi ha gia' scelto a mano non va scavalcato.
            if (dto.isResolved()) {
                resolved.add(dto);
                continue;
            }

            String name = trimToColumn(BankImportAnalysisService.bankCategoryLabel(dto.bankCategory()));
            CategoryType type = dto.transactionType() == TransactionType.EXPENSE
                    ? CategoryType.EXPENSE
                    : CategoryType.INCOME;

            // Lo stipendio fa eccezione alla regola "una categoria per ogni
            // categoria della banca": il profilo ne ha gia' una, e crearne una
            // seconda col nome della banca ("Stipendi e pensioni" accanto a
            // "Stipendio") lascerebbe due categorie per la stessa cosa e il
            // calcolo del risparmio a cercare lo stipendio dove non sta.
            Category category = salaryResolver
                    .profileSalaryCategory(userId)
                    .filter(c -> salaryResolver.looksLikeSalary(dto.bankCategory(), dto.transactionType()))
                    // Se una categoria con quel nome esiste gia' la si riusa:
                    // ricrearla sarebbe comunque impedito dal vincolo di
                    // unicita' sul nome.
                    .orElseGet(() -> categoryRepository.findByUserIdAndNameIgnoreCase(userId, name)
                            .orElseGet(() -> categoryRepository.save(Category.builder()
                                    .user(user)
                                    .name(name)
                                    .type(type)
                                    .build())));

            resolved.add(new BankCategoryMappingDto(
                    dto.bankCategory(), dto.transactionType(), category.getId(), false,
                    dto.rowCount(), dto.sampleDescription()));
        }

        return resolved;
    }

    private String trimToColumn(String name) {
        return name.length() <= MAX_NAME_LENGTH ? name : name.substring(0, MAX_NAME_LENGTH);
    }
}
