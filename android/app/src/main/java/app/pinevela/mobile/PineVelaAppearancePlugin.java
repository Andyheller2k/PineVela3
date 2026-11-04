package app.pinevela.mobile;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PineVelaAppearance")
public final class PineVelaAppearancePlugin extends Plugin {
    @PluginMethod
    public void setAppearance(PluginCall call) {
        String theme = call.getString("theme");
        String preference = call.getString("preference");
        boolean bottomNavigation = Boolean.TRUE.equals(call.getBoolean("bottomNavigation", false));
        if ((!"light".equals(theme) && !"dark".equals(theme)) || !NativeAppearance.validPreference(preference)) {
            call.reject("Invalid application appearance.", "INVALID_APPEARANCE");
            return;
        }
        getActivity().runOnUiThread(() -> {
            NativeAppearance.remember((MainActivity) getActivity(), theme, preference, bottomNavigation);
            call.resolve();
        });
    }
}
