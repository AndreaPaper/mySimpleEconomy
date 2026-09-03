package com.spesetracker;

import com.spesetracker.job.RecurringTransactionGenerationService;
import com.spesetracker.job.RecurringTransactionScheduler;
import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.IntervalUnit;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.RecurringTransactionRepository;
import com.spesetracker.repository.UserRepository;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;

/**
 * L'unica cosa che gli schedulatori decidono davvero, e la ragione per cui non sono tre righe:
 * raccolgono prima gli identificativi, poi elaborano una regola alla volta dentro un
 * {@code try/catch}. Una regola guasta viene registrata nel log e le altre proseguono.
 *
 * <p>Senza questa garanzia un singolo dato malformato — una categoria cancellata, un importo
 * fuori scala — fermerebbe la generazione di <em>tutti</em> gli utenti, e nessuno se ne
 * accorgerebbe: il job non ha un'interfaccia, fallisce in silenzio alle cinque del mattino.
 * È esattamente il genere di riga che sparisce in un riordino del codice.
 *
 * <p>Resta fuori, deliberatamente, che {@code @Scheduled} scatti all'ora giusta: sarebbe un
 * test sull'annotazione, non sul comportamento.
 */
class SchedulerResilienceTest extends AbstractIntegrationTest {

    @Autowired
    private RecurringTransactionScheduler scheduler;

    @MockitoSpyBean
    private RecurringTransactionGenerationService generationService;

    @Autowired
    private RecurringTransactionRepository recurringTransactionRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void unaRegolaGuastaNonFermaLeAltre() throws Exception {
        String email = "scheduler+" + UUID.randomUUID() + "@example.com";
        String token = api.registerAndLogin(email, "password123");
        String nome = "Uscita-" + UUID.randomUUID();
        api.createCategory(token, nome, "EXPENSE");
        User user = userRepository.findByEmail(email).orElseThrow();
        Category category = categoryRepository.findByUserIdAndNameIgnoreCase(user.getId(), nome).orElseThrow();

        // Tre regole scadute ieri, così sono tutte e tre nella lista che lo schedulatore
        // raccoglie oggi. La seconda è quella che si romperà.
        LocalDate ieri = LocalDate.now().minusDays(1);
        UUID prima = regola(user, category, "Prima", ieri).getId();
        UUID guasta = regola(user, category, "Guasta", ieri).getId();
        UUID terza = regola(user, category, "Terza", ieri).getId();

        doThrow(new RuntimeException("categoria incoerente"))
                .when(generationService).processDueRule(eq(guasta), any());

        scheduler.generateDueTransactions();

        // Le due sane hanno generato la loro occorrenza e sono avanzate al mese prossimo.
        assertThat(recurringTransactionRepository.findById(prima).orElseThrow().getNextDueDate())
                .isAfter(LocalDate.now());
        assertThat(recurringTransactionRepository.findById(terza).orElseThrow().getNextDueDate())
                .isAfter(LocalDate.now());
        // Quella guasta è rimasta dov'era: verrà riprovata domani.
        assertThat(recurringTransactionRepository.findById(guasta).orElseThrow().getNextDueDate())
                .isEqualTo(ieri);

        assertThat(api.listTransactions(token).findValuesAsText("description"))
                .containsExactlyInAnyOrder("Prima", "Terza");
    }

    private RecurringTransaction regola(User user, Category category, String nome, LocalDate nextDue) {
        return recurringTransactionRepository.save(RecurringTransaction.builder()
                .user(user)
                .category(category)
                .name(nome)
                .defaultAmount(new BigDecimal("10.00"))
                .intervalUnit(IntervalUnit.MONTH)
                .intervalValue((short) 1)
                .startDate(nextDue)
                .nextDueDate(nextDue)
                .active(true)
                .build());
    }
}
