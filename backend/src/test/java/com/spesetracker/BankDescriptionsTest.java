package com.spesetracker;

import com.spesetracker.service.bankimport.BankDescriptions;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

// Da "Operazione" e "Dettagli" alla descrizione che si legge nell'elenco. E' il
// testo con cui si riconosce un movimento nell'anteprima dell'import e poi fra
// le transazioni: se resta un codice interno, la riga e' illeggibile.
class BankDescriptionsTest {

    // Sui movimenti contabilizzati la colonna Operazione contiene gia' il nome
    // dell'esercente, ed e' la scelta migliore.
    @Test
    void quandoLOperazioneDiceGiaChiHaIncassatoSiUsaQuella() {
        assertThat(BankDescriptions.describe("Coop Genova Gastaldi", "CARTA N.5397 XXXX"))
                .isEqualTo("Coop Genova Gastaldi");
    }

    // Sui movimenti non ancora contabilizzati la banca ci mette il tipo di
    // pagamento e il nome finisce nei dettagli: li' bisogna ripiegare, altrimenti
    // ogni riga provvisoria si chiamerebbe "Pagamento Pos".
    @Test
    void quandoLOperazioneDiceSoloIlMezzoDiPagamentoSiRipiegaSuiDettagli() {
        assertThat(BankDescriptions.describe("Pagamento Pos", "Supermercato Coop. Lig"))
                .isEqualTo("Supermercato Coop. Lig");
        assertThat(BankDescriptions.describe("Operazione", "Farmacia Economica"))
                .isEqualTo("Farmacia Economica");
    }

    // I dettagli sono pieni di rumore che occuperebbe tutta la riga senza dire
    // niente: numeri di carta, codici disposizione, l'ora dell'operazione.
    @Test
    void iCodiciDiServizioVengonoToltiDaiDettagli() {
        assertThat(BankDescriptions.describe("Pagamento Pos", "MC DONALD'S 24/081207 Carta n.5397 XXXX"))
                .doesNotContain("Carta")
                .contains("MC DONALD'S");

        assertThat(BankDescriptions.describe("Pagamento Pos", "COD.DISP. 0126072846406016 Bonifico"))
                .doesNotContain("0126072846406016");

        assertThat(BankDescriptions.describe(
                        "Pagamento Pos", "Effettuato Il 25/08/2026 Alle Ore 1723 Presso Coop Genova"))
                .doesNotContain("Alle Ore")
                .contains("Coop Genova");
    }

    // Meglio un'etichetta generica che una riga vuota: data e importo bastano
    // comunque a riconoscere il movimento.
    @Test
    void senzaNientoDiUtileRestaUnEtichettaInveceDelVuoto() {
        assertThat(BankDescriptions.describe(null, null)).isEqualTo("Movimento");
        assertThat(BankDescriptions.describe("", "")).isEqualTo("Movimento");
    }

    // La colonna description del database e' un VARCHAR(255).
    @Test
    void laDescrizioneNonSuperaLaLunghezzaDellaColonna() {
        String lungo = "A".repeat(400);
        assertThat(BankDescriptions.describe(lungo, null)).hasSize(255);
    }
}
