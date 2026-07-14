package com.spesetracker.repository;

import com.spesetracker.model.Category;
import com.spesetracker.model.enums.CategoryType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    List<Category> findByUserIdAndArchivedFalse(UUID userId);

    List<Category> findByUserIdAndTypeAndArchivedFalse(UUID userId, CategoryType type);

    boolean existsByUserIdAndNameIgnoreCase(UUID userId, String name);
}
