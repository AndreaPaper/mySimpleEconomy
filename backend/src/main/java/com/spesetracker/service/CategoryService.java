package com.spesetracker.service;

import com.spesetracker.dto.category.CategoryRequest;
import com.spesetracker.dto.category.CategoryResponse;
import com.spesetracker.dto.category.CategoryUpdateRequest;
import com.spesetracker.model.Category;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CategoryService {

    // Set curato per chi non ha voglia di creare le categorie una per una:
    // colori dalla palette fissa (frontend/src/constants/colors.ts) e icone
    // valide del set fisso (frontend/src/constants/icons.ts), per restare
    // visivamente coerenti col resto dell'app.
    private record DefaultCategory(String name, CategoryType type, String color, String icon) {
    }

    private static final List<DefaultCategory> DEFAULT_CATEGORIES = List.of(
            new DefaultCategory("Alimentari", CategoryType.EXPENSE, "#22C55E", "ShoppingCart"),
            new DefaultCategory("Casa", CategoryType.EXPENSE, "#F59E0B", "Home"),
            new DefaultCategory("Bollette", CategoryType.EXPENSE, "#EAB308", "Zap"),
            new DefaultCategory("Trasporti", CategoryType.EXPENSE, "#3B82F6", "Car"),
            new DefaultCategory("Salute", CategoryType.EXPENSE, "#EF4444", "HeartPulse"),
            new DefaultCategory("Ristoranti", CategoryType.EXPENSE, "#F97316", "UtensilsCrossed"),
            new DefaultCategory("Svago", CategoryType.EXPENSE, "#A855F7", "Gamepad2"),
            new DefaultCategory("Abbigliamento", CategoryType.EXPENSE, "#EC4899", "Shirt"),
            new DefaultCategory("Istruzione", CategoryType.EXPENSE, "#06B6D4", "GraduationCap"),
            new DefaultCategory("Altre spese", CategoryType.EXPENSE, "#64748B", "Package"),
            new DefaultCategory("Stipendio", CategoryType.INCOME, "#10B981", "Wallet"),
            new DefaultCategory("Regali", CategoryType.INCOME, "#D946EF", "Gift"),
            new DefaultCategory("Investimenti", CategoryType.INCOME, "#14B8A6", "TrendingUp"),
            new DefaultCategory("Altre entrate", CategoryType.INCOME, "#84CC16", "HandCoins")
    );

    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;

    public List<CategoryResponse> list(UUID userId) {
        return categoryRepository.findByUserIdAndArchivedFalse(userId).stream()
                .map(CategoryResponse::from)
                .toList();
    }

    @Transactional
    public CategoryResponse create(UUID userId, CategoryRequest request) {
        if (categoryRepository.existsByUserIdAndNameIgnoreCase(userId, request.name())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esiste già una categoria con questo nome");
        }

        Category category = Category.builder()
                .user(userRepository.getReferenceById(userId))
                .name(request.name())
                .type(request.type())
                .color(request.color())
                .icon(request.icon())
                .build();

        return CategoryResponse.from(categoryRepository.save(category));
    }

    @Transactional
    public CategoryResponse update(UUID userId, UUID categoryId, CategoryUpdateRequest request) {
        Category category = findOwned(userId, categoryId);

        if (!category.getName().equalsIgnoreCase(request.name())
                && categoryRepository.existsByUserIdAndNameIgnoreCase(userId, request.name())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esiste già una categoria con questo nome");
        }

        category.setName(request.name());
        category.setColor(request.color());
        category.setIcon(request.icon());

        return CategoryResponse.from(category);
    }

    // Find-or-create per nome (come ExcelImportCommitService.createCategories):
    // salta silenziosamente le categorie già presenti invece di fallire con
    // il 409 che lancerebbe create() su un nome duplicato.
    @Transactional
    public List<CategoryResponse> generateDefaults(UUID userId) {
        User user = userRepository.getReferenceById(userId);
        List<CategoryResponse> created = new ArrayList<>();

        for (DefaultCategory defaultCategory : DEFAULT_CATEGORIES) {
            if (categoryRepository.existsByUserIdAndNameIgnoreCase(userId, defaultCategory.name())) {
                continue;
            }

            Category category = Category.builder()
                    .user(user)
                    .name(defaultCategory.name())
                    .type(defaultCategory.type())
                    .color(defaultCategory.color())
                    .icon(defaultCategory.icon())
                    .build();

            created.add(CategoryResponse.from(categoryRepository.save(category)));
        }

        return created;
    }

    @Transactional
    public void archive(UUID userId, UUID categoryId) {
        Category category = findOwned(userId, categoryId);
        category.setArchived(true);
    }

    private Category findOwned(UUID userId, UUID categoryId) {
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria non trovata"));

        if (!category.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria non trovata");
        }

        return category;
    }
}
