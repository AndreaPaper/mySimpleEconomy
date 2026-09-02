package com.spesetracker;

import com.spesetracker.model.enums.TransactionType;
import com.spesetracker.service.bankimport.SalaryCategoryResolver;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

// Il riconoscimento della categoria con cui la banca chiama l'accredito dello
// stipendio. Serve perche' il profilo cerca una categoria chiamata "Stipendio"
// mentre Intesa la chiama "Stipendi e pensioni": senza questo aggancio nascevano
// due categorie per la stessa cosa, e il calcolo del risparmio non trovava lo
// stipendio dove se lo aspettava (contandolo due volte, vedi savings.ts).
//
// Unit test puro come SalaryPeriodsTest: il riconoscimento non tocca il database,
// e il resolver e' usato in due punti diversi dell'import.
class SalaryCategoryResolverTest {

    // Il costruttore vuole UserRepository solo per l'altra sua funzione
    // (profileSalaryCategory), che qui non si esercita: il riconoscimento del
    // nome non ha dipendenze.
    private final SalaryCategoryResolver resolver = new SalaryCategoryResolver(null);

    @Test
    void riconosceLeCategorieConCuiLeBancheChiamanoLAccredito() {
        assertThat(resolver.looksLikeSalary("Stipendi e pensioni", TransactionType.INCOME)).isTrue();
        assertThat(resolver.looksLikeSalary("Stipendio", TransactionType.INCOME)).isTrue();
        assertThat(resolver.looksLikeSalary("Salari", TransactionType.INCOME)).isTrue();
        assertThat(resolver.looksLikeSalary("Retribuzione mensile", TransactionType.INCOME)).isTrue();
        assertThat(resolver.looksLikeSalary("Emolumenti", TransactionType.INCOME)).isTrue();
    }

    @Test
    void ilRiconoscimentoIgnoraMaiuscoleEMinuscole() {
        assertThat(resolver.looksLikeSalary("STIPENDI E PENSIONI", TransactionType.INCOME)).isTrue();
        assertThat(resolver.looksLikeSalary("stipendi e pensioni", TransactionType.INCOME)).isTrue();
    }

    // Il motivo per cui il riconoscimento guarda il tipo e non solo il nome: fra
    // le uscite "previdenza" e "fondo pensione" sono versamenti, non stipendi, e
    // mapparli sulla categoria dello stipendio falserebbe le entrate.
    @Test
    void fraLeUsciteNessunNomeValeComeStipendio() {
        assertThat(resolver.looksLikeSalary("Stipendi e pensioni", TransactionType.EXPENSE)).isFalse();
        assertThat(resolver.looksLikeSalary("Previdenza complementare", TransactionType.EXPENSE)).isFalse();
        assertThat(resolver.looksLikeSalary("Fondo pensione", TransactionType.EXPENSE)).isFalse();
    }

    @Test
    void unaCategoriaCheNonParlaDiStipendioNonVieneRiconosciuta() {
        assertThat(resolver.looksLikeSalary("Bonifici in entrata", TransactionType.INCOME)).isFalse();
        assertThat(resolver.looksLikeSalary("Rimborsi", TransactionType.INCOME)).isFalse();
        assertThat(resolver.looksLikeSalary("Generi alimentari e supermercato", TransactionType.INCOME)).isFalse();
    }

    @Test
    void nomeAssenteOVuotoNonEUnoStipendio() {
        assertThat(resolver.looksLikeSalary(null, TransactionType.INCOME)).isFalse();
        assertThat(resolver.looksLikeSalary("", TransactionType.INCOME)).isFalse();
    }
}
