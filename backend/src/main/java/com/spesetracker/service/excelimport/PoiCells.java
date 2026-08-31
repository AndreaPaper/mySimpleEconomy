package com.spesetracker.service.excelimport;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.CellValue;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.FormulaEvaluator;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;

// Letture di celle condivise fra l'import del diario spese e quello degli
// estratti conto: due parser diversi, ma le stesse domande da fare a una cella.
public final class PoiCells {

    private PoiCells() {
    }

    public static String readString(Cell cell) {
        if (cell == null || cell.getCellType() != CellType.STRING) return null;
        String value = cell.getStringCellValue();
        return value.isBlank() ? null : value;
    }

    public static LocalDate readDate(Cell cell) {
        if (cell == null || cell.getCellType() != CellType.NUMERIC) return null;
        if (!DateUtil.isCellDateFormatted(cell)) return null;
        return cell.getLocalDateTimeCellValue().toLocalDate();
    }

    public static BigDecimal readNumeric(Cell cell, FormulaEvaluator evaluator) {
        if (cell == null) return null;
        try {
            CellType type = cell.getCellType();
            if (type == CellType.NUMERIC && !DateUtil.isCellDateFormatted(cell)) {
                return BigDecimal.valueOf(cell.getNumericCellValue()).setScale(2, RoundingMode.HALF_UP);
            }
            if (type == CellType.FORMULA && evaluator != null) {
                CellValue value = evaluator.evaluate(cell);
                if (value != null && value.getCellType() == CellType.NUMERIC) {
                    return BigDecimal.valueOf(value.getNumberValue()).setScale(2, RoundingMode.HALF_UP);
                }
            }
        } catch (Exception ignored) {
            // cella non numerica/non valutabile: trattata come assente
        }
        return null;
    }

    // Il testo di una cella qualunque sia il suo tipo. L'estratto conto ha
    // colonne che la banca a volte scrive come testo e a volte come numero
    // (importi, SI/NO), quindi qui non si può pretendere CellType.STRING.
    public static String readAnyAsString(Cell cell) {
        if (cell == null) return null;
        String value = switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> DateUtil.isCellDateFormatted(cell)
                    ? cell.getLocalDateTimeCellValue().toLocalDate().toString()
                    : BigDecimal.valueOf(cell.getNumericCellValue()).stripTrailingZeros().toPlainString();
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            default -> null;
        };
        return value == null || value.isBlank() ? null : value.trim();
    }
}
