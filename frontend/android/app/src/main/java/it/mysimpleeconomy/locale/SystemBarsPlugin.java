package it.mysimpleeconomy.locale;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Il colore delle fasce di sistema (barra di stato in alto, barra dei gesti in basso)
 * e delle loro icone, allineati al tema dell'app (vedi src/local/statusBar.ts).
 *
 * Da Android 15 l'app disegna sotto le barre, e Capacitor (adjustMarginsForEdgeToEdge)
 * stacca la WebView dai bordi: le due fasce che restano sono lo sfondo della finestra,
 * non la barra. Quindi si colora quello, e la barra di stato del plugin ufficiale
 * (che colora la barra) non bastava: nel tema scuro le fasce restavano bianche.
 * Prima di Android 15 le fasce sono le barre vere, e si colorano quelle.
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    @PluginMethod
    public void setColors(PluginCall call) {
        String color = call.getString("color");
        Boolean light = call.getBoolean("light");
        if (color == null || light == null) {
            call.reject("Servono color e light");
            return;
        }
        final int parsed;
        try {
            parsed = Color.parseColor(color);
        } catch (IllegalArgumentException e) {
            call.reject("Colore non valido: " + color);
            return;
        }

        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            View decor = window.getDecorView();
            decor.setBackgroundColor(parsed);
            View webViewParent = (View) getBridge().getWebView().getParent();
            if (webViewParent != null) webViewParent.setBackgroundColor(parsed);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                window.setStatusBarColor(parsed);
                window.setNavigationBarColor(parsed);
            }
            // "light" = sfondo chiaro, quindi icone scure.
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
            call.resolve();
        });
    }
}
