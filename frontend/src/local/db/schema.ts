// Lo schema del database locale, come elenco di migrazioni.
//
// È lo specchio di backend/db/schema.sql, con tre differenze volute:
//
// - Niente user_id: sul telefono c'è un solo utente. Il profilo (che sul server
//   è la tabella users) è una tabella di una riga sola.
// - Gli importi sono INTEGER in centesimi. Il backend usa NUMERIC/BigDecimal; in
//   JavaScript i decimali in virgola mobile sbagliano le somme (0,1 + 0,2), e i
//   centesimi interi no. La conversione da e verso euro avviene solo ai bordi,
//   dove le API ricevono e restituiscono JSON.
// - Le date sono TEXT 'AAAA-MM-GG' e gli istanti TEXT ISO-8601: SQLite non ha tipi
//   data, e le stringhe in quel formato si confrontano e si ordinano correttamente.
//
// Ogni elemento dell'elenco è una migrazione, applicata una volta sola e in ordine
// (PRAGMA user_version tiene il conto). Un aggiornamento dell'app che cambia lo
// schema aggiunge una migrazione in fondo, e non modifica mai quelle già uscite:
// sul telefono ci sono i dati, e vanno portati avanti, non ricreati.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nickname TEXT,
      default_salary_amount INTEGER CHECK (default_salary_amount IS NULL OR default_salary_amount > 0),
      salary_day INTEGER CHECK (salary_day IS NULL OR salary_day BETWEEN 1 AND 31),
      avatar_key TEXT,
      savings_enabled INTEGER NOT NULL DEFAULT 0,
      savings_percent INTEGER CHECK (savings_percent IS NULL OR savings_percent BETWEEN 0 AND 100),
      salary_recurring_transaction_id TEXT REFERENCES recurring_transactions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
  );

  CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
      color TEXT,
      icon TEXT,
      parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
  );
  CREATE INDEX idx_categories_parent ON categories(parent_id);

  CREATE TABLE recurring_transactions (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      default_amount INTEGER NOT NULL CHECK (default_amount > 0),
      interval_unit TEXT NOT NULL CHECK (interval_unit IN ('DAY', 'WEEK', 'MONTH', 'YEAR')),
      interval_value INTEGER NOT NULL DEFAULT 1 CHECK (interval_value > 0),
      start_date TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      end_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
  );
  CREATE INDEX idx_recurring_next_due ON recurring_transactions (next_due_date) WHERE active = 1;

  CREATE TABLE recurring_overrides (
      id TEXT PRIMARY KEY,
      recurring_transaction_id TEXT NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
      occurrence_date TEXT NOT NULL,
      override_amount INTEGER NOT NULL,
      note TEXT,
      UNIQUE (recurring_transaction_id, occurrence_date)
  );

  CREATE TABLE expense_reminders (
      id TEXT PRIMARY KEY,
      category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      amount INTEGER CHECK (amount IS NULL OR amount > 0),
      interval_unit TEXT NOT NULL CHECK (interval_unit IN ('DAY', 'WEEK', 'MONTH', 'YEAR')),
      interval_value INTEGER NOT NULL DEFAULT 1 CHECK (interval_value > 0),
      start_date TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      end_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      notify_days_before INTEGER CHECK (notify_days_before IS NULL OR notify_days_before >= 0),
      last_notified_due_date TEXT,
      created_at TEXT NOT NULL
  );
  CREATE INDEX idx_expense_reminders_next_due ON expense_reminders (next_due_date) WHERE active = 1;

  CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      recurring_transaction_id TEXT REFERENCES recurring_transactions(id) ON DELETE SET NULL,
      expense_reminder_id TEXT REFERENCES expense_reminders(id) ON DELETE SET NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
      occurred_on TEXT NOT NULL,
      description TEXT,
      -- Per l'import dalla banca, che in locale arriverà più avanti con un
      -- lettore per un'altra banca: stesse colonne del server, già pronte.
      import_source TEXT,
      import_fingerprint TEXT,
      import_provisional INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
  );
  CREATE INDEX idx_transactions_date ON transactions (occurred_on);
  CREATE INDEX idx_transactions_category ON transactions (category_id);
  CREATE UNIQUE INDEX ux_transactions_import ON transactions (import_fingerprint)
      WHERE import_fingerprint IS NOT NULL;

  CREATE TABLE balance_checkpoints (
      id TEXT PRIMARY KEY,
      checkpoint_date TEXT NOT NULL UNIQUE,
      balance INTEGER NOT NULL,
      counts_from TEXT,
      created_at TEXT NOT NULL
  );

  CREATE TABLE debts (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      total_amount INTEGER NOT NULL CHECK (total_amount > 0),
      already_paid_amount INTEGER NOT NULL DEFAULT 0
          CHECK (already_paid_amount >= 0 AND already_paid_amount <= total_amount),
      already_paid_as_of TEXT CHECK (already_paid_as_of IS NULL OR already_paid_amount > 0),
      monthly_payment_amount INTEGER CHECK (monthly_payment_amount IS NULL OR monthly_payment_amount > 0),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_debts_active_category ON debts (category_id) WHERE active = 1;

  CREATE TABLE bank_category_mappings (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      bank_category TEXT NOT NULL,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('INCOME', 'EXPENSE')),
      category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (source, bank_category, transaction_type)
  );

  CREATE TABLE bank_import_exclusions (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      pattern TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (source, pattern)
  );
  `,
]
