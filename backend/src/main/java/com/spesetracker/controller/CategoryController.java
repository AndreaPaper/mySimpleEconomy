package com.spesetracker.controller;

import com.spesetracker.dto.category.CategoryRequest;
import com.spesetracker.dto.category.CategoryResponse;
import com.spesetracker.dto.category.CategoryUpdateRequest;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.CategoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;

    @GetMapping
    public List<CategoryResponse> list(@AuthenticationPrincipal UserPrincipal principal) {
        return categoryService.list(principal.getId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CategoryResponse create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CategoryRequest request
    ) {
        return categoryService.create(principal.getId(), request);
    }

    @PostMapping("/generate-defaults")
    public List<CategoryResponse> generateDefaults(@AuthenticationPrincipal UserPrincipal principal) {
        return categoryService.generateDefaults(principal.getId());
    }

    @PutMapping("/{id}")
    public CategoryResponse update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody CategoryUpdateRequest request
    ) {
        return categoryService.update(principal.getId(), id, request);
    }

    @PostMapping("/{id}/archive")
    public void archive(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID id) {
        categoryService.archive(principal.getId(), id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID id) {
        categoryService.delete(principal.getId(), id);
    }
}
