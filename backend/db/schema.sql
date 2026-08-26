CREATE EXTENSION IF NOT EXISTS pgcrypto; -- per gen_random_uuid()

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    default_salary_amount NUMERIC(10,2) CHECK (default_salary_amount IS NULL OR default_salary_amount > 0),
    salary_day SMALLINT CHECK (salary_day IS NULL OR salary_day BETWEEN 1 AND 31),
    -- Avatar scelto da un set fisso (animali) offerto dall'app, non una foto
    -- caricata dall'utente: NULL = icona utente generica di default.
    avatar_key VARCHAR(30) CHECK (avatar_key IS NULL OR avatar_key IN
        ('cat', 'dog', 'rabbit', 'bird', 'fish', 'turtle', 'squirrel', 'panda', 'mouse', 'snail')),
    -- Sezione risparmio (opt-in): quota delle entrate del periodo da mettere
    -- da parte, come percentuale e non importo fisso, così si ricalcola da sola
    -- quando le entrate cambiano nel corso del mese.
    savings_enabled BOOLEAN NOT NULL DEFAULT false,
    savings_percent SMALLINT CHECK (savings_percent IS NULL OR savings_percent BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE category_type AS ENUM ('INCOME', 'EXPENSE');

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type category_type NOT NULL,
    color VARCHAR(7),
    icon VARCHAR(50),
    -- Sottocategorie a un solo livello (es. "Supermercato" sotto "Alimentari"):
    -- il vincolo "un figlio non può avere figli a sua volta" e quello sul tipo
    -- uguale al padre sono applicati in CategoryService, non qui. RESTRICT come
    -- le altre FK verso categories: un padre con figli non si cancella.
    parent_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE INDEX idx_categories_parent ON categories(parent_id);

CREATE TYPE interval_unit AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');

CREATE TABLE recurring_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    default_amount NUMERIC(10,2) NOT NULL CHECK (default_amount > 0),
    interval_unit interval_unit NOT NULL,
    interval_value SMALLINT NOT NULL DEFAULT 1 CHECK (interval_value > 0),
    start_date DATE NOT NULL,
    next_due_date DATE NOT NULL,
    end_date DATE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recurring_next_due ON recurring_transactions (next_due_date) WHERE active = true;

-- Aggiunta qui (non nella CREATE TABLE users più in alto) perché
-- recurring_transactions viene creata solo a questo punto del file. Collega
-- lo stipendio del profilo alla regola ricorrente che lo genera in automatico
-- (vedi ProfileService.syncSalaryRecurringTransaction), così un secondo
-- salvataggio aggiorna la stessa regola invece di crearne una nuova.
ALTER TABLE users ADD COLUMN salary_recurring_transaction_id UUID REFERENCES recurring_transactions(id) ON DELETE SET NULL;

CREATE TABLE recurring_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recurring_transaction_id UUID NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    override_amount NUMERIC(10,2) NOT NULL,
    note VARCHAR(255),
    UNIQUE (recurring_transaction_id, occurrence_date)
);

CREATE TYPE transaction_type AS ENUM ('INCOME', 'EXPENSE');

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    recurring_transaction_id UUID REFERENCES recurring_transactions(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL,
    type transaction_type NOT NULL,
    occurred_on DATE NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_user_date ON transactions (user_id, occurred_on);
CREATE INDEX idx_transactions_category ON transactions (category_id);

CREATE TABLE balance_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checkpoint_date DATE NOT NULL,
    balance NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, checkpoint_date)
);
CREATE INDEX idx_checkpoints_user_date ON balance_checkpoints (user_id, checkpoint_date DESC);

-- Debiti/finanziamenti: collegati a una categoria di spesa, l'importo pagato
-- non viene salvato qui, si calcola sempre sommando le transazioni EXPENSE
-- di quella categoria (più already_paid_amount, per debiti già in corso
-- prima di iniziare a tracciarli nell'app). active viene tenuto in sync
-- dal service ad ogni lettura in base al residuo calcolato.
CREATE TABLE debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount > 0),
    already_paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0
        CHECK (already_paid_amount >= 0 AND already_paid_amount <= total_amount),
    -- Confine tra "conteggiato in already_paid_amount" e "conteggiato dalle
    -- transazioni": solo le transazioni della categoria con occurred_on
    -- successivo a questa data vengono sommate sopra already_paid_amount,
    -- per non contare due volte spese storiche già incluse nel totale manuale.
    already_paid_as_of DATE CHECK (already_paid_as_of IS NULL OR already_paid_amount > 0),
    monthly_payment_amount NUMERIC(10,2) CHECK (monthly_payment_amount IS NULL OR monthly_payment_amount > 0),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Una categoria può avere al più un debito ATTIVO: indice unico parziale,
