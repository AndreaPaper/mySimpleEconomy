package com.spesetracker.service.bankimport;

import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

// Riconduce la categoria con cui la banca chiama l'accredito dello stipendio
// alla categoria stipendio che l'utente ha gia' sul profilo.
//
// Serve perche' le due nascono da parti diverse dell'app e non si incontrano
// mai: il profilo cerca (o crea) una categoria chiamata "Stipendio", mentre
// l'import prende il nome dalla banca — Intesa la chiama "Stipendi e pensioni".
// Il risultato erano due categorie per la stessa cosa, e il calcolo del
// risparmio che non riconosceva lo stipendio perche' non stava dove se lo
// aspettava.
@Service
@RequiredArgsConstructor
public class SalaryCategoryResolver {

    // Come le banche chiamano l'accredito. Sono radici e non parole intere:
    // "stipendi", "stipendio" e "Stipendi e pensioni" devono valere tutte.
    private static final List<String> SALARY_HINTS =
            List.of("stipend", "salari", "pension", "retribuz", "emolument");

    private final UserRepository userRepository;

    // Solo sulle entrate: fra le uscite "previdenza" o "fondo pensione" sono
    // versamenti, non stipendi.
    public boolean looksLikeSalary(String bankCategory, TransactionType type) {
        if (type != TransactionType.INCOME || bankCategory == null) return false;
        String normalized = bankCategory.toLowerCase(Locale.ITALIAN);
        return SALARY_HINTS.stream().anyMatch(normalized::contains);
    }

    // La categoria stipendio del profilo, se lo stipendio e' configurato: e'
    // quella della regola ricorrente che il profilo tiene allineata.
    public Optional<Category> profileSalaryCategory(UUID userId) {
        return userRepository.findById(userId)
                .map(User::getSalaryRecurringTransaction)
                .map(RecurringTransaction::getCategory);
    }
}
