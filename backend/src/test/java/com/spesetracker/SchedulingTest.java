package com.spesetracker;

import com.spesetracker.job.ExpenseReminderGenerationScheduler;
import com.spesetracker.job.ExpenseReminderNotificationScheduler;
import com.spesetracker.job.ExpenseReminderScheduler;
import com.spesetracker.job.RecurringTransactionScheduler;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.support.CronExpression;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Che i quattro job siano davvero programmati, e in che ordine.
 *
 * <p>Nel giro precedente avevo liquidato questa parte come "un test
 * sull'annotazione". Mi ero fermato troppo presto. Che {@code @Scheduled} scatti alle cinque
 * dipende dal sistema operativo e non e' codice nostro — quello resta fuori. Ma due cose sono
 * nostre, e sono entrambe silenziose:
 *
 * <ol>
 *   <li>Se qualcuno toglie {@code @EnableScheduling} da {@code SpesometroApplication}, tutti e
 *       quattro i job smettono di girare <em>per sempre</em>. L'applicazione parte, risponde,
 *       non registra alcun errore: semplicemente le transazioni ricorrenti non compaiono piu',
 *       e ce ne si accorge mesi dopo guardando un saldo che non torna. E' il guasto piu'
 *       silenzioso dell'intera applicazione.</li>
 *   <li>I quattro orari sono in una sequenza voluta, non sparsi a caso.</li>
 * </ol>
 */
class SchedulingTest extends AbstractIntegrationTest {

    @Autowired
    private ApplicationContext context;

    /**
     * I metodi programmati, come "Classe.metodo".
     *
     * <p>Il bean del post-processore esiste solo se {@code @EnableScheduling} c'e'. Si cerca
     * quindi con {@code getBeanProvider} e non con {@code getBean}: senza, l'assenza si
     * presenterebbe come un {@code NoSuchBeanDefinitionException} — vero, ma illeggibile per chi
     * ha appena tolto un'annotazione e non sa ancora di aver rotto tutti i job.
     */
    private Set<String> metodiProgrammati() {
        ScheduledAnnotationBeanPostProcessor processor = context
                .getBeanProvider(ScheduledAnnotationBeanPostProcessor.class)
                .getIfAvailable();
        assertThat(processor)
                .as("Nessuno schedulatore configurato: manca @EnableScheduling su "
                        + "SpesometroApplication? Senza, tutti e quattro i job smettono di girare "
                        + "e nulla lo segnala.")
                .isNotNull();
        return processor.getScheduledTasks().stream()
                .map(ScheduledTask::getTask)
                .filter(CronTask.class::isInstance)
                .map(task -> ((CronTask) task).getRunnable().toString())
                .collect(Collectors.toSet());
    }

    /** L'espressione cron dichiarata su un metodo, letta dall'annotazione. */
    private String cronDi(Class<?> tipo, String metodo) throws Exception {
        Method m = tipo.getMethod(metodo);
        Scheduled scheduled = m.getAnnotation(Scheduled.class);
        assertThat(scheduled).as("%s.%s non e' annotato @Scheduled", tipo.getSimpleName(), metodo).isNotNull();
        return scheduled.cron();
    }

    /** La prima esecuzione a partire da mezzanotte di un giorno qualunque. */
    private LocalDateTime primaEsecuzioneDopo(String cron, LocalDateTime da) {
        return CronExpression.parse(cron).next(da);
    }

    /**
     * La rete di sicurezza contro {@code @EnableScheduling} rimosso. Se sparisce, l'insieme e'
     * vuoto e questo test fallisce — che e' l'unico modo di accorgersene prima dell'utente.
     */
    @Test
    void tuttiEQuattroIJobSonoRegistrati() {
        Set<String> programmati = metodiProgrammati();

        assertThat(programmati)
                .as("nessun job programmato: @EnableScheduling e' ancora al suo posto?")
                .isNotEmpty();
        assertThat(programmati).anyMatch(t -> t.contains("generateDueTransactions"));
        assertThat(programmati).anyMatch(t -> t.contains("advanceDueReminders"));
        assertThat(programmati).anyMatch(t -> t.contains("generateForCurrentMonth"));
        assertThat(programmati).anyMatch(t -> t.contains("sendDueNotifications"));
    }

