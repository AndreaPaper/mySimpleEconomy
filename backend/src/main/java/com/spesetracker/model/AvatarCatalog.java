package com.spesetracker.model;

import java.util.Set;

// Set fisso di avatar (animali) che l'utente può scegliere per il proprio profilo:
// nessun upload libero, stesso principio della palette colori/icone delle categorie.
public final class AvatarCatalog {

    public static final Set<String> VALID_KEYS = Set.of(
            "cat", "dog", "rabbit", "bird", "fish", "turtle", "squirrel", "panda", "mouse", "snail");

    private AvatarCatalog() {
    }
}
