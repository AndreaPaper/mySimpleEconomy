package it.mysimpleeconomy.locale;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Installa un aggiornamento dell'app scaricato nella cache (vedi src/local/appUpdate.ts):
 * apre la schermata di installazione di Android, dove chi usa l'app conferma.
 *
 * Android installa l'APK sopra quello attuale solo se è firmato con la stessa chiave:
 * un file diverso da un aggiornamento vero viene rifiutato da Android, non da qui.
 *
 * Il permesso di installare app ("origini sconosciute") Android lo concede app per app,
 * e solo da chi usa il telefono: se manca, si apre la sua pagina nelle impostazioni e
 * si risponde con un errore riconoscibile, così la pagina sa dire di riprovare.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    static final String PERMISSION_NEEDED = "PERMISSION_NEEDED";

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", canRequestInstalls());
        call.resolve(result);
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Manca il percorso dell'APK");
            return;
        }
        File apk = new File(getContext().getCacheDir(), path);
        if (!apk.isFile()) {
            call.reject("Aggiornamento non trovato: " + path);
            return;
        }
        if (!canRequestInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            call.reject("Serve il permesso di installare app", PERMISSION_NEEDED);
            return;
        }

        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private boolean canRequestInstalls() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
    }
}
