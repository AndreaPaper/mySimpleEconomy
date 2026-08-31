package com.spesetracker.controller;

import com.spesetracker.dto.bankimport.BankCategoryMappingDto;
import com.spesetracker.dto.bankimport.BankImportCommitRequest;
import com.spesetracker.dto.bankimport.BankImportPreviewResponse;
import com.spesetracker.dto.bankimport.BankImportResult;
import com.spesetracker.model.enums.BankSource;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.bankimport.BankCategoryShortcutService;
import com.spesetracker.service.bankimport.BankImportAnalysisService;
import com.spesetracker.service.bankimport.BankImportCommitService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/import/bank")
@RequiredArgsConstructor
public class BankImportController {

    private final BankImportAnalysisService analysisService;
    private final BankImportCommitService commitService;
    private final BankCategoryShortcutService shortcutService;

    @PostMapping("/analyze")
    public BankImportPreviewResponse analyze(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("source") BankSource source,
            @RequestParam("file") MultipartFile file
    ) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File mancante");
        }
        try {
            return analysisService.analyze(principal.getId(), source, file);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Impossibile leggere il file Excel", e);
        }
    }

    @PostMapping("/commit")
    public BankImportResult commit(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BankImportCommitRequest request
    ) {
        return commitService.commit(principal.getId(), request);
    }

    // Crea in blocco le categorie con i nomi della banca e restituisce le
    // mappature risolte, pronte da rimandare indietro col commit.
    @PostMapping("/categories/from-bank")
    public List<BankCategoryMappingDto> createCategoriesFromBank(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody List<BankCategoryMappingDto> mappings
    ) {
        return shortcutService.createFromBankCategories(principal.getId(), mappings);
    }
}
