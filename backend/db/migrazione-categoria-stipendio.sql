-- ---------------------------------------------------------------------------
-- MySimpleEconomy — unione della categoria stipendio doppia
--
-- L'import bancario creava una categoria col nome della banca ("Stipendi e
-- pensioni") accanto a quella del profilo ("Stipendio"): due categorie per la
-- stessa cosa, e il calcolo del risparmio che cercava lo stipendio dove non
-- stava. Il comportamento è corretto da qui in avanti; questo script sistema
-- quello che è già stato importato.
--
-- Sposta tutto ciò che punta alla gemella sulla categoria del profilo e poi la
-- elimina. Non si perde nulla: le transazioni cambiano categoria, non
-- scompaiono.
--
-- Idempotente: dopo la prima esecuzione la gemella non esiste più e non c'è
-- altro da spostare.
--
-- Niente tabelle temporanee: l'editor SQL di Supabase esegue gli statement in
-- transazioni separate, e una tabella temporanea creata in uno non esiste più
-- in quello dopo. La coppia da unire si ricalcola quindi dentro ogni comando.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. VERIFICA — eseguilo da solo e guarda il risultato.
--    Se non restituisce righe non hai il problema, e non serve altro.
-- ---------------------------------------------------------------------------

SELECT tieni.name AS categoria_del_profilo,
       unisci.name AS categoria_da_unire,
       (SELECT count(*) FROM transactions t WHERE t.category_id = unisci.id)
           AS transazioni_da_spostare
FROM users u
JOIN recurring_transactions rt ON rt.id = u.salary_recurring_transaction_id
JOIN categories tieni ON tieni.id = rt.category_id
JOIN categories unisci
     ON unisci.user_id = u.id
    AND unisci.type = 'INCOME'
    AND unisci.id <> tieni.id
    AND (lower(unisci.name) LIKE '%stipend%' OR lower(unisci.name) LIKE '%salari%'
      OR lower(unisci.name) LIKE '%pension%' OR lower(unisci.name) LIKE '%retribuz%'
      OR lower(unisci.name) LIKE '%emolument%');


-- ---------------------------------------------------------------------------
-- 2. UNIONE — un comando solo, quindi o riesce tutto o non cambia niente.
--
--    `coppia` trova, per ogni utente, la categoria del profilo (quella della
--    regola ricorrente dello stipendio) e la gemella nata dall'import. Si
--    guarda solo fra le entrate: fra le uscite "previdenza" o "fondo pensione"
--    sono versamenti, non stipendi.
--
--    Vanno spostati tutti i riferimenti prima di eliminare la gemella: le
--    chiavi esterne sono in RESTRICT, e una sola dimenticanza farebbe fallire
--    l'eliminazione. Stando tutti nello stesso comando, i controlli di
--    integrità scattano alla fine, quando gli spostamenti sono già avvenuti.
-- ---------------------------------------------------------------------------

WITH coppia AS (
    SELECT rt.category_id AS tieni_id, unisci.id AS unisci_id
    FROM users u
    JOIN recurring_transactions rt ON rt.id = u.salary_recurring_transaction_id
    JOIN categories unisci
         ON unisci.user_id = u.id
        AND unisci.type = 'INCOME'
        AND unisci.id <> rt.category_id
        AND (lower(unisci.name) LIKE '%stipend%' OR lower(unisci.name) LIKE '%salari%'
          OR lower(unisci.name) LIKE '%pension%' OR lower(unisci.name) LIKE '%retribuz%'
          OR lower(unisci.name) LIKE '%emolument%')
),
sposta_transazioni AS (
    UPDATE transactions t SET category_id = c.tieni_id
    FROM coppia c WHERE t.category_id = c.unisci_id
    RETURNING 1
),
sposta_ricorrenti AS (
    UPDATE recurring_transactions r SET category_id = c.tieni_id
    FROM coppia c WHERE r.category_id = c.unisci_id
    RETURNING 1
),
sposta_promemoria AS (
    UPDATE expense_reminders e SET category_id = c.tieni_id
    FROM coppia c WHERE e.category_id = c.unisci_id
    RETURNING 1
),
sposta_debiti AS (
    UPDATE debts d SET category_id = c.tieni_id
    FROM coppia c WHERE d.category_id = c.unisci_id
    RETURNING 1
),
-- La mappatura salvata della banca: così il prossimo import manda lo stipendio
-- sulla categoria giusta senza richiedere nulla.
sposta_mappature AS (
    UPDATE bank_category_mappings b SET category_id = c.tieni_id
    FROM coppia c WHERE b.category_id = c.unisci_id
    RETURNING 1
),
-- Eventuali sottocategorie della gemella passano sotto quella del profilo.
sposta_sottocategorie AS (
    UPDATE categories s SET parent_id = c.tieni_id
    FROM coppia c WHERE s.parent_id = c.unisci_id
    RETURNING 1
)
DELETE FROM categories vittima
USING coppia c
WHERE vittima.id = c.unisci_id;
