package app.pinevela.mobile;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.Collections;
import java.util.Map;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PineVelaWebViewBoundaryTest {
    private WebResourceRequest request(String url, boolean mainFrame) {
        return new WebResourceRequest() {
            @Override public Uri getUrl() { return Uri.parse(url); }
            @Override public boolean isForMainFrame() { return mainFrame; }
            @Override public boolean isRedirect() { return false; }
            @Override public boolean hasGesture() { return false; }
            @Override public String getMethod() { return "GET"; }
            @Override public Map<String, String> getRequestHeaders() { return Collections.emptyMap(); }
        };
    }

    @Test public void localProxyIsBlockedForMainFramesIframesAndFetches() throws Exception {
        // No bridge is needed: policy must deny before consulting any proxy or
        // local server, regardless of built-in CapacitorHttp configuration.
        PineVelaWebViewClient client = new PineVelaWebViewClient(null);
        for (String path : new String[] { "/_capacitor_http_interceptor_", "/%5Fcapacitor_http_interceptor_/" }) {
            for (boolean mainFrame : new boolean[] { true, false }) {
                WebResourceRequest request = request("https://localhost" + path + "?u=https%3A%2F%2Fexample.invalid", mainFrame);
                WebResourceResponse response = client.shouldInterceptRequest(null, request);
                assertEquals(403, response.getStatusCode());
                assertEquals(-1, response.getData().read());
                assertTrue(response.getResponseHeaders().get("Content-Security-Policy").contains("sandbox"));
                if (mainFrame) assertTrue(client.shouldOverrideUrlLoading(null, request));
            }
        }
    }

    @Test public void remoteMainDocumentsAndApiDocumentsCannotReachTheBridge() {
        PineVelaWebViewClient client = new PineVelaWebViewClient(null);
        for (String url : new String[] { "https://pinevela.app/", "https://challenges.cloudflare.com/", "https://localhost/api/auth/me", "https://localhost/api/media/11111111-1111-4111-8111-111111111111" })
            assertEquals(403, client.shouldInterceptRequest(null, request(url, true)).getStatusCode());
        assertEquals(403, client.shouldInterceptRequest(null, request("https://localhost/api/auth/me", false)).getStatusCode());
    }

    @Test public void onlyTheExactHostedCaptchaCanNavigateInAnIsolatedSubframe() {
        PineVelaWebViewClient client = new PineVelaWebViewClient(null);
        for (String url : new String[] { "https://pinevela.app/api/auth/mobile/captcha", "about:blank", "about:srcdoc", "https://challenges.cloudflare.com/turnstile/v0/test" })
            assertFalse(url, client.shouldOverrideUrlLoading(null, request(url, false)));
        for (String url : new String[] { "https://pinevela.app/", "https://pinevela.app/api/auth/mobile/captcha?x=1", "https://pinevela.app/api/auth/mobile/captcha#x",
            "https://pinevela.app:443/api/auth/mobile/captcha", "https://u@pinevela.app/api/auth/mobile/captcha", "https://preview.pinevela.app/api/auth/mobile/captcha", "about:blank#x" })
            assertTrue(url, client.shouldOverrideUrlLoading(null, request(url, false)));
        assertEquals(403, client.shouldInterceptRequest(null, request("https://pinevela.app/api/auth/mobile/captcha", true)).getStatusCode());
    }
}
