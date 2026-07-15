package com.spesetracker.service.excelimport;

import com.spesetracker.dto.excelimport.*;
import com.spesetracker.model.Category;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

// Trasforma i dati grezzi estratti da ExcelSheetParser in una proposta di importazione:
// raggruppa le righe "Fisse" per (nome, importo) attraverso i fogli - se compaiono in
// 2+ fogli sono un abbonamento ricorrente (una regola recurring_transaction), altrimenti
// sono un evento puntuale (transazione manuale, categoria da assegnare). Le righe "Non
// Fisse" sono già risolte per colore da ExcelSheetParser tramite la legenda del foglio.
@Service
@RequiredArgsConstructor
public class ExcelImportAnalysisService {

    private static final int MIN_SHEETS_FOR_RECURRING = 2;

    private final ExcelSheetParser parser;
    private final CategoryRepository categoryRepository;

    public ExcelImportPreviewResponse analyze(UUID userId, MultipartFile file) throws IOException {
        ParsedWorkbook parsed = parser.parse(file.getInputStream());

        List<Category> existingCategories = categoryRepository.findByUserIdAndArchivedFalse(userId);
        Map<String, UUID> existingByName = existingCategories.stream()
                .collect(Collectors.toMap(c -> c.getName().toLowerCase(Locale.ITALIAN), Category::getId, (a, b) -> a));

        Map<String, CategorySuggestion> newCategoriesByName = new LinkedHashMap<>();

        Map<String, YearMonth> sheetRepresentativeMonth = computeRepresentativeMonths(parsed.nonFisseRows());

        List<RecurringImportItem> recurringItems = new ArrayList<>();
        List<OneOffImportItem> oneOffItems = new ArrayList<>();

        groupFisseRows(parsed.fisseRows()).forEach((key, group) -> {
            long distinctSheets = group.stream().map(ParsedWorkbook.FisseRow::sheetName).distinct().count();

            if (distinctSheets >= MIN_SHEETS_FOR_RECURRING) {
                ParsedWorkbook.FisseRow representative = group.get(0);
                LocalDate anchor = group.stream()
                        .map(ParsedWorkbook.FisseRow::date)
                        .filter(Objects::nonNull)
                        .min(Comparator.naturalOrder())
                        .orElseGet(() -> fallbackAnchor(group, sheetRepresentativeMonth));

                String categoryName = guessRecurringCategoryName(representative.name());
                var categoryRef = resolveCategory(categoryName, CategoryType.EXPENSE, existingByName, newCategoriesByName);

                recurringItems.add(new RecurringImportItem(
                        representative.name(), representative.amount(), anchor, (int) distinctSheets,
                        categoryRef.existingId(), categoryRef.tempId()));
            } else {
                for (ParsedWorkbook.FisseRow row : group) {
                    oneOffItems.add(new OneOffImportItem(
                            row.date() != null ? row.date() : LocalDate.now(),
                            row.name(), row.amount(), true, null, null));
                }
            }
        });

        for (ParsedWorkbook.NonFisseRow row : parsed.nonFisseRows()) {
            if (row.matchedCategoryLabel() != null) {
                var categoryRef = resolveCategory(row.matchedCategoryLabel(), CategoryType.EXPENSE, existingByName, newCategoriesByName);
                oneOffItems.add(new OneOffImportItem(
                        row.date(), row.name(), row.amount(), false, categoryRef.existingId(), categoryRef.tempId()));
            } else {
                oneOffItems.add(new OneOffImportItem(row.date(), row.name(), row.amount(), true, null, null));
            }
        }

        // Saldo di inizio periodo + stipendio: per l'utente il "mese" parte il 27 del
        // mese precedente (giorno di arrivo dello stipendio). Un checkpoint per periodo
        // dà una cronologia molto più precisa del singolo valore del foglio "Stima".
        Map<LocalDate, BalanceCheckpointImportItem> checkpointsByDate = new LinkedHashMap<>();
        if (parsed.checkpointDate() != null) {
            checkpointsByDate.put(parsed.checkpointDate(),
                    new BalanceCheckpointImportItem(parsed.checkpointDate(), parsed.checkpointBalance()));
        }
        for (ParsedWorkbook.PeriodStart periodStart : parsed.periodStarts()) {
            if (periodStart.startBalance() != null) {
                checkpointsByDate.put(periodStart.date(),
                        new BalanceCheckpointImportItem(periodStart.date(), periodStart.startBalance()));
            }
            if (periodStart.salaryAmount() != null) {
                var categoryRef = resolveCategory("Stipendio", CategoryType.INCOME, existingByName, newCategoriesByName);
                oneOffItems.add(new OneOffImportItem(
                        periodStart.date(), "Stipendio", periodStart.salaryAmount(), false,
                        categoryRef.existingId(), categoryRef.tempId()));
            }
        }
        List<BalanceCheckpointImportItem> checkpoints = new ArrayList<>(checkpointsByDate.values());

        long itemsNeedingCategory = oneOffItems.stream().filter(OneOffImportItem::needsCategory).count();

        ImportSummary summary = new ImportSummary(
                parsed.sheetsProcessed(), recurringItems.size(), oneOffItems.size(),
                newCategoriesByName.size(), (int) itemsNeedingCategory, checkpoints.size());

        return new ExcelImportPreviewResponse(
                new ArrayList<>(newCategoriesByName.values()), recurringItems, oneOffItems, checkpoints, summary);
    }

