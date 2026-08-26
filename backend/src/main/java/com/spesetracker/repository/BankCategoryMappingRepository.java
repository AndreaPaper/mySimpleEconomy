package com.spesetracker.repository;

import com.spesetracker.model.BankCategoryMapping;
import com.spesetracker.model.enums.BankSource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BankCategoryMappingRepository extends JpaRepository<BankCategoryMapping, UUID> {

    List<BankCategoryMapping> findByUserIdAndSource(UUID userId, BankSource source);

    void deleteByUserIdAndSource(UUID userId, BankSource source);
}
