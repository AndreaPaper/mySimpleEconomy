package com.spesetracker.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

// Endpoint pubblico e leggero (nessuna query al DB) usato per tenere sveglio
// il servizio su Render durante l'orario d'uso, evitando lo spin-down dopo
// 15 minuti di inattività del piano gratuito.
@RestController
@RequestMapping("/api/ping")
public class PingController {

    @GetMapping
    public Map<String, String> ping() {
        return Map.of("status", "ok");
    }
}
