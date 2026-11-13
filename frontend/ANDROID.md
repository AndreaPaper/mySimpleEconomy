# L'app per il telefono (Android, dati solo in locale)

La stessa web app, impacchettata con Capacitor, con un backend in TypeScript al
posto di quello Spring (`src/local/`) e il database SQLite dentro il telefono.
Nessun server, nessun account: i dati non escono dal telefono se non con un
backup fatto a mano.

Tutto quello che segue si lancia dalla cartella `frontend`.

## Provarla senza telefono

```bash
npm run dev:local
```

Apre l'app in modalità locale nel browser (porta 5174): stesso backend locale,
con il database in IndexedDB invece che sul telefono.

## APK di prova

```powershell
.\scripts\build-apk.ps1
```

Produce `android\app\build\outputs\apk\debug\app-debug.apk`. Serve per provarla
su un telefono o un emulatore: **non darlo a chi la usa**, perché è firmato con
una chiave di prova diversa su ogni computer, e un APK di rilascio non si
installerebbe sopra.

## La chiave di firma

Android installa un aggiornamento sopra l'app solo se è firmato con la **stessa
chiave** della versione installata. Se la chiave si perde, l'unico modo di
aggiornare è disinstallare, e disinstallando si perdono i dati del telefono
(salvo un backup). Quindi la chiave si crea una volta sola e si custodisce.

### Crearla (una volta)

Fuori dal repository, ad esempio in `Documenti\MyEconomy-firma`:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v `
  -keystore "$HOME\Documents\MyEconomy-firma\myeconomy.jks" `
  -alias myeconomy -keyalg RSA -keysize 2048 -validity 10000
```

Chiede una password e qualche dato (nome, città: non contano). Poi crea
`frontend\android\keystore.properties`:

```properties
storeFile=C:/Users/<tu>/Documents/MyEconomy-firma/myeconomy.jks
storePassword=<la password>
keyAlias=myeconomy
keyPassword=<la password>
```

Il file `.jks` e `keystore.properties` sono ignorati da git: non finiscono mai
su GitHub.

### Custodirla

- La password in un gestore di password.
- Una seconda copia del file `.jks` fuori dal computer (una chiavetta, o un
  cloud tuo). Un disco rotto non deve costare i dati della tua amica.

## APK di rilascio

```powershell
.\scripts\build-apk.ps1 -Release
```

Produce `android\app\build\outputs\apk\release\app-release.apk`, firmato con la
tua chiave. Lo mandi a lei (WhatsApp, Drive, email); la prima volta il telefono
le chiede di permettere l'installazione da quella app ("origini sconosciute").

## Aggiornamenti

```powershell
.\scripts\publish-apk.ps1
```

Costruisce l'APK firmato e lo pubblica come release di GitHub
(`android-v<numero>`, file `myeconomy.apk`), con le novità prese dai titoli dei
commit. Alla prossima apertura l'app sul telefono mostra "È disponibile la
versione…": con "Aggiorna" lo scarica e apre l'installazione di Android. La
prima volta Android le chiede di permettere a MyEconomy di installare app.
**I dati restano.**

Prima di lanciarlo:
- una volta sola, collega GitHub CLI al tuo account: `gh auth login`;
- fai commit e push: lo script si ferma se ci sono modifiche non committate o
  se il commit non è ancora su GitHub, e se la versione è già pubblicata
  (serve almeno un commit nuovo).

L'app chiede a GitHub l'elenco delle release, al massimo una volta l'ora: nella
richiesta non c'è nessun suo dato. E Android installa un aggiornamento solo se
è firmato con la tua chiave, quindi nessun altro può pubblicarne uno al posto
tuo.

Si può ancora mandare l'APK a mano (`.\scripts\build-apk.ps1 -Release`):
anche così si installa sopra la versione vecchia.

Il numero di versione cresce da solo: è il numero di commit del ramo. Costruisci
sempre dall'ultimo `develop`: un APK costruito da un commit più vecchio avrebbe
un numero più basso, e Android lo rifiuterebbe come "versione precedente".

Non cambiare mai l'`appId` (`it.mysimpleeconomy.locale`, in
`capacitor.config.ts`): per Android sarebbe un'altra app, installata accanto,
con i dati vuoti.

## Il backup

In Impostazioni → Backup: "Esporta backup" crea un file `.json` e apre
Condividi (Drive, email…); "Ripristina un backup" lo ricarica, mostrando prima
cosa contiene e cosa sostituisce. Consiglia alla tua amica di farne uno ogni
tanto, e sempre prima di cambiare telefono o disinstallare.

## Le due logiche

La logica dell'app esiste due volte: in Java (`backend/`) per la web app, in
TypeScript (`src/local/`) per il telefono. Una correzione alla logica Java si
chiude solo quando c'è anche quella TypeScript, con il suo test in
`src/local/parity/`: lì gli scenari dei test Java girano contro il backend
locale.

Nel telefono manca, per scelta, l'import dell'estratto conto Intesa Sanpaolo:
per la tua amica andrà scritto quello della sua banca.
