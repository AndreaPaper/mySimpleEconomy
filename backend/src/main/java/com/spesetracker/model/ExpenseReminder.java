package com.spesetracker.model;

import com.spesetracker.model.enums.IntervalUnit;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Promemoria di una spesa fissa futura, senza importo: serve solo a sapere "cosa e
// quando" (es. bollo auto, assicurazione, IMU) per capire quali mesi avranno più
// scadenze fisse. A differenza di RecurringTransaction non genera transazioni.
@Entity
@Table(name = "expense_reminders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExpenseReminder {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 150)
    private String name;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "interval_unit", nullable = false, length = 10)
    private IntervalUnit intervalUnit;

    @Column(name = "interval_value", nullable = false)
    private Short intervalValue;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "next_due_date", nullable = false)
    private LocalDate nextDueDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(nullable = false)
    private Boolean active;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
        if (this.active == null) {
            this.active = true;
        }
        if (this.intervalValue == null) {
            this.intervalValue = 1;
        }
    }

    public void advanceNextDueDate() {
        this.nextDueDate = addInterval(this.nextDueDate);
    }

    // Versione pura, usata per proiettare le prossime occorrenze senza mutare l'entità.
    public LocalDate addInterval(LocalDate date) {
        return switch (this.intervalUnit) {
            case DAY -> date.plusDays(this.intervalValue);
            case WEEK -> date.plusWeeks(this.intervalValue);
            case MONTH -> date.plusMonths(this.intervalValue);
            case YEAR -> date.plusYears(this.intervalValue);
        };
    }

    public boolean isCurrentlyActive(LocalDate today) {
        return Boolean.TRUE.equals(this.active)
                && (this.endDate == null || !this.endDate.isBefore(today));
    }
}
