package com.spesetracker.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Debito/finanziamento collegato a una categoria di spesa. L'importo pagato
// NON è un campo di questa entità: si calcola sommando le transazioni EXPENSE
// della categoria collegata (vedi DebtService), più alreadyPaidAmount per un
// debito già in corso prima di iniziare a tracciarlo nell'app.
@Entity
@Table(name = "debts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Debt {

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

    @Column(name = "total_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;

    @Column(name = "already_paid_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal alreadyPaidAmount;

    // Confine tra "conteggiato in alreadyPaidAmount" e "conteggiato dalle
    // transazioni": solo le transazioni con occurredOn successivo a questa
    // data vengono sommate sopra alreadyPaidAmount (vedi DebtService).
    @Column(name = "already_paid_as_of")
    private LocalDate alreadyPaidAsOf;

    @Column(name = "monthly_payment_amount", precision = 10, scale = 2)
    private BigDecimal monthlyPaymentAmount;

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
        if (this.alreadyPaidAmount == null) {
            this.alreadyPaidAmount = BigDecimal.ZERO;
        }
    }
}
