package com.spesetracker;

import com.spesetracker.job.ExpenseReminderAdvancementService;
import com.spesetracker.job.ExpenseReminderGenerationScheduler;
import com.spesetracker.job.ExpenseReminderGenerationService;
import com.spesetracker.job.ExpenseReminderNotificationScheduler;
import com.spesetracker.job.ExpenseReminderNotificationService;
import com.spesetracker.job.ExpenseReminderScheduler;
import com.spesetracker.job.RecurringTransactionGenerationService;
import com.spesetracker.job.RecurringTransactionScheduler;
import com.spesetracker.model.Category;
import com.spesetracker.model.RecurringTransaction;
import com.spesetracker.model.User;
import com.spesetracker.model.enums.IntervalUnit;
import com.spesetracker.repository.CategoryRepository;
import com.spesetracker.repository.ExpenseReminderRepository;
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

    @Autowired
    private ExpenseReminderScheduler reminderScheduler;

    @Autowired
    private ExpenseReminderNotificationScheduler notificationScheduler;

    @Autowired
    private ExpenseReminderGenerationScheduler generationScheduler;

    @MockitoSpyBean
    private RecurringTransactionGenerationService generationService;

    @MockitoSpyBean
    private ExpenseReminderAdvancementService advancementService;

    @MockitoSpyBean
    private ExpenseReminderNotificationService notificationService;

    @MockitoSpyBean
    private ExpenseReminderGenerationService generationServiceReminder;

    @Autowired
    private ExpenseReminderRepository expenseReminderRepository;

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

    /**
     * Gli altri tre schedulatori hanno la stessa forma, e la stessa garanzia. Un test per
     * ciascuno, con il finto che fallisce sul secondo promemoria: gli altri due devono essere
     * elaborati lo stesso.
     *
     * <p>Sono raggruppati qui invece che sparsi perché è una proprietà sola ripetuta quattro
     * volte: chi domani riscrive uno dei cicli trova in un colpo d'occhio cosa deve continuare
     * a valere per tutti.
     */
    @Test
    void anchePerIPromemoriaUnaRegolaGuastaNonFermaLeAltre() throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        LocalDate ieri = LocalDate.now().minusDays(1);

        UUID prima = UUID.fromString(api.createReminder(token, categoryId, "Prima", ieri));
        UUID guasta = UUID.fromString(api.createReminder(token, categoryId, "Guasta", ieri));
        UUID terza = UUID.fromString(api.createReminder(token, categoryId, "Terza", ieri));

        doThrow(new RuntimeException("promemoria incoerente"))
                .when(advancementService).advanceDueReminder(eq(guasta), any());

        reminderScheduler.advanceDueReminders();

        // Le due sane sono avanzate al mese prossimo, la guasta è rimasta dov'era.
        assertThat(expenseReminderRepository.findById(prima).orElseThrow().getNextDueDate())
                .isAfter(LocalDate.now());
        assertThat(expenseReminderRepository.findById(terza).orElseThrow().getNextDueDate())
                .isAfter(LocalDate.now());
        assertThat(expenseReminderRepository.findById(guasta).orElseThrow().getNextDueDate())
                .isEqualTo(ieri);
    }

    @Test
    void unaNotificaFallitaNonFermaLeAltre() throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        LocalDate oggi = LocalDate.now();

        UUID prima = UUID.fromString(api.createReminder(token, categoryId, "Prima", oggi, "MONTH", 1, 3, null, null));
        UUID guasta = UUID.fromString(api.createReminder(token, categoryId, "Guasta", oggi, "MONTH", 1, 3, null, null));
        UUID terza = UUID.fromString(api.createReminder(token, categoryId, "Terza", oggi, "MONTH", 1, 3, null, null));

        doThrow(new RuntimeException("Resend non risponde"))
                .when(notificationService).notifyIfDue(eq(guasta), any());

        notificationScheduler.sendDueNotifications();

        // Chi ha ricevuto l'avviso lo ha segnato; la guasta è ancora da avvisare, e il
        // giorno dopo si riprova.
        assertThat(expenseReminderRepository.findById(prima).orElseThrow().getLastNotifiedDueDate()).isNotNull();
        assertThat(expenseReminderRepository.findById(terza).orElseThrow().getLastNotifiedDueDate()).isNotNull();
        assertThat(expenseReminderRepository.findById(guasta).orElseThrow().getLastNotifiedDueDate()).isNull();
    }

    @Test
    void unaGenerazioneFallitaNonFermaLeAltre() throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        // Scadenza dentro il mese corrente: è la finestra su cui il job raccoglie.
        LocalDate questoMese = LocalDate.now().withDayOfMonth(Math.min(15, LocalDate.now().lengthOfMonth()));

        UUID guasta = UUID.fromString(
                api.createReminder(token, categoryId, "Guasta", questoMese, "MONTH", 1, null, null, "50.00"));
        api.createReminder(token, categoryId, "Prima", questoMese, "MONTH", 1, null, null, "10.00");
        api.createReminder(token, categoryId, "Terza", questoMese, "MONTH", 1, null, null, "20.00");

        doThrow(new RuntimeException("categoria incoerente"))
                .when(generationServiceReminder).generateForMonth(eq(guasta), any());

        generationScheduler.generateForCurrentMonth();

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
