package com.spesetracker;

import com.spesetracker.service.bankimport.BankFingerprints;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

// L'impronta di una riga dell'estratto conto. E' il solo meccanismo che impedisce
// di importare due volte lo stesso movimento quando si ripassa un export
// aggiornato: l'export della banca non ha un identificativo di transazione,
// quindi l'unica identita' e' il contenuto della riga.
//
// Finora era verificata solo di rimbalzo, da un test che reimportava lo stesso
// file: quel test dice che il riconoscimento funziona su un caso, non quali
// differenze contano e quali no.
class BankFingerprintsTest {

    private static final LocalDate DATE = LocalDate.of(2026, 8, 26);
    private static final BigDecimal AMOUNT = new BigDecimal("-20.99");
    private static final String OPERATION = "Coop Genova Gastaldi";
    private static final String DETAILS = "Effettuato Il 25/08/2026 Alle Ore 1723";

    @Test
    void laStessaRigaDaSempreLaStessaImpronta() {
        assertThat(BankFingerprints.of(DATE, AMOUNT, OPERATION, DETAILS))
                .isEqualTo(BankFingerprints.of(DATE, AMOUNT, OPERATION, DETAILS));
    }

    @Test
    void unaDataDiversaCambiaLImpronta() {
        assertThat(BankFingerprints.of(DATE.plusDays(1), AMOUNT, OPERATION, DETAILS))
                .isNotEqualTo(BankFingerprints.of(DATE, AMOUNT, OPERATION, DETAILS));
    }

    @Test
    void unImportoDiversoCambiaLImpronta() {
        assertThat(BankFingerprints.of(DATE, new BigDecimal("-21.99"), OPERATION, DETAILS))
                .isNotEqualTo(BankFingerprints.of(DATE, AMOUNT, OPERATION, DETAILS));
    }

    @Test
    void unTestoDiversoCambiaLImpronta() {
        assertThat(BankFingerprints.of(DATE, AMOUNT, "Esselunga", DETAILS))
                .isNotEqualTo(BankFingerprints.of(DATE, AMOUNT, OPERATION, DETAILS));
        assertThat(BankFingerprints.of(DATE, AMOUNT, OPERATION, "altri dettagli"))
                .isNotEqualTo(BankFingerprints.of(DATE, AMOUNT, OPERATION, DETAILS));
    }

    // Fra un export e l'altro la banca non e' coerente su maiuscole e spazi: se
    // contassero, la stessa riga rientrerebbe come nuova e si creerebbe un
    // doppione. E' il motivo per cui l'impronta normalizza il testo.
    @Test
    void maiuscoleESpaziRipetutiNonCambianoLImpronta() {
        assertThat(BankFingerprints.of(DATE, AMOUNT, "COOP GENOVA GASTALDI", "  effettuato   il  "))
                .isEqualTo(BankFingerprints.of(DATE, AMOUNT, "coop genova gastaldi", "effettuato il"));
    }

    // Stesso importo scritto in due modi: la banca puo' esportare 20.9 o 20.90 e
    // sono lo stesso movimento.
    @Test
    void zeriFinaliNonSignificativiNonCambianoLImpronta() {
        assertThat(BankFingerprints.of(DATE, new BigDecimal("-20.90"), OPERATION, DETAILS))
                .isEqualTo(BankFingerprints.of(DATE, new BigDecimal("-20.9"), OPERATION, DETAILS));
    }

    @Test
    void iCampiAssentiNonFannoEsplodereIlCalcolo() {
        assertThat(BankFingerprints.of(null, null, null, null)).isNotBlank();
    }
}
