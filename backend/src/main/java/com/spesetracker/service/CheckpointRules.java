package com.spesetracker.service;

import com.spesetracker.model.BalanceCheckpoint;
import com.spesetracker.model.Transaction;

// Cosa conta a partire da un saldo registrato. Sta qui e non dentro i singoli
// service perche' la usano sia la previsione sia l'export, e due copie della
// stessa regola prima o poi divergono: il saldo della Dashboard e quello del
// file Excel devono venire dallo stesso ragionamento.
public final class CheckpointRules {

    private CheckpointRules() {
    }

    // Le transazioni datate dopo il giorno del saldo contano sempre. Quelle
    // datate proprio in quel giorno dipendono da cosa vuol dire il saldo:
    //
    //   countsFrom valorizzato -> saldo letto in quel momento (scritto a mano).
    //       Quello che era gia' registrato allora e' dentro il numero: contarlo
    //       di nuovo lo sottrarrebbe due volte. Conta solo cio' che e' arrivato
    //       dopo, cosi' una spesa aggiunta nel pomeriggio muove comunque il saldo.
    //
    //   countsFrom nullo -> saldo a inizio giornata: contano tutte. E' il caso
    //       dei saldi importati da Excel ("SALDO INIZIO MESE") e di quelli
    //       registrati prima che questa distinzione esistesse.
    public static boolean counts(Transaction transaction, BalanceCheckpoint checkpoint) {
        if (checkpoint == null) return true;
        if (!transaction.getOccurredOn().isEqual(checkpoint.getCheckpointDate())) return true;
        if (checkpoint.getCountsFrom() == null) return true;
        return !transaction.getCreatedAt().isBefore(checkpoint.getCountsFrom());
    }
}
