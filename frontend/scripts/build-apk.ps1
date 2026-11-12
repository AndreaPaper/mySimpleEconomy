# Costruisce l'APK dell'app Android (modalità locale, dati sul telefono).
#
#   .\scripts\build-apk.ps1           APK di prova (debug), da installare a mano
#   .\scripts\build-apk.ps1 -Release  APK firmato da dare a chi la usa
#
# Prima ricostruisce la web app in modalità locale e la copia nel progetto Android
# (npm run build:android), poi lancia Gradle.
param([switch]$Release)

$ErrorActionPreference = 'Stop'
$frontend = Split-Path -Parent $PSScriptRoot
$android = Join-Path $frontend 'android'

if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }

# Java 21 su Windows crea un piccolo socket nella cartella temporanea per il suo
# meccanismo interno, e con la cartella temporanea abbreviata di questo utente
# (C:\Users\ANDREA~1.BAT\...) fallisce con "Unable to establish loopback
# connection": Gradle non parte. Una cartella con il percorso completo lo evita.
$tmp = Join-Path $android '.gradle-tmp'
New-Item -ItemType Directory -Force $tmp | Out-Null
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$tmp"

Push-Location $frontend
try {
  npm run build:android
  if ($LASTEXITCODE -ne 0) { throw 'Build della web app non riuscita' }
} finally { Pop-Location }

$task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
Push-Location $android
try {
  & .\gradlew.bat $task --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "Gradle $task non riuscito" }
} finally { Pop-Location }

$kind = if ($Release) { 'release' } else { 'debug' }
Get-ChildItem (Join-Path $android "app\build\outputs\apk\$kind") -Filter *.apk |
  ForEach-Object { "APK pronto: $($_.FullName)" }
