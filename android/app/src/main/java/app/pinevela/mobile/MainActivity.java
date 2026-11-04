package app.pinevela.mobile;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.res.Configuration;
import androidx.core.splashscreen.SplashScreen;
import androidx.activity.EdgeToEdge;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        NativeAppearance.prepareLaunch(this);
        SplashScreen.installSplashScreen(this);
        registerPlugin(PineVelaTransportPlugin.class);
        registerPlugin(PineVelaAppearancePlugin.class);
        super.onCreate(savedInstanceState);
        // Make the window contract consistent on pre-15 Android too. Capacitor
        // alone applies the native system-bar/cutout/IME insets to its WebView.
        EdgeToEdge.enable(this);
        NativeAppearance.restore(this);
        if (getBridge() != null) {
            // Never keep Capacitor's legacy all-frame JavaScript-interface
            // fallback. Current WebViews use the origin-scoped main-frame
            // WebMessageListener. If it cannot initialize, fail closed.
            getBridge().getWebView().removeJavascriptInterface("androidBridge");
            getBridge().setWebViewClient(new PineVelaWebViewClient(getBridge()));
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        NativeAppearance.restore(this);
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        NativeAppearance.restore(this);
    }
}
