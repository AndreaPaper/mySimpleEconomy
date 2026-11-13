# Pubblica un aggiornamento dell'app per il telefono: costruisce l'APK firmato e lo
# carica come release di GitHub ("android-v<numero di versione>", file "myeconomy.apk").
# All'apertura successiva l'app sul telefono lo trova e propone di installarlo
# (src/local/appUpdate.ts).
#
#   .\scripts\publish-apk.ps1
#
# Serve, una volta sola: gh auth login (GitHub CLI). E la chiave di firma, come per
# build-apk.ps1 -Release (vedi ANDROID.md).
$ErrorActionPreference = 'Continue'
$frontend = Split-Path -Parent $PSScriptRoot
$repo = 'AndreaPaper/mySimpleEconomy'

gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw "GitHub CLI non e' collegato al tuo account: lancia una volta 'gh auth login'." }

# La release punta al commit da cui e' costruito l'APK: deve essere gia' su GitHub.
$head = (git -C $frontend rev-parse HEAD).Trim()
git -C $frontend fetch -q origin
$onRemote = git -C $frontend branch -r --contains $head
if (-not $onRemote) { throw "Il commit attuale non e' ancora su GitHub: fai push, poi riprova." }
if (git -C $frontend status --porcelain) { throw "Ci sono modifiche non committate: l'APK non corrisponderebbe a nessun commit." }

& (Join-Path $PSScriptRoot 'build-apk.ps1') -Release
if ($LASTEXITCODE -ne 0) { throw 'Build non riuscita' }

$apk = Join-Path $frontend 'android\app\build\outputs\apk\release\app-release.apk'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$aapt = Get-ChildItem (Join-Path $sdk 'build-tools') -Recurse -Filter aapt.exe | Sort-Object FullName -Descending | Select-Object -First 1
$badging = & $aapt.FullName dump badging $apk 2>$null | Select-Object -First 1
$versionCode = [regex]::Match($badging, "versionCode='(\d+)'").Groups[1].Value
if (-not $versionCode) { throw "Numero di versione non trovato nell'APK" }
$tag = "android-v$versionCode"

gh release view $tag -R $repo *> $null
if ($LASTEXITCODE -eq 0) { throw "La versione $versionCode e' gia' pubblicata: serve almeno un commit nuovo per una versione nuova." }

# Le novita': i titoli dei commit dall'aggiornamento precedente. Git li scrive in UTF-8;
# senza dirlo a PowerShell 5.1, le lettere accentate arriverebbero storpiate.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$previous = git -C $frontend describe --tags --match 'android-v*' --abbrev=0 2>$null
$range = if ($previous) { "$previous..HEAD" } else { 'HEAD~10..HEAD' }
$notes = (git -C $frontend log --pretty='- %s' $range) -join "`n"
if (-not $notes) { $notes = '- Correzioni minori' }

$upload = Join-Path $env:TEMP 'myeconomy.apk'
Copy-Item $apk $upload -Force
$notesFile = Join-Path $env:TEMP 'myeconomy-notes.md'
# UTF-8 senza BOM: Set-Content -Encoding utf8 di PowerShell 5.1 lo aggiunge, e finirebbe
# come carattere invisibile in testa alle note.
[System.IO.File]::WriteAllText($notesFile, $notes, (New-Object System.Text.UTF8Encoding $false))

gh release create $tag $upload -R $repo --target $head --title "App Android 1.0.$versionCode" --notes-file $notesFile
if ($LASTEXITCODE -ne 0) { throw 'Pubblicazione su GitHub non riuscita' }
git -C $frontend fetch -q --tags origin
"Pubblicata la versione 1.0.${versionCode}: il telefono la proporra' alla prossima apertura."