    @Test
    void leQuattroEspressioniCronSonoValide() throws Exception {
        assertThat(CronExpression.parse(cronDi(RecurringTransactionScheduler.class, "generateDueTransactions")))
                .isNotNull();
        assertThat(CronExpression.parse(cronDi(ExpenseReminderScheduler.class, "advanceDueReminders")))
                .isNotNull();
        assertThat(CronExpression.parse(cronDi(ExpenseReminderGenerationScheduler.class, "generateForCurrentMonth")))
                .isNotNull();
        assertThat(CronExpression.parse(cronDi(ExpenseReminderNotificationScheduler.class, "sendDueNotifications")))
                .isNotNull();
    }

    /**
     * L'ordine e' la cosa che conta davvero, ed e' l'unica che si romperebbe in silenzio
     * cambiando un orario "tanto e' notte comunque".
     *
     * <p>Prima si generano le transazioni ricorrenti, poi si avanzano i promemoria scaduti, poi
     * si mandano le notifiche. Invertire le ultime due manderebbe l'avviso e <em>subito dopo</em>
     * sposterebbe la scadenza: l'utente riceverebbe un preavviso per una data gia' superata.
     */
    @Test
    void iJobGiornalieriGiranoNellOrdineGiusto() throws Exception {
        LocalDateTime mezzanotte = LocalDateTime.of(2026, 3, 10, 0, 0);

        LocalDateTime ricorrenti = primaEsecuzioneDopo(
                cronDi(RecurringTransactionScheduler.class, "generateDueTransactions"), mezzanotte);
        LocalDateTime avanzamento = primaEsecuzioneDopo(
                cronDi(ExpenseReminderScheduler.class, "advanceDueReminders"), mezzanotte);
        LocalDateTime notifiche = primaEsecuzioneDopo(
                cronDi(ExpenseReminderNotificationScheduler.class, "sendDueNotifications"), mezzanotte);

        assertThat(ricorrenti).isBefore(avanzamento);
        assertThat(avanzamento).isBefore(notifiche);
        // E tutti e tre nello stesso giorno: sono un ciclo, non tre eventi slegati.
        assertThat(ricorrenti.toLocalDate()).isEqualTo(mezzanotte.toLocalDate());
        assertThat(notifiche.toLocalDate()).isEqualTo(mezzanotte.toLocalDate());
    }

    /**
     * La generazione delle spese fisse e' mensile e deve cadere il primo del mese: e' il momento
     * in cui la transazione riepilogativa viene registrata, e la Dashboard la usa subito per
     * stimare il saldo residuo. Spostata a meta' mese, la stima resterebbe sbagliata per due
     * settimane ogni mese.
     */
    @Test
    void laGenerazioneDelleSpeseFisseCadeIlPrimoDelMese() throws Exception {
        String cron = cronDi(ExpenseReminderGenerationScheduler.class, "generateForCurrentMonth");

        LocalDateTime prossima = primaEsecuzioneDopo(cron, LocalDateTime.of(2026, 3, 10, 0, 0));

        assertThat(prossima.getDayOfMonth()).isEqualTo(1);
        assertThat(prossima.getMonthValue()).isEqualTo(4);
        // E dopo i job giornalieri dello stesso giorno, cosi' i promemoria sono gia' avanzati.
        assertThat(prossima.toLocalTime())
                .isAfter(primaEsecuzioneDopo(
                        cronDi(ExpenseReminderScheduler.class, "advanceDueReminders"),
                        LocalDateTime.of(2026, 4, 1, 0, 0)).toLocalTime());
    }

    @Test
    void iJobGiornalieriSiRipetonoOgniGiorno() throws Exception {
        String cron = cronDi(RecurringTransactionScheduler.class, "generateDueTransactions");
        LocalDateTime oggi = primaEsecuzioneDopo(cron, LocalDateTime.of(2026, 3, 10, 0, 0));

        LocalDateTime dopo = primaEsecuzioneDopo(cron, oggi);

        assertThat(dopo.toLocalDate()).isEqualTo(oggi.toLocalDate().plusDays(1));
        assertThat(dopo.toLocalTime()).isEqualTo(oggi.toLocalTime());
    }
}
