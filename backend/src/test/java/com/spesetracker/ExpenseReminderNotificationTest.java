package com.spesetracker;

import com.spesetracker.job.ExpenseReminderNotificationService;
import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.repository.ExpenseReminderRepository;
import com.spesetracker.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * L'email di preavviso di un promemoria. Il servizio è tre righe, ma decide due cose che
 * l'utente non può verificare da sé: che l'avviso arrivi, e che arrivi <em>una volta sola</em>.
 *
 * <p>Le date sono tutte fisse e passate esplicitamente al job invece di usare {@code LocalDate.now()}:
 * un test sulle finestre temporali che dipende dal giorno in cui gira è un test che prima o poi
 * fallisce da solo.
 */
class ExpenseReminderNotificationTest extends AbstractIntegrationTest {

    private static final LocalDate SCADENZA = LocalDate.of(2026, 6, 10);

    @Autowired
    private ExpenseReminderNotificationService notificationService;

    @Autowired
    private ExpenseReminderRepository expenseReminderRepository;

    /** Un promemoria con preavviso, scadenza fissa e nessuna notifica ancora inviata. */
    private UUID reminderConPreavviso(int giorniDiPreavviso) throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        return UUID.fromString(api.createReminder(
                token, categoryId, "Bollo auto", SCADENZA, "MONTH", 1, giorniDiPreavviso, null, null));
    }

    private ExpenseReminder ricarica(UUID id) {
        return expenseReminderRepository.findById(id).orElseThrow();
    }

    @Test
    void primaDellaFinestraNonInviaNulla() throws Exception {
        UUID id = reminderConPreavviso(3);

        notificationService.notifyIfDue(id, SCADENZA.minusDays(4));

        verify(emailNotificationService, never()).sendReminderNotification(any(), any());
        assertThat(ricarica(id).getLastNotifiedDueDate()).isNull();
    }

    @Test
    void dentroLaFinestraInviaESegnaLaScadenza() throws Exception {
        UUID id = reminderConPreavviso(3);

        notificationService.notifyIfDue(id, SCADENZA.minusDays(2));

        verify(emailNotificationService, times(1)).sendReminderNotification(any(), any());
        assertThat(ricarica(id).getLastNotifiedDueDate()).isEqualTo(SCADENZA);
    }

    // I due estremi della finestra sono inclusi: il primo giorno di preavviso e il giorno
    // stesso della scadenza. Sono i due punti in cui un `isBefore` scambiato con un
    // `isAfter` non si noterebbe.
    @Test
    void gliEstremiDellaFinestraSonoCompresi() throws Exception {
        UUID primoGiorno = reminderConPreavviso(3);
        UUID giornoDellaScadenza = reminderConPreavviso(3);

        notificationService.notifyIfDue(primoGiorno, SCADENZA.minusDays(3));
        notificationService.notifyIfDue(giornoDellaScadenza, SCADENZA);

        verify(emailNotificationService, times(2)).sendReminderNotification(any(), any());
    }

    @Test
    void unaSecondaEsecuzioneNonReinviaLaStessaNotifica() throws Exception {
        UUID id = reminderConPreavviso(3);

        notificationService.notifyIfDue(id, SCADENZA.minusDays(2));
        notificationService.notifyIfDue(id, SCADENZA.minusDays(1));

        verify(emailNotificationService, times(1)).sendReminderNotification(any(), any());
    }

    // Quello che segna la notifica è la scadenza, non la data di invio: quando il
    // promemoria avanza alla ricorrenza successiva l'avviso deve ripartire.
    @Test
    void dopoLAvanzamentoLaNotificaRiparte() throws Exception {
        UUID id = reminderConPreavviso(3);
        notificationService.notifyIfDue(id, SCADENZA.minusDays(2));

        ExpenseReminder reminder = ricarica(id);
        reminder.advanceNextDueDate();
        expenseReminderRepository.save(reminder);
        LocalDate prossimaScadenza = reminder.getNextDueDate();

        notificationService.notifyIfDue(id, prossimaScadenza.minusDays(1));

        verify(emailNotificationService, times(2)).sendReminderNotification(any(), any());
        assertThat(ricarica(id).getLastNotifiedDueDate()).isEqualTo(prossimaScadenza);
    }

    // Una finestra saltata (server spento) non si recupera: passata la scadenza l'avviso
    // sarebbe solo rumore, e il job di avanzamento sposterà comunque il promemoria avanti.
    @Test
    void unaFinestraGiaPassataNonSiRecupera() throws Exception {
        UUID id = reminderConPreavviso(3);

        notificationService.notifyIfDue(id, SCADENZA.plusDays(1));

        verify(emailNotificationService, never()).sendReminderNotification(any(), any());
        assertThat(ricarica(id).getLastNotifiedDueDate()).isNull();
    }

    @Test
    void senzaPreavvisoConfiguratoNonInviaMai() throws Exception {
        String token = api.registerAndLogin();
        String categoryId = api.createExpenseCategory(token);
        UUID id = UUID.fromString(api.createReminder(token, categoryId, "Bollo auto", SCADENZA));

        notificationService.notifyIfDue(id, SCADENZA);

        verify(emailNotificationService, never()).sendReminderNotification(any(), any());
    }

    /**
     * Il motivo per cui questo test esiste, ed è dichiarato nel commento del servizio: un invio
     * fallito non deve "consumare" la notifica. Se {@code lastNotifiedDueDate} venisse segnato
     * comunque, l'esecuzione del giorno dopo salterebbe il promemoria e l'utente non
     * riceverebbe mai l'avviso — senza che nulla, da nessuna parte, lo segnali.
     *
     * <p>L'asserzione è deliberatamente sull'<em>esecuzione successiva</em> e non solo sul campo
     * lasciato a null: oggi la garanzia arriva dal rollback della transazione, quindi anche
     * scrivendo il campo prima dell'invio il campo resterebbe comunque null e un test che si
     * fermasse lì passerebbe senza provare nulla. Quello che conta per chi usa l'app è che
     * l'avviso arrivi lo stesso il giorno dopo, ed è questo che qui si verifica: così il test
     * fallisce anche se qualcuno "irrobustisce" il job inghiottendo l'eccezione.
     */
    @Test
    void unInvioFallitoNonConsumaLaNotifica() throws Exception {
        UUID id = reminderConPreavviso(3);
        doThrow(new RuntimeException("Resend non risponde"))
                .when(emailNotificationService).sendReminderNotification(any(), any());

        assertThatThrownBy(() -> notificationService.notifyIfDue(id, SCADENZA.minusDays(2)))
                .isInstanceOf(RuntimeException.class);
        assertThat(ricarica(id).getLastNotifiedDueDate()).isNull();

        // Il giorno dopo il servizio di posta è tornato su: l'avviso deve partire.
        doNothing().when(emailNotificationService).sendReminderNotification(any(), any());
        notificationService.notifyIfDue(id, SCADENZA.minusDays(1));

        verify(emailNotificationService, times(2)).sendReminderNotification(any(), any());
        assertThat(ricarica(id).getLastNotifiedDueDate()).isEqualTo(SCADENZA);
    }
}
