package app.pinevela.mobile;

import org.junit.Test;
import static org.junit.Assert.*;
import java.net.URI;

public class TransportPolicyTest {
    @Test public void photographVariantsHaveAnExactBoundedAllowlist() {
        String path="/api/media/11111111-1111-4111-8111-111111111111";
        for(String suffix:new String[]{"","?size=card","?size=thumb"})assertEquals(path+suffix,TransportPolicy.mediaPath(path+suffix));
        for(String suffix:new String[]{"?size=9000","?size=card&url=https://example.com","?size=card&size=thumb","?size=%63ard","?SIZE=card","?size=","?","#x","/extra"}){
            try{TransportPolicy.mediaPath(path+suffix);fail("Accepted unsupported photo selector");}catch(IllegalArgumentException expected){}
        }
    }
    private void rejectedPath(String path) {
        try { TransportPolicy.path(path); fail("Accepted unsafe path"); } catch (IllegalArgumentException expected) {}
    }

    @Test public void preservesApiQueriesWithoutAllowingHostOrPathConfusion() {
        assertEquals("/api/digital-market/products?search=a%20b", TransportPolicy.path("/api/digital-market/products?search=a%20b"));
        for (String path : new String[]{
            "https://evil.example/api/auth/me", "//evil.example/api/auth/me", "/api/../private", "/api/./auth/me", "/api//auth/me",
            "/api/%2e%2e/auth/me", "/api/%2Fauth/me", "/api/%252e%252e/auth/me", "/api/%5cauth/me", "/api/\\auth/me", "/api/%61uth/mobile/start",
            "/api/auth/me#fragment", "/api/auth/me\r\nHost: evil.example", "/API/auth/me", "/api", "/apix/health", "/api/%00auth"
        }) rejectedPath(path);
    }

    @Test public void blocksCallerCredentialAndNetworkControlHeaders() {
        for (String header : new String[]{"Cookie", "Set-Cookie", "Authorization", "Origin", "Host", "Connection", "Referer", "Sec-Fetch-Site", "X-Forwarded-For", "Proxy-Authorization", "Accept-Encoding", "Content-Length"})
            assertFalse(header, TransportPolicy.requestHeader(header, "test"));
        assertTrue(TransportPolicy.requestHeader("X-PineVela-Profile-Context", "test"));
        assertTrue(TransportPolicy.requestHeader("X-PineVela-Account-Context", "test"));
        assertFalse(TransportPolicy.requestHeader("Content-Type", "text/plain\r\nCookie: secret"));
        assertFalse(TransportPolicy.responseHeader("Set-Cookie")); assertFalse(TransportPolicy.responseHeader("Cookie"));
        assertFalse(TransportPolicy.responseHeader("Authorization")); assertFalse(TransportPolicy.responseHeader("Location"));
    }

    @Test public void callbackRequiresExactSchemeAuthorityAndPath() throws Exception {
        assertTrue(TransportPolicy.callback(new URI("pinevela-debug://auth/callback?code=a&state=b"), "pinevela-debug"));
        for (String url : new String[]{"pinevela://auth/callback?code=a", "pinevela-debug://user@auth/callback?code=a", "pinevela-debug://auth:443/callback?code=a", "pinevela-debug://auth/callback/extra?code=a", "pinevela-debug://auth/%63allback?code=a", "pinevela-debug://auth/callback?code=a#state=x", "pinevela-debug://evil/callback?code=a", "pinevela-debug://auth/callback"})
            assertFalse(url, TransportPolicy.callback(new URI(url), "pinevela-debug"));
    }

    @Test public void browserCannotLeaveFixedHttpsAuthEndpoint() {
        assertEquals("https://pinevela.app/api/auth/mobile/browser?attempt=abc", TransportPolicy.browserUrl("https://pinevela.app/api/auth/mobile/browser?attempt=abc", "https://pinevela.app"));
        for (String url : new String[]{"http://pinevela.app/api/auth/mobile/browser", "https://evil.example/api/auth/mobile/browser", "https://pinevela.app:443/api/auth/mobile/browser", "https://u@pinevela.app/api/auth/mobile/browser", "https://pinevela.app/api/auth/mobile/browser#x", "https://pinevela.app/api/auth/other", "https://pinevela.app/api/auth/mobile/../mobile/browser"}) {
            try { TransportPolicy.browserUrl(url, "https://pinevela.app"); fail("Accepted unsafe browser URL"); } catch (IllegalArgumentException expected) {}
        }
    }

    @Test public void capsUploadRoutesToServerLimitsAndRestrictsMethods() {
        assertEquals(28 * 1024 * 1024, TransportPolicy.bodyLimit("/api/storage/upload-market-image"));
        assertEquals(7 * 1024 * 1024, TransportPolicy.bodyLimit("/api/storage/upload-profile-image"));
        assertEquals(1024 * 1024, TransportPolicy.bodyLimit("/api/storage/upload-arbitrary-image"));
        assertEquals("POST", TransportPolicy.method("post"));
        for (String method : new String[]{"CONNECT", "TRACE", "OPTIONS", "GET\r\n"}) {
            try { TransportPolicy.method(method); fail("Accepted unsupported method"); } catch (IllegalArgumentException expected) {}
        }
    }

    @Test public void bridgeStaysOnExactBundledOriginAndRedirectsStayLocal() {
        assertTrue(TransportPolicy.localDocument("https://localhost/login"));
        for (String url : new String[]{"http://localhost/", "https://localhost:443/", "https://u@localhost/", "https://localhost.evil.example/", "https://pinevela.app/", "file:///android_asset/public/index.html"}) assertFalse(url, TransportPolicy.localDocument(url));
        assertEquals("/admin/dashboard", TransportPolicy.redirect("/admin/dashboard"));
        assertEquals("/dashboard", TransportPolicy.redirect("//evil.example"));
        assertEquals("/dashboard", TransportPolicy.redirect("https://evil.example"));
    }

    @Test public void hostedCaptchaHasOneExactDocumentAndNoNavigationParameters() {
        assertTrue(TransportPolicy.captchaDocument("https://pinevela.app/api/auth/mobile/captcha"));
        for (String url : new String[] {
            "http://pinevela.app/api/auth/mobile/captcha", "https://pinevela.app:443/api/auth/mobile/captcha",
            "https://u@pinevela.app/api/auth/mobile/captcha", "https://preview.pinevela.app/api/auth/mobile/captcha",
            "https://pinevela.app.evil.invalid/api/auth/mobile/captcha", "https://pinevela.app/",
            "https://pinevela.app/api/auth/mobile/captcha/", "https://pinevela.app/api/auth/mobile/%63aptcha",
            "https://pinevela.app/api/auth/mobile/../mobile/captcha", "https://pinevela.app/api/auth/mobile/captcha?nonce=x",
            "https://pinevela.app/api/auth/mobile/captcha?", "https://pinevela.app/api/auth/mobile/captcha#",
            "https://pinevela.app/api/auth/mobile/captcha#x", "about:blank", "about:srcdoc"
        }) assertFalse(url, TransportPolicy.captchaDocument(url));
        assertTrue(TransportPolicy.captchaChildFrame("about:blank"));
        assertTrue(TransportPolicy.captchaChildFrame("about:srcdoc"));
        for (String url : new String[] { "about:blank?x", "about:blank#x", "about:srcdoc#x", "javascript:alert(1)", "data:text/html,anything", "https://pinevela.app/" })
            assertFalse(url, TransportPolicy.captchaChildFrame(url));
    }
}
