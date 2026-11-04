package app.pinevela.mobile;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.view.View;
import android.view.Window;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/** Only an appearance preference is persisted here; never account data. */
final class NativeAppearance {
    private static final String STORE = "pinevela-appearance";
    private static final String KEY = "preference";
    private static final int DARK = Color.rgb(0, 29, 61);
    private static final int DARK_NAVIGATION = Color.rgb(0, 53, 102);

    static String preference(Context context) {
        String preference = context.getSharedPreferences(STORE, Context.MODE_PRIVATE).getString(KEY, "system");
        return validPreference(preference) ? preference : "system";
    }

    static boolean validPreference(String preference) {
        return "light".equals(preference) || "dark".equals(preference) || "system".equals(preference);
    }

    static boolean dark(Context context, String preference) {
        if (!"system".equals(preference)) return "dark".equals(preference);
        return (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    static void prepareLaunch(Activity activity) {
        activity.setTheme(dark(activity, preference(activity)) ? R.style.AppTheme_NoActionBarLaunch_Dark : R.style.AppTheme_NoActionBarLaunch_Light);
    }

    static void restore(MainActivity activity) {
        apply(activity, dark(activity, preference(activity)));
    }

    static void clearNavigationTint(MainActivity activity) {
        NavigationTint tint = navigationTint(activity.getWindow().getDecorView());
        tint.visible = false;
        tint.invalidateSelf();
    }

    static void remember(MainActivity activity, String theme, String preference, boolean bottomNavigation) {
        if (!preference.equals(preference(activity))) {
            activity.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().putString(KEY, preference).apply();
        }
        navigationTint(activity.getWindow().getDecorView()).visible = bottomNavigation;
        apply(activity, "dark".equals(theme));
    }

    private static void apply(MainActivity activity, boolean dark) {
        final int color = dark ? DARK : Color.WHITE;
        // SystemBars reapplies this attribute during rotation/night-mode events.
        // Do not replace its insets listener or add a second set of safe padding.
        activity.getTheme().applyStyle(dark ? R.style.PineVela_WindowDark : R.style.PineVela_WindowLight, true);
        Window window = activity.getWindow();
        window.setBackgroundDrawable(new ColorDrawable(color));
        View decor = window.getDecorView();
        decor.setBackgroundColor(color);
        View content = activity.findViewById(android.R.id.content);
        if (content != null) content.setBackgroundColor(color);
        if (activity.getBridge() != null) activity.getBridge().getWebView().setBackgroundColor(color);
        NavigationTint navigation = navigationTint(decor);
        navigation.paint.setColor(dark ? DARK_NAVIGATION : Color.WHITE);
        navigation.invalidateSelf();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) window.setNavigationBarContrastEnforced(false);
    }

    private static NavigationTint navigationTint(View decor) {
        Object saved = decor.getTag(R.id.pinevela_navigation_tint);
        if (saved instanceof NavigationTint) return (NavigationTint) saved;
        NavigationTint tint = new NavigationTint(decor);
        decor.setTag(R.id.pinevela_navigation_tint, tint);
        // A drawable overlay adds no layout, hit targets, or inset ownership.
        // SystemBars can repaint the decor background without erasing this tint.
        decor.getOverlay().add(tint);
        tint.setBounds(0, 0, decor.getWidth(), decor.getHeight());
        decor.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            tint.setBounds(0, 0, right - left, bottom - top);
            tint.invalidateSelf();
        });
        return tint;
    }

    private static final class NavigationTint extends Drawable {
        final Paint paint = new Paint();
        final View decor;
        boolean visible;

        NavigationTint(View decor) { this.decor = decor; }

        @Override public void draw(Canvas canvas) {
            if (!visible) return;
            WindowInsetsCompat rootInsets = ViewCompat.getRootWindowInsets(decor);
            if (rootInsets == null) return;
            Insets navigation = rootInsets.getInsets(WindowInsetsCompat.Type.navigationBars());
            int width = decor.getWidth(), height = decor.getHeight();
            // The native SystemBars padding remains the sole safe-area owner.
            // Paint only the OS navigation region, including landscape sides.
            if (navigation.bottom > 0) canvas.drawRect(0, height - navigation.bottom, width, height, paint);
            if (navigation.left > 0) canvas.drawRect(0, 0, navigation.left, height, paint);
            if (navigation.right > 0) canvas.drawRect(width - navigation.right, 0, width, height, paint);
        }

        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); invalidateSelf(); }
        @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); invalidateSelf(); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
}
