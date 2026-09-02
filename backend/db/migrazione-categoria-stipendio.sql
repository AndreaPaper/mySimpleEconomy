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
-- PRIMA DI ESEGUIRLO, guarda cosa toccherà con la query qui sotto: se non
-- restituisce righe, non hai il problema e non serve lanciare nulla.
--
--   SELECT tieni.name AS categoria_del_profilo,
--          unisci.name AS categoria_da_unire,
--          (SELECT count(*) FROM transactions t WHERE t.category_id = unisci.id)
--              AS transazioni_da_spostare
--   FROM users u
--   JOIN recurring_transactions rt ON rt.id = u.salary_recurring_transaction_id
--   JOIN categories tieni ON tieni.id = rt.category_id
--   JOIN categories unisci
--        ON unisci.user_id = u.id
--       AND unisci.type = 'INCOME'
--       AND unisci.id <> tieni.id
--       AND (lower(unisci.name) LIKE '%stipend%' OR lower(unisci.name) LIKE '%salari%'
--         OR lower(unisci.name) LIKE '%pension%' OR lower(unisci.name) LIKE '%retribuz%'
--         OR lower(unisci.name) LIKE '%emolument%');
-- ---------------------------------------------------------------------------

BEGIN;

-- La coppia da unire, per ogni utente: `tieni` è la categoria collegata al
-- profilo (quella della regola ricorrente dello stipendio), `unisci` è la
-- gemella nata dall'import. Si guarda solo fra le entrate: fra le uscite
-- "previdenza" o "fondo pensione" sono versamenti, non stipendi.
CREATE TEMP TABLE unione_stipendio ON COMMIT DROP AS
SELECT u.id AS user_id, tieni.id AS tieni_id, unisci.id AS unisci_id
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

-- Tutto quello che punta alla gemella passa sulla categoria del profilo. Vanno
-- spostati tutti i riferimenti prima di eliminarla: le chiavi esterne sono in
-- RESTRICT, quindi una sola dimenticanza farebbe fallire l'eliminazione (e con
-- essa l'intera transazione, senza lasciare mezzo lavoro).
UPDATE transactions t SET category_id = m.tieni_id
FROM unione_stipendio m WHERE t.category_id = m.unisci_id;

UPDATE recurring_transactions r SET category_id = m.tieni_id
FROM unione_stipendio m WHERE r.category_id = m.unisci_id;

UPDATE expense_reminders e SET category_id = m.tieni_id
FROM unione_stipendio m WHERE e.category_id = m.unisci_id;

UPDATE debts d SET category_id = m.tieni_id
FROM unione_stipendio m WHERE d.category_id = m.unisci_id;

-- La mappatura salvata della banca: così il prossimo import manda lo stipendio
-- direttamente sulla categoria giusta senza richiedere nulla.
UPDATE bank_category_mappings b SET category_id = m.tieni_id
FROM unione_stipendio m WHERE b.category_id = m.unisci_id;

-- Eventuali sottocategorie della gemella passano sotto quella del profilo.
UPDATE categories c SET parent_id = m.tieni_id
FROM unione_stipendio m WHERE c.parent_id = m.unisci_id;

DELETE FROM categories c USING unione_stipendio m WHERE c.id = m.unisci_id;

COMMIT;
