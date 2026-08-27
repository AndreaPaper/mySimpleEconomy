package com.spesetracker.service;

import com.spesetracker.dto.debt.DebtResponse;
import com.spesetracker.model.BalanceCheckpoint;
import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.Transaction;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.IntervalUnit;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.BalanceCheckpointRepository;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.TransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

// Esporta le transazioni in un .xlsx: un backup, e la via di fuga verso
// un'analisi a mano in Excel.
//
// I fogli seguono i periodi da stipendio a stipendio, non i mesi di calendario,
// perche' e' cosi' che ragionano Dashboard, Risparmio e Budget: con i mesi
// solari il file avrebbe raccontato numeri diversi dall'app sugli stessi dati.
@Service
@RequiredArgsConstructor
public class ExcelExportService {

    private static final LocalDate DEFAULT_FROM = LocalDate.of(1970, 1, 1);
    private static final String[] TRANSACTION_HEADERS =
            {"Data", "Categoria", "Tipo", "Ricorrente", "Importo", "Descrizione"};
    private static final DateTimeFormatter SHEET_NAME_FORMAT =
            DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ITALIAN);
    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;
    private final RecurringTransactionRepository recurringRepository;
    private final BalanceCheckpointRepository checkpointRepository;
    private final UserRepository userRepository;
    private final DebtService debtService;

    @Transactional(readOnly = true)
    public byte[] export(UUID userId, LocalDate from, LocalDate to, UUID categoryId) {
        LocalDate effectiveFrom = from != null ? from : DEFAULT_FROM;
        LocalDate effectiveTo = to != null ? to : LocalDate.now();

        List<Transaction> transactions = (categoryId != null
                ? transactionRepository.findByUserIdAndCategoryIdAndOccurredOnBetween(
                        userId, categoryId, effectiveFrom, effectiveTo)
                : transactionRepository.findByUserIdAndOccurredOnBetween(userId, effectiveFrom, effectiveTo))
                .stream()
                .sorted(Comparator.comparing(Transaction::getOccurredOn))
                .toList();

        User user = userRepository.getReferenceById(userId);
        Integer salaryDay = SalaryPeriods.of(user.getSalaryDay());
        boolean savingsOn = Boolean.TRUE.equals(user.getSavingsEnabled()) && user.getSavingsPercent() != null;
        BigDecimal savingsPercent = savingsOn
                ? BigDecimal.valueOf(user.getSavingsPercent())
                : BigDecimal.ZERO;

        Map<YearMonth, List<Transaction>> byPeriod = new TreeMap<>();
        for (Transaction t : transactions) {
            byPeriod.computeIfAbsent(SalaryPeriods.periodOf(t.getOccurredOn(), salaryDay), k -> new ArrayList<>())
                    .add(t);
        }

        String filterNote = describeFilters(from, to, categoryId, transactions);

        try (Workbook workbook = new XSSFWorkbook()) {
            ExcelExportStyles styles = new ExcelExportStyles(workbook);

            writeSummarySheet(workbook, styles, byPeriod, salaryDay, filterNote);
            for (Map.Entry<YearMonth, List<Transaction>> entry : byPeriod.entrySet()) {
                writePeriodSheet(workbook, styles, entry.getKey(), entry.getValue(), salaryDay,
                        savingsOn, savingsPercent);
            }
            writeCategoriesSheet(workbook, styles, transactions);
            writeRecurringAndDebtsSheet(workbook, styles, userId);
            writeBalanceTrendSheet(workbook, styles, byPeriod, salaryDay, userId);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    // ------------------------------------------------------------------
    // Riepilogo
    // ------------------------------------------------------------------

    private void writeSummarySheet(
            Workbook workbook, ExcelExportStyles styles,
            Map<YearMonth, List<Transaction>> byPeriod, Integer salaryDay, String filterNote) {
        Sheet sheet = workbook.createSheet("Riepilogo");
        int rowIndex = 0;

        rowIndex = writeTitle(sheet, styles, rowIndex, "Riepilogo per periodo");
        if (filterNote != null) {
            Cell noteCell = sheet.createRow(rowIndex++).createCell(0);
            noteCell.setCellValue(filterNote);
            noteCell.setCellStyle(styles.note);
        }
        rowIndex++;

        int headerRow = rowIndex;
        writeHeader(sheet, styles, rowIndex++, "Periodo", "Dal", "Al", "Entrate", "Uscite", "Netto", "Transazioni");

        BigDecimal totalIncome = BigDecimal.ZERO;
        BigDecimal totalExpense = BigDecimal.ZERO;

        for (Map.Entry<YearMonth, List<Transaction>> entry : byPeriod.entrySet()) {
            BigDecimal income = sumByType(entry.getValue(), TransactionType.INCOME);
            BigDecimal expense = sumByType(entry.getValue(), TransactionType.EXPENSE);
            totalIncome = totalIncome.add(income);
            totalExpense = totalExpense.add(expense);

            Row row = sheet.createRow(rowIndex++);
            row.createCell(0).setCellValue(sheetName(entry.getKey()));
            writeDate(row.createCell(1), SalaryPeriods.periodStart(entry.getKey(), salaryDay), styles);
            writeDate(row.createCell(2), SalaryPeriods.periodEnd(entry.getKey(), salaryDay), styles);
            writeCurrency(row.createCell(3), income, styles.currency);
            writeCurrency(row.createCell(4), expense.negate(), styles.currency);
            writeCurrency(row.createCell(5), income.subtract(expense), styles.currency);
            row.createCell(6).setCellValue(entry.getValue().size());
        }

        Row total = sheet.createRow(rowIndex);
        Cell totalLabel = total.createCell(0);
        totalLabel.setCellValue("Totale");
        totalLabel.setCellStyle(styles.bold);
        writeCurrency(total.createCell(3), totalIncome, styles.boldCurrency);
        writeCurrency(total.createCell(4), totalExpense.negate(), styles.boldCurrency);
        writeCurrency(total.createCell(5), totalIncome.subtract(totalExpense), styles.boldCurrency);

        sheet.createFreezePane(0, headerRow + 1);
        autoSize(sheet, 7);
    }

    // ------------------------------------------------------------------
    // Un foglio per periodo
    // ------------------------------------------------------------------

    private void writePeriodSheet(
            Workbook workbook, ExcelExportStyles styles, YearMonth period, List<Transaction> transactions,
            Integer salaryDay, boolean savingsOn, BigDecimal savingsPercent) {
        Sheet sheet = workbook.createSheet(sheetName(period));
        LocalDate start = SalaryPeriods.periodStart(period, salaryDay);
        LocalDate end = SalaryPeriods.periodEnd(period, salaryDay);

        int rowIndex = writeTitle(sheet, styles, 0,
                sheetName(period) + " · dal " + DAY_FORMAT.format(start) + " al " + DAY_FORMAT.format(end));
        rowIndex++;

        BigDecimal income = sumByType(transactions, TransactionType.INCOME);
        BigDecimal expense = sumByType(transactions, TransactionType.EXPENSE);
        BigDecimal net = income.subtract(expense);

        rowIndex = writeKeyValue(sheet, styles, rowIndex, "Entrate", income);
        rowIndex = writeKeyValue(sheet, styles, rowIndex, "Uscite", expense.negate());
        // "Risparmiato" e "netto" sono lo stesso numero nel modello dell'app
        // (quel che resta fra entrate e uscite): una riga sola, chiamata come
        // la chiama la Dashboard, invece di due che sembrano cose diverse.
        rowIndex = writeKeyValue(sheet, styles, rowIndex, "Risparmiato (entrate − uscite)", net);

        if (savingsOn) {
            BigDecimal goal = income.multiply(savingsPercent).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            rowIndex = writeKeyValue(sheet, styles, rowIndex,
                    "Obiettivo del periodo (" + savingsPercent.stripTrailingZeros().toPlainString() + "% delle entrate)",
                    goal);
            rowIndex = writeKeyValue(sheet, styles, rowIndex, "Scarto dall'obiettivo", net.subtract(goal));
        }

        rowIndex++;
        int headerRow = rowIndex;
        writeHeader(sheet, styles, rowIndex++, TRANSACTION_HEADERS);

        for (Transaction t : transactions) {
            Row row = sheet.createRow(rowIndex++);
            writeDate(row.createCell(0), t.getOccurredOn(), styles);
            row.createCell(1).setCellValue(categoryPath(t.getCategory()));
            row.createCell(2).setCellValue(typeLabel(t.getType()));
            row.createCell(3).setCellValue(t.getRecurringTransaction() != null ? "Sì" : "No");
            // Con il segno la colonna si somma: selezionandola Excel mostra il
            // netto, e le tabelle pivot funzionano senza girare i valori a mano.
            writeCurrency(row.createCell(4), signed(t), styles.currency);
            row.createCell(5).setCellValue(t.getDescription() != null ? t.getDescription() : "");
        }
        int lastTransactionRow = rowIndex - 1;

        rowIndex++;
        rowIndex = writeCategoryTotals(sheet, styles, rowIndex, transactions, TransactionType.EXPENSE,
                "Totali per categoria — Uscite");
        rowIndex++;
        writeCategoryTotals(sheet, styles, rowIndex, transactions, TransactionType.INCOME,
                "Totali per categoria — Entrate");

        sheet.createFreezePane(0, headerRow + 1);
        if (lastTransactionRow > headerRow) {
            sheet.setAutoFilter(new CellRangeAddress(
                    headerRow, lastTransactionRow, 0, TRANSACTION_HEADERS.length - 1));
        }
        autoSize(sheet, TRANSACTION_HEADERS.length);
    }

    private int writeCategoryTotals(
            Sheet sheet, ExcelExportStyles styles, int rowIndex,
            List<Transaction> transactions, TransactionType type, String heading) {
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        for (Transaction t : transactions) {
            if (t.getType() != type) continue;
            totals.merge(categoryPath(t.getCategory()), t.getAmount(), BigDecimal::add);
        }
        if (totals.isEmpty()) return rowIndex;

        Cell headingCell = sheet.createRow(rowIndex++).createCell(0);
        headingCell.setCellValue(heading);
        headingCell.setCellStyle(styles.bold);

        List<Map.Entry<String, BigDecimal>> sorted = new ArrayList<>(totals.entrySet());
        sorted.sort(Map.Entry.<String, BigDecimal>comparingByValue().reversed());
        for (Map.Entry<String, BigDecimal> entry : sorted) {
            Row row = sheet.createRow(rowIndex++);
            row.createCell(0).setCellValue(entry.getKey());
            writeCurrency(row.createCell(1),
                    type == TransactionType.EXPENSE ? entry.getValue().negate() : entry.getValue(), styles.currency);
        }
        return rowIndex;
    }

    // ------------------------------------------------------------------
    // Categorie
    // ------------------------------------------------------------------

    private void writeCategoriesSheet(Workbook workbook, ExcelExportStyles styles, List<Transaction> transactions) {
        Sheet sheet = workbook.createSheet("Categorie");
        int rowIndex = writeTitle(sheet, styles, 0, "Totali per categoria su tutto l'esportato");
        rowIndex++;

        for (TransactionType type : List.of(TransactionType.EXPENSE, TransactionType.INCOME)) {
            rowIndex = writeCategoryTree(sheet, styles, rowIndex, transactions, type);
            rowIndex++;
        }

        sheet.createFreezePane(0, 2);
        autoSize(sheet, 4);
    }

    // Una riga per categoria principale col totale che comprende le sue
    // sottocategorie, poi le sottocategorie rientrate: la gerarchia si perde se
    // si elenca solo il nome finale, ed e' quella che serve per raggruppare.
    private int writeCategoryTree(
            Sheet sheet, ExcelExportStyles styles, int rowIndex,
            List<Transaction> transactions, TransactionType type) {
        Map<String, BigDecimal> byLeaf = new LinkedHashMap<>();
        Map<String, Integer> countByLeaf = new LinkedHashMap<>();
        Map<String, String> parentOfLeaf = new LinkedHashMap<>();

        for (Transaction t : transactions) {
            if (t.getType() != type) continue;
            Category category = t.getCategory();
            String leaf = category.getName();
            byLeaf.merge(leaf, t.getAmount(), BigDecimal::add);
            countByLeaf.merge(leaf, 1, Integer::sum);
            parentOfLeaf.putIfAbsent(leaf,
                    category.getParent() != null ? category.getParent().getName() : leaf);
        }
        if (byLeaf.isEmpty()) return rowIndex;

        Cell heading = sheet.createRow(rowIndex++).createCell(0);
        heading.setCellValue(type == TransactionType.EXPENSE ? "Uscite" : "Entrate");
        heading.setCellStyle(styles.title);

        writeHeader(sheet, styles, rowIndex++, "Categoria", "Sottocategoria", "Totale", "Transazioni");

        Map<String, BigDecimal> byParent = new LinkedHashMap<>();
        for (Map.Entry<String, BigDecimal> entry : byLeaf.entrySet()) {
            byParent.merge(parentOfLeaf.get(entry.getKey()), entry.getValue(), BigDecimal::add);
        }

        List<String> parents = new ArrayList<>(byParent.keySet());
        parents.sort(Comparator.comparing(byParent::get).reversed());

        for (String parent : parents) {
            Row row = sheet.createRow(rowIndex++);
            Cell nameCell = row.createCell(0);
            nameCell.setCellValue(parent);
            nameCell.setCellStyle(styles.bold);
            writeCurrency(row.createCell(2), signedTotal(byParent.get(parent), type), styles.boldCurrency);

            List<String> children = byLeaf.keySet().stream()
                    .filter(leaf -> parentOfLeaf.get(leaf).equals(parent) && !leaf.equals(parent))
                    .sorted(Comparator.comparing(byLeaf::get).reversed())
                    .toList();
            for (String child : children) {
                Row childRow = sheet.createRow(rowIndex++);
                childRow.createCell(1).setCellValue(child);
                writeCurrency(childRow.createCell(2), signedTotal(byLeaf.get(child), type), styles.currency);
                childRow.createCell(3).setCellValue(countByLeaf.get(child));
            }
            if (byLeaf.containsKey(parent)) {
                row.createCell(3).setCellValue(countByLeaf.get(parent));
            }
        }
        return rowIndex;
    }

    // ------------------------------------------------------------------
    // Ricorrenti e debiti
    // ------------------------------------------------------------------

    private void writeRecurringAndDebtsSheet(Workbook workbook, ExcelExportStyles styles, UUID userId) {
        Sheet sheet = workbook.createSheet("Ricorrenti e debiti");
        int rowIndex = writeTitle(sheet, styles, 0, "Regole ricorrenti attive");

        List<RecurringTransaction> recurring = recurringRepository.findByUserIdAndActiveTrue(userId);
        if (recurring.isEmpty()) {
            rowIndex = writeNote(sheet, styles, rowIndex, "Nessuna regola ricorrente attiva.");
        } else {
            writeHeader(sheet, styles, rowIndex++, "Nome", "Categoria", "Importo", "Cadenza", "Prossima scadenza");
            for (RecurringTransaction rule : recurring) {
                Row row = sheet.createRow(rowIndex++);
                row.createCell(0).setCellValue(rule.getName());
                row.createCell(1).setCellValue(categoryPath(rule.getCategory()));
                writeCurrency(row.createCell(2), rule.getDefaultAmount(), styles.currency);
                row.createCell(3).setCellValue(cadence(rule.getIntervalValue(), rule.getIntervalUnit()));
                writeDate(row.createCell(4), rule.getNextDueDate(), styles);
            }
        }

        rowIndex += 2;
        rowIndex = writeTitle(sheet, styles, rowIndex, "Debiti e finanziamenti");

        List<DebtResponse> debts = debtService.list(userId);
        if (debts.isEmpty()) {
            writeNote(sheet, styles, rowIndex, "Nessun debito registrato.");
        } else {
            writeHeader(sheet, styles, rowIndex++, "Nome", "Categoria", "Totale", "Pagato", "Residuo", "Rata mensile");
            for (DebtResponse debt : debts) {
                Row row = sheet.createRow(rowIndex++);
                row.createCell(0).setCellValue(debt.name());
                row.createCell(1).setCellValue(debt.categoryName());
                writeCurrency(row.createCell(2), debt.totalAmount(), styles.currency);
                writeCurrency(row.createCell(3), debt.paidAmount(), styles.currency);
                writeCurrency(row.createCell(4), debt.remainingAmount(), styles.currency);
                if (debt.monthlyPaymentAmount() != null) {
                    writeCurrency(row.createCell(5), debt.monthlyPaymentAmount(), styles.currency);
                }
            }
        }

        autoSize(sheet, 6);
    }

    // ------------------------------------------------------------------
    // Andamento del saldo
    // ------------------------------------------------------------------

    private void writeBalanceTrendSheet(
            Workbook workbook, ExcelExportStyles styles,
            Map<YearMonth, List<Transaction>> byPeriod, Integer salaryDay, UUID userId) {
        Sheet sheet = workbook.createSheet("Andamento del saldo");
        int rowIndex = writeTitle(sheet, styles, 0, "Andamento del saldo per periodo");
        rowIndex = writeNote(sheet, styles, rowIndex,
                "Il saldo iniziale del primo periodo viene dal saldo registrato più recente non successivo al suo "
                        + "inizio, piu' tutto quello che e' stato registrato da li' in avanti: e' lo stesso "
                        + "calcolo del saldo che vedi in Dashboard, valutato alla fine di ogni periodo.");
        rowIndex++;

        int headerRow = rowIndex;
        writeHeader(sheet, styles, rowIndex++, "Periodo", "Dal", "Al", "Saldo iniziale", "Entrate", "Uscite",
                "Saldo finale");

        for (Map.Entry<YearMonth, List<Transaction>> entry : byPeriod.entrySet()) {
            BigDecimal income = sumByType(entry.getValue(), TransactionType.INCOME);
            BigDecimal expense = sumByType(entry.getValue(), TransactionType.EXPENSE);
            LocalDate start = SalaryPeriods.periodStart(entry.getKey(), salaryDay);
            LocalDate end = SalaryPeriods.periodEnd(entry.getKey(), salaryDay);

            // Ogni riga si ancora al saldo registrato piu' vicino invece di
            // sommare a catena dal primo periodo: un saldo scritto a meta'
            // dell'intervallo esportato altrimenti non conterebbe nulla, e il
            // foglio finirebbe per contraddire il saldo della Dashboard.
            BigDecimal opening = balanceAt(userId, start.minusDays(1));

            Row row = sheet.createRow(rowIndex++);
            row.createCell(0).setCellValue(sheetName(entry.getKey()));
            writeDate(row.createCell(1), start, styles);
            writeDate(row.createCell(2), end, styles);
            writeCurrency(row.createCell(3), opening, styles.currency);
            writeCurrency(row.createCell(4), income, styles.currency);
            writeCurrency(row.createCell(5), expense.negate(), styles.currency);
            writeCurrency(row.createCell(6), balanceAt(userId, end), styles.boldCurrency);
        }

        sheet.createFreezePane(0, headerRow + 1);
        autoSize(sheet, 7);
    }

    // ------------------------------------------------------------------
    // Utilita'
    // ------------------------------------------------------------------

    // Il saldo a una certa data, con lo stesso ragionamento della Dashboard:
    // il saldo registrato piu' recente non successivo a quella data, piu' tutto
    // quello che conta da li' in avanti (vedi CheckpointRules).
    private BigDecimal balanceAt(UUID userId, LocalDate date) {
        Optional<BalanceCheckpoint> checkpoint = checkpointRepository
                .findFirstByUserIdAndCheckpointDateLessThanEqualOrderByCheckpointDateDesc(userId, date);
        LocalDate from = checkpoint.map(BalanceCheckpoint::getCheckpointDate).orElse(DEFAULT_FROM);
        BigDecimal base = checkpoint.map(BalanceCheckpoint::getBalance).orElse(BigDecimal.ZERO);

        return base.add(transactionRepository.findByUserIdAndOccurredOnBetween(userId, from, date).stream()
                .filter(t -> CheckpointRules.counts(t, checkpoint.orElse(null)))
                .map(this::signed)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    private String describeFilters(LocalDate from, LocalDate to, UUID categoryId, List<Transaction> transactions) {
        List<String> parts = new ArrayList<>();
        if (from != null) parts.add("dal " + DAY_FORMAT.format(from));
        if (to != null) parts.add("al " + DAY_FORMAT.format(to));
        if (categoryId != null) {
            String name = transactions.stream()
                    .findFirst()
                    .map(t -> categoryPath(t.getCategory()))
                    .orElseGet(() -> categoryRepository.findById(categoryId)
                            .map(this::categoryPath)
                            .orElse("categoria selezionata"));
            parts.add("solo " + name);
        }
        return parts.isEmpty() ? null : "Contenuto filtrato: " + String.join(", ", parts) + ".";
    }

    private String sheetName(YearMonth period) {
        String raw = SHEET_NAME_FORMAT.format(period.atDay(1));
        return Character.toUpperCase(raw.charAt(0)) + raw.substring(1);
    }

    private String categoryPath(Category category) {
        return category.getParent() != null
                ? category.getParent().getName() + " › " + category.getName()
                : category.getName();
    }

    private String typeLabel(TransactionType type) {
        return type == TransactionType.INCOME ? "Entrata" : "Uscita";
    }

    private String cadence(Short intervalValue, IntervalUnit unit) {
        int value = intervalValue == null ? 1 : intervalValue;
        String label = switch (unit) {
            case DAY -> value == 1 ? "giorno" : "giorni";
            case WEEK -> value == 1 ? "settimana" : "settimane";
            case MONTH -> value == 1 ? "mese" : "mesi";
            case YEAR -> value == 1 ? "anno" : "anni";
        };
        return "ogni " + value + " " + label;
    }

    private BigDecimal signed(Transaction transaction) {
        return transaction.getType() == TransactionType.EXPENSE
                ? transaction.getAmount().negate()
                : transaction.getAmount();
    }

    private BigDecimal signedTotal(BigDecimal amount, TransactionType type) {
        return type == TransactionType.EXPENSE ? amount.negate() : amount;
    }

    private int writeTitle(Sheet sheet, ExcelExportStyles styles, int rowIndex, String text) {
        Cell cell = sheet.createRow(rowIndex++).createCell(0);
        cell.setCellValue(text);
        cell.setCellStyle(styles.title);
        return rowIndex;
    }

    private int writeNote(Sheet sheet, ExcelExportStyles styles, int rowIndex, String text) {
        Cell cell = sheet.createRow(rowIndex++).createCell(0);
        cell.setCellValue(text);
        cell.setCellStyle(styles.note);
        return rowIndex;
    }

    private void writeHeader(Sheet sheet, ExcelExportStyles styles, int rowIndex, String... headers) {
        Row row = sheet.createRow(rowIndex);
        for (int i = 0; i < headers.length; i++) {
            Cell cell = row.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(styles.header);
        }
    }

    private int writeKeyValue(Sheet sheet, ExcelExportStyles styles, int rowIndex, String label, BigDecimal amount) {
        Row row = sheet.createRow(rowIndex++);
        Cell labelCell = row.createCell(0);
        labelCell.setCellValue(label);
        labelCell.setCellStyle(styles.bold);
        writeCurrency(row.createCell(1), amount, styles.boldCurrency);
        return rowIndex;
    }

    private void writeDate(Cell cell, LocalDate date, ExcelExportStyles styles) {
        cell.setCellValue(date);
        cell.setCellStyle(styles.date);
    }

    private void writeCurrency(Cell cell, BigDecimal amount, org.apache.poi.ss.usermodel.CellStyle style) {
        cell.setCellValue(amount.doubleValue());
        cell.setCellStyle(style);
    }

    private void autoSize(Sheet sheet, int columns) {
        for (int i = 0; i < columns; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private BigDecimal sumByType(List<Transaction> transactions, TransactionType type) {
        return transactions.stream()
                .filter(t -> t.getType() == type)
                .map(Transaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
