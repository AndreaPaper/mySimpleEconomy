# Guida al deploy di MySimpleEconomy (Neon + Render + Vercel)

Questa guida copre i passaggi che devi fare tu (creazione account, configurazione dashboard) — non posso creare account o autenticarmi al posto tuo. Dove serve, dimmi cosa hai ottenuto (URL, connection string) e continuo io da lì (push del codice, verifiche).

## 0. GitHub (prerequisito per Render e Vercel)

1. Vai su [github.com/new](https://github.com/new) e crea un repository vuoto (es. `spesometro`), **senza** inizializzarlo con README/gitignore (il progetto esiste già in locale).
2. Copia l'URL del repository (es. `https://github.com/tuo-utente/spesometro.git`).
3. Dimmi l'URL: eseguo io `git remote add origin ...` e il push dei branch `develop`/`main`.

## 1. Neon (database Postgres)

1. Vai su [neon.tech](https://neon.tech) e crea un account (free tier, nessuna carta richiesta).
2. Crea un nuovo progetto (es. `spesometro`), regione a scelta.
3. Nella dashboard del progetto, apri **Connection Details** e copia:
   - Host (es. `ep-xxx-xxx.eu-central-1.aws.neon.tech`)
   - Database name (di solito `neondb`, puoi rinominarlo)
   - Username e Password
4. Apri l'**SQL Editor** di Neon e incolla il contenuto di [`backend/db/schema.sql`](backend/db/schema.sql) di questo repo, poi eseguilo. Crea tutte le tabelle/tipi/indici.
5. Costruisci i valori che serviranno a Render (vedi sezione 2):
   - `DATABASE_URL` = `jdbc:postgresql://<host>/<database>?sslmode=require`
   - `DATABASE_USERNAME` = lo username Neon
   - `DATABASE_PASSWORD` = la password Neon

**Dimmi quando hai fatto questo passaggio** (non serve condividere la password con me in chiaro — puoi anche solo confermare "fatto" e inserire i valori direttamente su Render al passaggio successivo).

## 2. Render (backend Spring Boot)

1. Vai su [render.com](https://render.com), crea un account, collega il tuo GitHub.
2. **New > Web Service**, seleziona il repository `spesometro`.
3. Configurazione:
   - **Root Directory**: `backend`
   - **Runtime**: Docker (Render rileva automaticamente `backend/Dockerfile`)
   - **Instance Type**: Free
4. **Environment Variables** (Settings > Environment):
   | Nome | Valore |
   |---|---|
   | `DATABASE_URL` | `jdbc:postgresql://<host-neon>/<db>?sslmode=require` |
   | `DATABASE_USERNAME` | username Neon |
   | `DATABASE_PASSWORD` | password Neon |
   | `JWT_SECRET` | una stringa casuale di **almeno 32 caratteri** (es. generata con `openssl rand -base64 48`) |
   | `CORS_ALLOWED_ORIGINS` | per ora `http://localhost:5173` — la aggiorneremo con l'URL Vercel una volta noto |
5. Crea il servizio. Il primo deploy richiede qualche minuto (build Docker + Maven). Nota: il free tier si "addormenta" dopo 15 minuti di inattività (cold start 30-60s alla richiesta successiva) — comportamento atteso e accettato per uso personale.
6. A build completata, Render assegna un URL tipo `https://spesometro-backend.onrender.com`. **Dimmi questo URL.**

## 3. Vercel (frontend React)

1. Vai su [vercel.com](https://vercel.com), crea un account, collega GitHub.
2. **Add New > Project**, seleziona il repository `spesometro`.
3. Configurazione:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite (rilevato automaticamente)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `dist` (default)
4. **Environment Variables**:
   | Nome | Valore |
   |---|---|
   | `VITE_API_BASE_URL` | `https://spesometro-backend.onrender.com/api` (usa l'URL Render del passaggio 2, con `/api` in fondo) |
5. Deploy. Vercel assegna un URL tipo `https://spesometro-tuo-utente.vercel.app`. **Dimmi questo URL.**

## 4. Ultimo collegamento: CORS

Una volta noto l'URL Vercel, torna su Render (Settings > Environment) e aggiorna:
- `CORS_ALLOWED_ORIGINS` = `https://spesometro-tuo-utente.vercel.app`

Render rifà il deploy automaticamente al salvataggio della variabile.

## 5. Verifica finale

Apri l'URL Vercel nel browser, registra un utente, prova a creare una categoria/transazione. Il primo caricamento potrebbe richiedere 30-60s per il cold start di Render.

---

**Cosa mandarmi mano a mano che procedi:**
- URL del repository GitHub (per il push)
- Conferma di aver eseguito `schema.sql` su Neon
- URL assegnato da Render
- URL assegnato da Vercel

Con questi possiamo completare il collegamento CORS e fare una verifica finale insieme.