    private Map<String, List<ParsedWorkbook.FisseRow>> groupFisseRows(List<ParsedWorkbook.FisseRow> rows) {
        Map<String, List<ParsedWorkbook.FisseRow>> groups = new LinkedHashMap<>();
        for (ParsedWorkbook.FisseRow row : rows) {
            String key = row.name().trim().toLowerCase(Locale.ITALIAN) + "|" + row.amount().toPlainString();
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(row);
        }
        return groups;
    }

    private LocalDate fallbackAnchor(List<ParsedWorkbook.FisseRow> group, Map<String, YearMonth> sheetRepresentativeMonth) {
        ParsedWorkbook.FisseRow earliestSheetRow = group.stream()
                .min(Comparator.comparingInt(ParsedWorkbook.FisseRow::sheetIndex))
                .orElseThrow();
        YearMonth month = sheetRepresentativeMonth.get(earliestSheetRow.sheetName());
        return (month != null ? month : YearMonth.now()).atDay(1);
    }

    private Map<String, YearMonth> computeRepresentativeMonths(List<ParsedWorkbook.NonFisseRow> nonFisseRows) {
        Map<String, Map<YearMonth, Long>> counts = nonFisseRows.stream()
                .collect(Collectors.groupingBy(
                        ParsedWorkbook.NonFisseRow::sheetName,
                        Collectors.groupingBy(r -> YearMonth.from(r.date()), Collectors.counting())));

        Map<String, YearMonth> result = new HashMap<>();
        counts.forEach((sheet, monthCounts) -> monthCounts.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .ifPresent(e -> result.put(sheet, e.getKey())));
        return result;
    }

    private String guessRecurringCategoryName(String itemName) {
        String lower = itemName.toLowerCase(Locale.ITALIAN);
        if (containsAny(lower, "spotify", "netflix", "disney", "apple tv", "prime video", "dazn")) {
            return "Abbonamenti";
        }
        if (containsAny(lower, "iliad", "vodafone", "wind", "fastweb", "tim")) {
            return "Utenze";
        }
        return "Fisso";
    }

    private boolean containsAny(String haystack, String... needles) {
        for (String needle : needles) {
            if (haystack.contains(needle)) return true;
        }
        return false;
    }

    private record CategoryRef(UUID existingId, String tempId) {
    }

    private CategoryRef resolveCategory(
            String categoryName, CategoryType type, Map<String, UUID> existingByName,
            Map<String, CategorySuggestion> newCategoriesByName) {
        String key = categoryName.trim().toLowerCase(Locale.ITALIAN);

        UUID existingId = existingByName.get(key);
        if (existingId != null) {
            return new CategoryRef(existingId, null);
        }

        CategorySuggestion suggestion = newCategoriesByName.computeIfAbsent(key,
                k -> new CategorySuggestion("new-" + k.replaceAll("[^a-z0-9]+", "-"), categoryName.trim(), type, null));
        return new CategoryRef(null, suggestion.tempId());
    }
}
