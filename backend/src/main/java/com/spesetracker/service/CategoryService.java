package com.spesetracker.service;

import com.spesetracker.dto.category.CategoryRequest;
import com.spesetracker.dto.category.CategoryResponse;
import com.spesetracker.dto.category.CategoryUpdateRequest;
import com.spesetracker.model.Category;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CategoryService {

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
