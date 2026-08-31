package com.spesetracker.model;

import com.spesetracker.model.enums.BankSource;
import com.spesetracker.model.enums.TransactionType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    // Nullo per le transazioni inserite manualmente,
    // valorizzato per quelle generate dal job delle transazioni ricorrenti.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recurring_transaction_id")
    private RecurringTransaction recurringTransaction;

    // Nullo per le transazioni inserite manualmente, valorizzato per quelle
    // generate dal job di inizio mese a partire da un promemoria.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expense_reminder_id")
    private ExpenseReminder expenseReminder;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(nullable = false, length = 20)
    private TransactionType type;

    @Column(name = "occurred_on", nullable = false)
    private LocalDate occurredOn;

    @Column(length = 255)
    private String description;

    // Tracciabilità dell'import bancario. Null su tutto ciò che è stato scritto
    // a mano: l'impronta serve a riconoscere le righe già importate quando lo
    // stesso estratto conto viene ripassato aggiornato.
    @Enumerated(EnumType.STRING)
    @Column(name = "import_source", length = 30)
    private BankSource importSource;

    @Column(name = "import_fingerprint", length = 64)
    private String importFingerprint;

    // Movimento non ancora contabilizzato dalla banca: la sua impronta è
    // destinata a cambiare quando diventa definitivo, quindi va riabbinato.
    @Column(name = "import_provisional", nullable = false)
    private Boolean importProvisional;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = Instant.now();
        if (this.importProvisional == null) {
            this.importProvisional = false;
        }
    }
}
