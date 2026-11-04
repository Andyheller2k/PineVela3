package app.pinevela.mobile;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.Plugin;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises Capacitor's real SystemBars listener and the physical WebView.
 * Synthetic insets below are dispatched only by the separate test APK: no
 * alternate listener, version override, CSS shim, or fixture reaches the app.
 * The test app uses the existing isolated transportTest variant, not user data.
 */
@RunWith(AndroidJUnit4.class)
public class NativeSafeAreaTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private MainActivity activity;

    @Before public void launchIsolatedApp() throws Exception {
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        activity = (MainActivity) instrumentation.startActivitySync(intent);
        awaitDocument("https://localhost/");
        assertEquals("native", pluginValue("insetsHandling"));
    }

    @After public void finishIsolatedApp() {
        if (activity != null) instrumentation.runOnMainSync(() -> activity.finish());
    }

    private WebView webView() { return activity.getBridge().getWebView(); }

    private Object pluginValue(String name) throws Exception {
        Plugin plugin = activity.getBridge().getPlugin("SystemBars").getInstance();
        Field field = plugin.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(plugin);
    }

    private String javascript(String expression) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> webView().evaluateJavascript(expression, value -> {
            result.set(value);
            done.countDown();
        }));
        assertTrue("WebView evaluation completed", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void awaitDocument(String url) throws Exception {
        // The installed app intentionally redirects its document root to the
        // no-mode local login route, which renders the Welcome screen.
        String expected = "https://localhost/".equals(url) ? "https://localhost/#/login" : url;
        instrumentation.runOnMainSync(() -> webView().loadUrl(url));
        for (int attempt = 0; attempt < 100; attempt++) {
            if ("true".equals(javascript("location.href === " + JSONObject.quote(expected) +
                    " && document.readyState === 'complete' && !!document.querySelector('meta[name=viewport]')"))) {
                // onPageCommitVisible updates the plugin's observed meta value.
                instrumentation.waitForIdleSync();
                Thread.sleep(180);
                return;
            }
            Thread.sleep(100);
        }
        fail("Bundled document settled: " + url + " (" + javascript("JSON.stringify({href:location.href,ready:document.readyState,viewport:document.querySelector('meta[name=viewport]')?.content})") + ")");
    }

    private JSONObject measureOnMain(String name, Insets safe, Insets ime, boolean keyboard) throws Exception {
        View decor = activity.getWindow().getDecorView();
        Rect window = Build.VERSION.SDK_INT >= 30
            ? activity.getWindowManager().getCurrentWindowMetrics().getBounds()
            : new Rect(0, 0, decor.getWidth(), decor.getHeight());
        int[] at = new int[2]; webView().getLocationOnScreen(at);
        Rect web = new Rect(at[0], at[1], at[0] + webView().getWidth(), at[1] + webView().getHeight());
        int bottom = keyboard ? ime.bottom : safe.bottom;
        assertTrue(name + ": WebView fits left safe edge", web.left >= window.left + safe.left);
        assertTrue(name + ": WebView fits top safe edge", web.top >= window.top + safe.top);
        assertTrue(name + ": WebView fits right safe edge", web.right <= window.right - safe.right);
        assertTrue(name + ": WebView fits bottom safe edge/IME", web.bottom <= window.bottom - bottom);
        assertTrue(name + ": WebView has positive dimensions", web.width() > 0 && web.height() > 0);
        assertEquals(name + ": exactly one left inset", window.left + safe.left, web.left);
        assertEquals(name + ": exactly one top inset", window.top + safe.top, web.top);
        assertEquals(name + ": exactly one right inset", window.right - safe.right, web.right);
        assertEquals(name + ": exactly one bottom/IME inset", window.bottom - bottom, web.bottom);
        return new JSONObject().put("name", name).put("window", window.toShortString())
            .put("webView", web.toShortString()).put("safeInsets", safe.toString())
            .put("imeInsets", ime.toString()).put("keyboardVisible", keyboard)
            .put("nativePadding", new JSONObject().put("left", decor.getPaddingLeft())
                .put("top", decor.getPaddingTop()).put("right", decor.getPaddingRight())
                .put("bottom", decor.getPaddingBottom()));
    }

    private void report(JSONObject result) {
        Bundle status = new Bundle(); status.putString("stream", "\nPV_SAFE_AREA " + result + "\n");
        instrumentation.sendStatus(0, status);
    }

    private void throwFailure(Throwable error) {
        if (error instanceof AssertionError) throw (AssertionError) error;
        if (error != null) throw new RuntimeException(error);
    }

    private void measure(String name, Insets safe, Insets ime, boolean keyboard) throws Exception {
        AtomicReference<JSONObject> result = new AtomicReference<>();
        AtomicReference<Throwable> error = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            try { result.set(measureOnMain(name, safe, ime, keyboard)); }
            catch (Throwable failure) { error.set(failure); }
        });
        throwFailure(error.get());
        report(result.get());
    }

    @Test public void everyBundledDocumentPreservesContainAfterResizeAndPageShow() throws Exception {
        for (String url : new String[] {
            "https://localhost/", "https://localhost/#/login?mode=login", "https://localhost/#/login?mode=register",
            "https://localhost/#/faq", "https://localhost/#/help", "https://localhost/privacy.html",
            "https://localhost/terms.html", "https://localhost/legal/terms-2026-10-27.html",
            "https://localhost/webview-update-required.html"
        }) {
            awaitDocument(url);
            assertEquals(url + ": meta stays contained after lifecycle events", "true", javascript(
                "(() => { dispatchEvent(new Event('resize')); dispatchEvent(new PageTransitionEvent('pageshow')); " +
                "const v = [...document.querySelectorAll('meta[name=viewport]')].at(-1)?.content || ''; " +
                "return /viewport-fit\\s*=\\s*contain/.test(v) && !/viewport-fit\\s*=\\s*cover/.test(v); })()"));
            assertEquals(url + ": SystemBars keeps native safe bounds", false, pluginValue("hasViewportCover"));
        }
    }

    @Test public void realSystemBarsContainThePhysicalWebViewExactlyOnce() throws Exception {
        AtomicReference<WindowInsetsCompat> insets = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> insets.set(ViewCompat.getRootWindowInsets(activity.getWindow().getDecorView())));
        assertNotNull("Real Android root insets exist", insets.get());
        WindowInsetsCompat actual = insets.get();
        measure("actual-system-bars", actual.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()),
            actual.getInsets(WindowInsetsCompat.Type.ime()), actual.isVisible(WindowInsetsCompat.Type.ime()));
    }

    private void synthetic(String name, Insets bars, Insets cutout, Insets ime, boolean keyboard) throws Exception {
        AtomicReference<Throwable> error = new AtomicReference<>();
        AtomicReference<JSONObject> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            try {
                View decor = activity.getWindow().getDecorView();
                WindowInsetsCompat current = ViewCompat.getRootWindowInsets(decor);
                assertNotNull(current);
                WindowInsetsCompat input = new WindowInsetsCompat.Builder(current)
                    .setInsets(WindowInsetsCompat.Type.systemBars(), bars)
                    .setInsets(WindowInsetsCompat.Type.displayCutout(), cutout)
                    .setInsets(WindowInsetsCompat.Type.ime(), ime)
                    .setVisible(WindowInsetsCompat.Type.ime(), keyboard).build();
                ViewCompat.dispatchApplyWindowInsets(decor, input);
                // Layout immediately while the supplied values are in force;
                // the OS may dispatch its real values again on the next frame.
                decor.measure(View.MeasureSpec.makeMeasureSpec(decor.getWidth(), View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(decor.getHeight(), View.MeasureSpec.EXACTLY));
                decor.layout(decor.getLeft(), decor.getTop(), decor.getRight(), decor.getBottom());
                result.set(measureOnMain(name, Insets.max(bars, cutout), ime, keyboard));
            } catch (Throwable failure) { error.set(failure); }
            finally { ViewCompat.requestApplyInsets(activity.getWindow().getDecorView()); }
        });
        instrumentation.waitForIdleSync();
        throwFailure(error.get());
        report(result.get());
    }

    @Test public void asymmetricCutoutsAndThreeButtonInsetsHaveOneNativeOwner() throws Exception {
        synthetic("left-cutout-three-button", Insets.of(0, 72, 0, 132), Insets.of(92, 145, 0, 0), Insets.NONE, false);
        synthetic("right-landscape-cutout-and-navigation", Insets.of(0, 64, 132, 0), Insets.of(0, 0, 180, 0), Insets.NONE, false);
        synthetic("gesture-navigation", Insets.of(0, 72, 0, 60), Insets.NONE, Insets.NONE, false);
    }

    @Test public void keyboardInsetsReplaceTheNavigationInsetWithoutDoublePadding() throws Exception {
        synthetic("ime-open-with-cutout", Insets.of(0, 72, 0, 132), Insets.of(92, 145, 0, 0), Insets.of(0, 0, 0, 720), true);
        synthetic("ime-dismissed", Insets.of(0, 72, 0, 132), Insets.of(92, 145, 0, 0), Insets.NONE, false);
    }

    @Test public void mobileNavigationTintChangesOnlyTheNativeNavigationRegion() throws Exception {
        for (Object[] appearance : new Object[][] {
            { "dark", true, Color.rgb(0, 53, 102) },
            { "dark", false, Color.rgb(0, 29, 61) },
            { "light", true, Color.WHITE }
        }) {
            String theme = (String) appearance[0];
            boolean navigationVisible = (Boolean) appearance[1];
            int bottomColor = (Integer) appearance[2];
            int topColor = "dark".equals(theme) ? Color.rgb(0, 29, 61) : Color.WHITE;
            // Exercise the bundled startup observer and real plugin bridge;
            // this isolated test does not register or sign in an account.
            javascript("(() => { const root=document.documentElement; root.dataset.theme=" + JSONObject.quote(theme) +
                "; root.dataset.themePreference=" + JSONObject.quote(theme) +
                "; root.dataset.mobileNavigation=" + JSONObject.quote(Boolean.toString(navigationVisible)) + "; })()");
            boolean matched = false;
            for (int attempt = 0; attempt < 30; attempt++) {
                instrumentation.waitForIdleSync();
                Bitmap screenshot = instrumentation.getUiAutomation().takeScreenshot();
                AtomicReference<WindowInsetsCompat> currentInsets = new AtomicReference<>();
                instrumentation.runOnMainSync(() -> currentInsets.set(ViewCompat.getRootWindowInsets(activity.getWindow().getDecorView())));
                WindowInsetsCompat insets = currentInsets.get();
                assertNotNull(insets);
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                Insets navigation = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
                assertTrue("Portrait emulator has a native bottom navigation inset", navigation.bottom > 0);
                assertNotNull("Physical Android screenshot is available", screenshot);
                int x = screenshot.getWidth() / 8;
                matched = screenshot.getPixel(x, Math.max(0, bars.top / 4)) == topColor &&
                    screenshot.getPixel(x, screenshot.getHeight() - navigation.bottom / 2) == bottomColor;
                screenshot.recycle();
                if (matched) {
                    measure("navigation-tint-" + theme + "-" + navigationVisible, bars,
                        insets.getInsets(WindowInsetsCompat.Type.ime()), insets.isVisible(WindowInsetsCompat.Type.ime()));
                    break;
                }
                Thread.sleep(100);
            }
            assertTrue(theme + "/" + navigationVisible + ": status and navigation colors match without changing safe bounds", matched);
        }
    }
}
