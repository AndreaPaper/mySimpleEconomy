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
import org.springframework.dao.DataIntegrityViolationException;
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

    // readOnly per tenere aperta la sessione: CategoryResponse.from legge
    // category.getParent(), che è LAZY, e open-in-view è disattivato.
    @Transactional(readOnly = true)
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
                .parent(resolveParent(userId, request.parentId(), request.type()))
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

        if (request.parentId() != null) {
            if (request.parentId().equals(categoryId)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Una categoria non può essere sottocategoria di se stessa");
            }
            // Se ha già dei figli, agganciarla a un padre creerebbe un terzo
            // livello (nonno → padre → figlio), che non è supportato.
            if (categoryRepository.existsByParentId(categoryId)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Questa categoria ha già delle sottocategorie: non può diventare a sua volta una sottocategoria");
            }
        }

        category.setName(request.name());
        category.setColor(request.color());
        category.setIcon(request.icon());
        category.setParent(resolveParent(userId, request.parentId(), category.getType()));

        return CategoryResponse.from(category);
    }

    // Risolve e valida la categoria padre: deve appartenere all'utente, avere
    // lo stesso tipo (una spesa non può stare sotto un'entrata) e non essere
    // essa stessa una sottocategoria — la gerarchia è a un solo livello.
    private Category resolveParent(UUID userId, UUID parentId, CategoryType childType) {
        if (parentId == null) {
            return null;
        }

        Category parent = findOwned(userId, parentId);

        if (parent.getType() != childType) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "La sottocategoria deve essere dello stesso tipo della categoria padre");
        }
        if (parent.getParent() != null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Una sottocategoria non può contenere altre sottocategorie");
        }

        return parent;
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

    public List<CategoryResponse> listArchived(UUID userId) {
        return categoryRepository.findByUserIdAndArchivedTrue(userId).stream()
                .map(CategoryResponse::from)
                .toList();
    }

    @Transactional
    public void archive(UUID userId, UUID categoryId) {
        Category category = findOwned(userId, categoryId);
        category.setArchived(true);

        // Archiviando un padre si archiviano anche i suoi figli: altrimenti
        // ricomparirebbero in elenco come categorie principali, staccate dal
        // contesto che li spiegava.
        for (Category child : categoryRepository.findByParentId(categoryId)) {
            child.setArchived(true);
        }
    }

    // Speculare ad archive, ma la propagazione va nel verso opposto: archive
    // scende ai figli, unarchive risale al padre. Riattivare una sola
    // sottocategoria lasciando archiviata la principale la renderebbe
    // irraggiungibile — comparirebbe nei menu staccata dal contesto che la
    // spiega, esattamente il caso che archive() evita scendendo. I fratelli
    // restano archiviati: si riattiva quello che serve, non il ramo intero.
    @Transactional
    public void unarchive(UUID userId, UUID categoryId) {
        Category category = findOwned(userId, categoryId);
        category.setArchived(false);

        Category parent = category.getParent();
        if (parent != null && Boolean.TRUE.equals(parent.getArchived())) {
            parent.setArchived(false);
        }
    }

    // Eliminazione definitiva, distinta dall'archiviazione: possibile solo se
    // nessuna transazione/ricorrenza/debito/promemoria la referenzia ancora
    // (tutte le FK verso categories sono ON DELETE RESTRICT). Si prova la
    // delete e si intercetta il vincolo, invece di fare quattro query di
    // esistenza separate per ogni tabella collegata.
    @Transactional
    public void delete(UUID userId, UUID categoryId) {
        Category category = findOwned(userId, categoryId);

        try {
            categoryRepository.delete(category);
            categoryRepository.flush();
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Categoria in uso (sottocategorie, transazioni, ricorrenze, debiti o promemoria collegati): archiviala invece di eliminarla");
        }
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
