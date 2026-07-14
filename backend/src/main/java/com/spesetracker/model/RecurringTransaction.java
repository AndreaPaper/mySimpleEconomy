package com.spesetracker.model;

import com.spesetracker.model.enums.IntervalUnit;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "recurring_transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecurringTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(name = "default_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal defaultAmount;

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

    /**
     * Avanza next_due_date in base a interval_unit/interval_value.
     * Va invocato dal job schedulato subito dopo aver generato
     * la transazione corrispondente alla scadenza corrente.
     */
    public void advanceNextDueDate() {
        this.nextDueDate = addInterval(this.nextDueDate);
    }

    /**
     * Versione pura (senza side effect) di advanceNextDueDate, usata dal motore
     * di previsione per proiettare le occorrenze future senza mutare la regola.
     */
    public LocalDate addInterval(LocalDate date) {
        return switch (this.intervalUnit) {
            case DAY -> date.plusDays(this.intervalValue);
            case WEEK -> date.plusWeeks(this.intervalValue);
            case MONTH -> date.plusMonths(this.intervalValue);
            case YEAR -> date.plusYears(this.intervalValue);
        };
    }

    /**
     * Vero se questa regola è ancora attiva e non ha superato end_date.
     */
    public boolean isCurrentlyActive(LocalDate today) {
        return Boolean.TRUE.equals(this.active)
                && (this.endDate == null || !this.endDate.isBefore(today));
    }
}
