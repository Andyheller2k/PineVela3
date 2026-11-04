package app.pinevela.mobile;

import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.util.LinkedHashMap;
import java.util.Map;

/** Remote documents never load inside the WebView that owns the native bridge. */
final class PineVelaWebViewClient extends BridgeWebViewClient {
    private final Bridge bridge;
    PineVelaWebViewClient(Bridge bridge) { super(bridge); this.bridge = bridge; }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        // Standalone bundled policy/fallback documents have no product bar.
        // The app document reenables the tint once its visible nav is measured.
        NativeAppearance.clearNavigationTint((MainActivity) bridge.getActivity());
        super.onPageStarted(view, url, favicon);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        boolean local = TransportPolicy.localDocument(url.toString());
        // The app has its own isolated session transport. Never permit the
        // built-in proxy to render a remote document at the bundled app origin,
        // including iframe/resource requests and encoded path spellings.
        if (url.getPath() != null && url.getPath().startsWith(Bridge.CAPACITOR_HTTP_INTERCEPTOR_START)) return denied();
        if (request.isForMainFrame() && !local) return denied();
        if (local && url.getPath() != null && url.getPath().startsWith("/api/")) {
            if (request.isForMainFrame() || !"GET".equals(request.getMethod()) || url.getQuery() != null || url.getFragment() != null || !url.getPath().matches("/api/media/[A-Fa-f0-9-]{36}")) return denied();
            try {
                NativeHttpClient.MediaResult result = NativeHttpClient.get(bridge.getContext()).media(url.getEncodedPath());
                Map<String, String> headers = new LinkedHashMap<>();
                headers.put("Cache-Control", "private, no-store"); headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Content-Security-Policy", "sandbox; default-src 'none'");
                return new WebResourceResponse("image/png", null, result.status, result.status == 200 ? "OK" : "Unavailable", headers, result.stream);
            } catch (Exception ignored) { return denied(); }
        }
        return super.shouldInterceptRequest(view, request);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (!request.isForMainFrame()) {
            Uri uri = request.getUrl();
            // Only the fixed owned CAPTCHA document and its isolated challenge
            // frames may navigate remotely. They never receive a native bridge
            // grant; main-frame documents remain bundled at exact localhost.
            return !TransportPolicy.localDocument(uri.toString()) && !TransportPolicy.captchaDocument(uri.toString())
                && !TransportPolicy.captchaChildFrame(uri.toString()) && !("https".equals(uri.getScheme()) &&
                "challenges.cloudflare.com".equals(uri.getHost()) && uri.getPort() == -1 && uri.getUserInfo() == null);
        }
        return navigate(view, request.getUrl());
    }

    @Override
    @SuppressWarnings("deprecation")
    public boolean shouldOverrideUrlLoading(WebView view, String url) { return navigate(view, Uri.parse(url)); }

    private boolean navigate(WebView view, Uri uri) {
        if (uri.getPath() != null && uri.getPath().startsWith(Bridge.CAPACITOR_HTTP_INTERCEPTOR_START)) return true;
        if (TransportPolicy.localDocument(uri.toString())) return uri.getPath() != null && uri.getPath().startsWith("/api/");
        String scheme = uri.getScheme();
        if ("https".equals(scheme) || "http".equals(scheme) || "mailto".equals(scheme) || "tel".equals(scheme)) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri); intent.addCategory(Intent.CATEGORY_BROWSABLE);
                bridge.getActivity().startActivity(intent);
            } catch (Exception ignored) { /* Fail closed if no external handler exists. */ }
        }
        return true;
    }

    private WebResourceResponse denied() {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Cache-Control", "no-store"); headers.put("Content-Security-Policy", "sandbox; default-src 'none'");
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", headers, new ByteArrayInputStream(new byte[0]));
    }
}
