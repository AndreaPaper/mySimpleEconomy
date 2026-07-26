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
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

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

-- Promemoria di spese fisse future, senza importo: solo un promemoria di "cosa e quando",
-- per capire quali mesi avranno più uscite fisse. Non genera transazioni né importi.
CREATE TABLE expense_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
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
