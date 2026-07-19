package com.spesetracker.job;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.repository.ExpenseReminderRepository;
import com.spesetracker.service.EmailNotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

// Invia l'email di preavviso per un promemoria, se oggi rientra nella sua
// finestra di notifica. lastNotifiedDueDate viene aggiornato solo dopo un
// invio riuscito: un invio fallito non deve "consumare" la notifica.
@Service
@RequiredArgsConstructor
public class ExpenseReminderNotificationService {

    private final ExpenseReminderRepository expenseReminderRepository;
    private final EmailNotificationService emailNotificationService;

    @Transactional
    public void notifyIfDue(UUID reminderId, LocalDate today) {
        ExpenseReminder reminder = expenseReminderRepository.findById(reminderId).orElse(null);
        if (reminder == null || !reminder.shouldNotify(today)) {
            return;
        }

        emailNotificationService.sendReminderNotification(reminder.getUser(), reminder);
        reminder.setLastNotifiedDueDate(reminder.getNextDueDate());
    }
}
