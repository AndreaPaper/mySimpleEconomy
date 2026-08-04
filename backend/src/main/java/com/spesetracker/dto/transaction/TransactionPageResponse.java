package com.spesetracker.dto.transaction;

import java.util.List;

public record TransactionPageResponse(List<TransactionResponse> content, boolean hasNext) {
}
