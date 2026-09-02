package com.spesetracker;

import com.spesetracker.model.BalanceCheckpoint;
import com.spesetracker.model.Transaction;
import com.spesetracker.service.CheckpointRules;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

// Quali transazioni contano a partire da un saldo registrato.
//
// La regola risolve un'ambiguita' reale: "saldo del 26/08" da solo non dice se le
// spese di quel giorno sono gia' dentro il numero. Chi lo scrive a mano guarda il
// conto in quel momento, quindi lo sono; un "SALDO INIZIO MESE" importato da
// Excel precede tutta la giornata, quindi no. Sbagliare vuol dire sottrarre due
// volte una spesa, o non sottrarla affatto.
//
// Sta in una classe a parte perche' la usano sia la previsione sia l'export, e
// due copie della stessa regola prima o poi divergono: qui si fissa una volta.
class CheckpointRulesTest {

    private static final LocalDate GIORNO_DEL_SALDO = LocalDate.of(2026, 8, 26);
    private static final Instant MEZZOGIORNO = Instant.parse("2026-08-26T12:00:00Z");

    private static Transaction transazione(LocalDate quando, Instant registrataAlle) {
        Transaction t = Transaction.builder().occurredOn(quando).build();
        t.setCreatedAt(registrataAlle);
        return t;
    }

    private static BalanceCheckpoint saldo(Instant countsFrom) {
        return BalanceCheckpoint.builder()
                .checkpointDate(GIORNO_DEL_SALDO)
                .countsFrom(countsFrom)
                .build();
    }

    @Test
    void senzaUnSaldoDiRiferimentoContaTutto() {
        assertThat(CheckpointRules.counts(transazione(GIORNO_DEL_SALDO, MEZZOGIORNO), null)).isTrue();
    }

    @Test
    void leTransazioniDopoIlGiornoDelSaldoContanoSempre() {
        assertThat(CheckpointRules.counts(
                transazione(GIORNO_DEL_SALDO.plusDays(1), MEZZOGIORNO), saldo(MEZZOGIORNO))).isTrue();
    }

    @Test
    void leTransazioniPrimaDelGiornoDelSaldoContanoSempre() {
        // Sono gia' dentro il saldo per definizione, ma la regola le lascia
        // passare: e' chi la chiama a limitare la finestra temporale.
        assertThat(CheckpointRules.counts(
                transazione(GIORNO_DEL_SALDO.minusDays(1), MEZZOGIORNO), saldo(MEZZOGIORNO))).isTrue();
    }

    // Saldo scritto a mano ("vale adesso"): quello che era gia' registrato in quel
    // momento e' dentro il numero, e ricontarlo lo sottrarrebbe due volte.
    @Test
    void conUnSaldoLettoInQuelMomentoLeSpeseGiaRegistrateNonContanoDiNuovo() {
        Transaction registrataPrima = transazione(GIORNO_DEL_SALDO, MEZZOGIORNO.minusSeconds(3600));
        assertThat(CheckpointRules.counts(registrataPrima, saldo(MEZZOGIORNO))).isFalse();
    }

    // Ma una spesa aggiunta nel pomeriggio deve muovere il saldo, altrimenti il
    // numero resterebbe fermo fino al giorno dopo.
    @Test
    void conUnSaldoLettoInQuelMomentoLeSpeseAggiunteDopoContano() {
        Transaction registrataDopo = transazione(GIORNO_DEL_SALDO, MEZZOGIORNO.plusSeconds(3600));
        assertThat(CheckpointRules.counts(registrataDopo, saldo(MEZZOGIORNO))).isTrue();
    }

    // Il confine e' inclusivo sull'istante esatto: una transazione registrata
    // nello stesso momento del saldo conta, cosi' il caso limite non sparisce.
    @Test
    void unaTransazioneRegistrataNelloStessoIstanteDelSaldoConta() {
        assertThat(CheckpointRules.counts(transazione(GIORNO_DEL_SALDO, MEZZOGIORNO), saldo(MEZZOGIORNO)))
                .isTrue();
    }

    // Saldo a inizio giornata (importato da Excel, o registrato prima che questa
    // distinzione esistesse): contano tutte le transazioni del giorno.
    @Test
    void conUnSaldoAInizioGiornataContanoTutteLeSpeseDelGiorno() {
        Transaction registrataPrima = transazione(GIORNO_DEL_SALDO, MEZZOGIORNO.minusSeconds(3600));
        assertThat(CheckpointRules.counts(registrataPrima, saldo(null))).isTrue();
    }
}