-- non un vincolo UNIQUE semplice, così un debito saldato (active=false)
-- libera la categoria per uno nuovo.
CREATE UNIQUE INDEX idx_debts_active_category ON debts (category_id) WHERE active;

-- Promemoria di spese fisse future: un promemoria di "cosa e quando" (bollo
-- auto, IMU, assicurazione...), con categoria e prezzo stimato opzionali.
-- Se hanno una categoria, il job di inizio mese può generare automaticamente
-- una transazione EXPENSE riepilogativa per il mese (vedi expense_reminder_id
-- su transactions).
CREATE TABLE expense_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    amount NUMERIC(10,2) CHECK (amount IS NULL OR amount > 0),
    interval_unit interval_unit NOT NULL,
    interval_value SMALLINT NOT NULL DEFAULT 1 CHECK (interval_value > 0),
    start_date DATE NOT NULL,
    next_due_date DATE NOT NULL,
    end_date DATE,
    active BOOLEAN NOT NULL DEFAULT true,
    notify_days_before SMALLINT CHECK (notify_days_before IS NULL OR notify_days_before >= 0),
    last_notified_due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expense_reminders_next_due ON expense_reminders (next_due_date) WHERE active = true;

-- Aggiunta qui (non nella CREATE TABLE transactions più sopra) perché
-- expense_reminders viene creata solo a questo punto del file.
ALTER TABLE transactions ADD COLUMN expense_reminder_id UUID REFERENCES expense_reminders(id) ON DELETE SET NULL;

-- Nota: il risparmio non ha tabelle proprie. È una grandezza derivata
-- (entrate - uscite del periodo), calcolata dalle transazioni già presenti:
-- non c'è nulla da accantonare a mano, quindi non c'è nulla da memorizzare.
-- L'unica impostazione persistita è la percentuale obiettivo, su users.

-- ---------------------------------------------------------------------------
-- Import dell'estratto conto della banca
-- ---------------------------------------------------------------------------

-- Tracciabilità delle transazioni arrivate da un import bancario. Serve a
-- riconoscere cosa è già stato importato quando lo stesso estratto conto viene
-- ripassato all'app aggiornato: l'export della banca non ha un identificativo
-- di transazione, quindi l'impronta è calcolata sul contenuto della riga.
ALTER TABLE transactions
    ADD COLUMN import_source VARCHAR(30),
    ADD COLUMN import_fingerprint VARCHAR(64),
    -- Movimento non ancora contabilizzato: la banca lo riscrive quando diventa
    -- definitivo (cambiano descrizione e a volte data), quindi la sua impronta
    -- è destinata a cambiare e va riabbinata al passaggio successivo.
    ADD COLUMN import_provisional BOOLEAN NOT NULL DEFAULT false;

-- Indice parziale: le transazioni scritte a mano hanno impronta NULL e non
-- devono essere vincolate fra loro.
CREATE UNIQUE INDEX ux_transactions_import
    ON transactions (user_id, import_fingerprint)
    WHERE import_fingerprint IS NOT NULL;

CREATE INDEX idx_transactions_provisional
    ON transactions (user_id, import_provisional)
    WHERE import_provisional;

-- Corrispondenza fra le categorie della banca e quelle dell'utente, così la
-- mappatura si fa una volta sola e gli import successivi sono automatici.
CREATE TABLE bank_category_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source VARCHAR(30) NOT NULL,
    bank_category VARCHAR(120) NOT NULL,
    -- Il tipo fa parte della chiave: un rimborso su una categoria di spesa
    -- arriva con segno positivo e va su una categoria di entrata.
    transaction_type transaction_type NOT NULL,
    -- NULL = "non importare" (es. i prelievi di contante, che non sono una
    -- spesa: i soldi si spendono dopo).
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, source, bank_category, transaction_type)
);
CREATE INDEX idx_bank_category_mappings_user ON bank_category_mappings (user_id, source);

-- Righe da non importare mai, riconosciute dal testo: giroconti verso sé
-- stessi e simili, che gonfierebbero le spese senza essere spese.
CREATE TABLE bank_import_exclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source VARCHAR(30) NOT NULL,
    -- Sottostringa cercata in "Operazione + Dettagli", senza distinzione di
    -- maiuscole. Niente espressioni regolari: deve poterla scrivere l'utente.
    pattern VARCHAR(200) NOT NULL,
    note VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, source, pattern)
);
CREATE INDEX idx_bank_import_exclusions_user ON bank_import_exclusions (user_id, source);
