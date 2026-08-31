package com.spesetracker.service;

import com.spesetracker.dto.profile.ProfileResponse;
import com.spesetracker.dto.profile.ProfileUpdateRequest;
import com.spesetracker.job.RecurringTransactionGenerationService;
import com.spesetracker.model.AvatarCatalog;
import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.CategoryType;
import com.spesetracker.model.enums.IntervalUnit;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private static final String SALARY_CATEGORY_NAME = "Stipendio";
    private static final String SALARY_CATEGORY_COLOR = "#10B981";
    private static final String SALARY_CATEGORY_ICON = "Wallet";
    private static final String SALARY_RECURRING_NAME = "Stipendio";

    private final UserRepository userRepository;
    private final CategoryRepository categoryRepository;
    private final RecurringTransactionRepository recurringTransactionRepository;
    private final RecurringTransactionGenerationService generationService;

    @Transactional(readOnly = true)
    public ProfileResponse get(UUID userId) {
        return toResponse(findUser(userId));
    }

    @Transactional
    public ProfileResponse update(UUID userId, ProfileUpdateRequest request) {
        User user = findUser(userId);

        BigDecimal previousSalaryAmount = user.getDefaultSalaryAmount();
        Short previousSalaryDay = user.getSalaryDay();

        validateSavingsSettings(request);

        user.setNickname(request.nickname());
        user.setDefaultSalaryAmount(request.defaultSalaryAmount());
        user.setSalaryDay(request.salaryDay());
        user.setAvatarKey(validateAvatarKey(request.avatarKey()));
        user.setSavingsEnabled(Boolean.TRUE.equals(request.savingsEnabled()));
        // La percentuale si salva anche a sezione spenta: riaccendendola,
        // l'utente ritrova la configurazione invece di doverla rifare.
        user.setSavingsPercent(request.savingsPercent());

        // Solo se stipendio o giorno sono davvero cambiati in questo salvataggio:
        // così un salvataggio che tocca solo il nickname non "resuscita" una
        // regola ricorrente che l'utente ha cancellato di proposito dalla
        // pagina Ricorrenti.
        boolean salaryChanged = !Objects.equals(previousSalaryAmount, request.defaultSalaryAmount())
                || !Objects.equals(previousSalaryDay, request.salaryDay());
        if (salaryChanged) {
            syncSalaryRecurringTransaction(user);
        }

        return toResponse(user);
    }

    // Tiene allineata la regola ricorrente "Stipendio" collegata al profilo:
    // la crea al primo stipendio impostato, aggiorna importo/giorno sui
    // salvataggi successivi, la disattiva (senza cancellarla) se l'utente
    // svuota stipendio o giorno.
    private void syncSalaryRecurringTransaction(User user) {
        BigDecimal amount = user.getDefaultSalaryAmount();
        Short day = user.getSalaryDay();
        RecurringTransaction rule = user.getSalaryRecurringTransaction();

        if (amount == null || day == null) {
            if (rule != null) {
                rule.setActive(false);
            }
            return;
        }

        LocalDate today = LocalDate.now();
        // Alla prima attivazione (o riattivazione dopo aver svuotato lo
        // stipendio) si usa il giorno di QUESTO mese anche se già passato,
        // così lo stipendio del mese corrente viene generato subito sotto
        // invece di aspettare il mese prossimo. Se la regola è già attiva
        // (semplice modifica di importo/giorno), si guarda solo in avanti,
        // per non rigenerare due volte lo stipendio dello stesso mese.
        boolean isNewOrReactivating = rule == null || !Boolean.TRUE.equals(rule.getActive());
        LocalDate nextDueDate = isNewOrReactivating
                ? today.withDayOfMonth(Math.min(day, today.lengthOfMonth()))
                : nextOccurrenceOfDay(day, today);

        if (rule == null) {
            RecurringTransaction created = RecurringTransaction.builder()
                    .user(user)
                    .category(salaryCategory(user))
                    .name(SALARY_RECURRING_NAME)
                    .defaultAmount(amount)
                    .intervalUnit(IntervalUnit.MONTH)
                    .intervalValue((short) 1)
                    .startDate(nextDueDate)
                    .nextDueDate(nextDueDate)
                    .build();
            recurringTransactionRepository.save(created);
            user.setSalaryRecurringTransaction(created);
            generationService.processDueRule(created.getId(), today);
            return;
        }

        rule.setDefaultAmount(amount);
        rule.setNextDueDate(nextDueDate);
        rule.setActive(true);
        generationService.processDueRule(rule.getId(), today);
    }

    private Category salaryCategory(User user) {
        return categoryRepository.findByUserIdAndNameIgnoreCase(user.getId(), SALARY_CATEGORY_NAME)
                .orElseGet(() -> categoryRepository.save(Category.builder()
                        .user(user)
                        .name(SALARY_CATEGORY_NAME)
                        .type(CategoryType.INCOME)
                        .color(SALARY_CATEGORY_COLOR)
                        .icon(SALARY_CATEGORY_ICON)
                        .build()));
    }

    // Prossima occorrenza del giorno del mese indicato, a partire da oggi
    // (oggi compreso). Il giorno viene troncato alla lunghezza del mese, per
    // i mesi più corti di 31 giorni.
    private LocalDate nextOccurrenceOfDay(short day, LocalDate today) {
        LocalDate candidate = today.withDayOfMonth(Math.min(day, today.lengthOfMonth()));
        if (!candidate.isBefore(today)) {
            return candidate;
        }
        LocalDate nextMonth = today.plusMonths(1);
        return nextMonth.withDayOfMonth(Math.min(day, nextMonth.lengthOfMonth()));
    }

    private User findUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Utente non trovato"));
    }

    // Senza una percentuale il budget disponibile non è calcolabile, quindi
    // attivare la sezione risparmio senza indicarla è un errore.
    private void validateSavingsSettings(ProfileUpdateRequest request) {
        if (Boolean.TRUE.equals(request.savingsEnabled()) && request.savingsPercent() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Con la sezione risparmio attiva serve la percentuale da mettere da parte");
        }
    }

    // L'utente può solo scegliere tra gli avatar offerti dall'app (AvatarCatalog),
    // non caricare un'immagine propria: qualsiasi altro valore è rifiutato.
    private String validateAvatarKey(String avatarKey) {
        if (avatarKey == null) return null;
        if (!AvatarCatalog.VALID_KEYS.contains(avatarKey)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Avatar non valido");
        }
        return avatarKey;
    }

    private ProfileResponse toResponse(User user) {
        return new ProfileResponse(
                user.getEmail(),
                user.getNickname(),
                user.getDefaultSalaryAmount(),
                user.getSalaryDay(),
                user.getAvatarKey(),
                Boolean.TRUE.equals(user.getSavingsEnabled()),
                user.getSavingsPercent(),
                // Ricavata dalla regola ricorrente dello stipendio: è la stessa
                // categoria che syncSalaryRecurringTransaction crea/riusa.
                user.getSalaryRecurringTransaction() != null
                        ? user.getSalaryRecurringTransaction().getCategory().getId()
                        : null);
    }
}
