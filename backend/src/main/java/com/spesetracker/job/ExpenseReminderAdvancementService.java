package com.spesetracker.job;

import com.spesetracker.model.ExpenseReminder;
import com.spesetracker.repository.ExpenseReminderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

// Avanza next_due_date dei promemoria scaduti. A differenza della generazione delle
// transazioni ricorrenti, qui non viene creato nulla: i promemoria sono solo
// informativi, quindi il job si limita a tenere aggiornato il puntatore alla
// prossima occorrenza.
@Service
@RequiredArgsConstructor
public class ExpenseReminderAdvancementService {

    private final ExpenseReminderRepository expenseReminderRepository;

    @Transactional
    public void advanceDueReminder(UUID reminderId, LocalDate today) {
        ExpenseReminder reminder = expenseReminderRepository.findById(reminderId).orElse(null);
        if (reminder == null) {
            return;
        }

        while (reminder.isCurrentlyActive(today) && !reminder.getNextDueDate().isAfter(today)) {
            reminder.advanceNextDueDate();
        }

        if (!reminder.isCurrentlyActive(today)) {
            reminder.setActive(false);
        }
    }
}
