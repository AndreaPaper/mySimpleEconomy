package com.spesetracker;

import com.spesetracker.dto.bankimport.BankImportExclusionDto;
import com.spesetracker.service.bankimport.BankExclusionSuggestions;
import com.spesetracker.service.bankimport.BankStatementRow;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

// Le esclusioni proposte al primo import: righe che muovono soldi senza essere
// spese. Un giroconto verso un proprio conto e un prelievo di contante, contati
// come uscite, gonfiano il totale speso — e sono proprio i due casi che si
// ripetono ogni mese, quindi l'errore non e' occasionale.
//
// Il nome del titolare non viene chiesto ne' indovinato: si ricava dal file
// stesso, confrontando il beneficiario delle uscite con quello delle entrate.
class BankExclusionSuggestionsTest {

    private static BankStatementRow row(int number, String operation, String details, String amount) {
        return new BankStatementRow(
                number, LocalDate.of(2026, 8, 20), operation, details,
                "Conto 1000/00139572", true, "Bonifici", new BigDecimal(amount));
    }

    // L'entrata dice chi e' il titolare ("BENEF. ANDREA BATTISTINI"); l'uscita
    // verso lo stesso nome e' quindi un giroconto fra conti propri.
    @Test
    void unBonificoVersoSeStessiVieneProposto() {
        List<BankImportExclusionDto> suggerite = BankExclusionSuggestions.suggest(List.of(
                row(1, "Stipendio", "BENEF. ANDREA BATTISTINI BIC XYZ", "1885.14"),
                row(2, "Bonifico", "Bonifico a favore di Andrea Battistini  MANDATO 123", "-500.00")));

        assertThat(suggerite).hasSize(1);
        assertThat(suggerite.get(0).pattern()).isEqualTo("a favore di Andrea Battistini");
        assertThat(suggerite.get(0).note()).contains("Giroconto");
    }

    // "ANDREA BATTISTINI" e "Battistini Andrea" sono la stessa persona: la banca
    // non e' coerente sull'ordine, e confrontare la stringa perderebbe il caso.
    @Test
    void ilNomeSiRiconosceAncheConLeParoleInvertite() {
        List<BankImportExclusionDto> suggerite = BankExclusionSuggestions.suggest(List.of(
                row(1, "Stipendio", "BENEF. BATTISTINI ANDREA BIC XYZ", "1885.14"),
                row(2, "Bonifico", "Bonifico a favore di ANDREA BATTISTINI  MANDATO 123", "-500.00")));

        assertThat(suggerite).hasSize(1);
    }

    // Un bonifico a un'altra persona e' una spesa vera e non va proposto.
    @Test
    void unBonificoVersoQualcunAltroNonVieneProposto() {
        List<BankImportExclusionDto> suggerite = BankExclusionSuggestions.suggest(List.of(
                row(1, "Stipendio", "BENEF. ANDREA BATTISTINI BIC XYZ", "1885.14"),
                row(2, "Bonifico", "Bonifico a favore di Mario Rossi  MANDATO 123", "-500.00")));

        assertThat(suggerite).isEmpty();
    }

    // Senza un'entrata da cui ricavare il titolare non si puo' dire di chi sia il
    // conto: meglio non proporre nulla che proporre a caso.
    @Test
    void senzaEntrateDaCuiRicavareIlTitolareNonSiProponeNiente() {
        List<BankImportExclusionDto> suggerite = BankExclusionSuggestions.suggest(List.of(
                row(1, "Bonifico", "Bonifico a favore di Andrea Battistini  MANDATO 123", "-500.00")));

        assertThat(suggerite).isEmpty();
    }

    @Test
    void unPrelievoDiContantiVieneProposto() {
        List<BankImportExclusionDto> suggerite = BankExclusionSuggestions.suggest(List.of(
                row(1, "Prelievo Bancomat", "PRELIEVO CARTA 5397", "-200.00")));

        assertThat(suggerite).hasSize(1);
        assertThat(suggerite.get(0).pattern()).isEqualTo("Prelievo");
    }

    // Il prelievo si propone una volta sola anche se nel file ce ne sono tanti:
    // la regola e' una, non una per riga.
    @Test
    void piuPrelieviProduconoUnaSolaProposta() {
        List<BankImportExclusionDto> suggerite = BankExclusionSuggestions.suggest(List.of(
                row(1, "Prelievo Bancomat", "PRELIEVO CARTA 5397", "-200.00"),
                row(2, "Prelievo Bancomat", "PRELIEVO CARTA 5397", "-100.00")));

        assertThat(suggerite).hasSize(1);
    }

    @Test
    void leSpeseNormaliNonProduconoProposte() {
        List<BankImportExclusionDto> suggerite = BankExclusionSuggestions.suggest(List.of(
                row(1, "Coop Genova Gastaldi", "Spesa settimanale", "-20.99"),
                row(2, "Mc Donald's", "Pranzo", "-10.59")));

        assertThat(suggerite).isEmpty();
    }
}
