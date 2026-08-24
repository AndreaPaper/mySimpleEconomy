package com.spesetracker.model.enums;

// Classificazione di una categoria di spesa per la modalità risparmio:
// NEED = spesa necessaria, WANT = spesa voluttuaria. L'assenza di valore
// (null sulla categoria) significa "eredita dal padre" per una
// sottocategoria e "non classificata" per una categoria principale.
public enum SpendingBucket {
    NEED,
    WANT
}
