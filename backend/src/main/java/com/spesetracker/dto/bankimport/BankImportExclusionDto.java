package com.spesetracker.dto.bankimport;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BankImportExclusionDto(
        @NotBlank @Size(max = 200) String pattern,
        @Size(max = 200) String note
) {
}
