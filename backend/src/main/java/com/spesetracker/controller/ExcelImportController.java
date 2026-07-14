package com.spesetracker.controller;

import com.spesetracker.dto.excelimport.ExcelImportCommitRequest;
import com.spesetracker.dto.excelimport.ExcelImportPreviewResponse;
import com.spesetracker.dto.excelimport.ExcelImportResult;
import com.spesetracker.security.UserPrincipal;
import com.spesetracker.service.excelimport.ExcelImportAnalysisService;
import com.spesetracker.service.excelimport.ExcelImportCommitService;
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

@RestController
@RequestMapping("/api/import/excel")
@RequiredArgsConstructor
public class ExcelImportController {

    private final ExcelImportAnalysisService analysisService;
    private final ExcelImportCommitService commitService;

    @PostMapping("/analyze")
    public ExcelImportPreviewResponse analyze(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("file") MultipartFile file
    ) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File mancante");
        }
        try {
            return analysisService.analyze(principal.getId(), file);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Impossibile leggere il file Excel", e);
        }
    }

    @PostMapping("/commit")
    public ExcelImportResult commit(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ExcelImportCommitRequest request
    ) {
        return commitService.commit(principal.getId(), request);
    }
}
