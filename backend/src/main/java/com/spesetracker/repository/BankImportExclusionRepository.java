package com.spesetracker.repository;

import com.spesetracker.model.BankImportExclusion;
import com.spesetracker.model.enums.BankSource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BankImportExclusionRepository extends JpaRepository<BankImportExclusion, UUID> {

    List<BankImportExclusion> findByUserIdAndSource(UUID userId, BankSource source);

    void deleteByUserIdAndSource(UUID userId, BankSource source);
}
