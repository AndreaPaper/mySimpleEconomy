package com.spesetracker.model.enums;

// Formato dell'estratto conto importato. Non è un enum di Postgres ma una
// VARCHAR: aggiungere una banca non deve richiedere una migrazione.
public enum BankSource {
    INTESA_SANPAOLO
}
