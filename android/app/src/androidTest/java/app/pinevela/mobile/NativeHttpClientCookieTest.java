package app.pinevela.mobile;

import android.content.Context;
import android.content.ContextWrapper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import okhttp3.Headers;
import okhttp3.Interceptor;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.Buffer;
import okio.BufferedSource;
import okio.Okio;
import okio.Source;
import okio.Timeout;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.IOException;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Synthetic response faults exercise the real transport and Android Keystore.
 * These do not represent provider, TLS or Google end-to-end verification. */
@RunWith(AndroidJUnit4.class)
public class NativeHttpClientCookieTest {
    private static final String MEDIA_PATH = "/api/media/11111111-1111-4111-8111-111111111111";

    private Context isolatedContext() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(app.getCacheDir(), "transport-cookie-test-" + System.nanoTime());
        assertTrue(directory.mkdirs());
        Context context = new ContextWrapper(app) { @Override public File getNoBackupFilesDir() { return directory; } };
        JSONArray cookies = new JSONArray();
        for (String name : new String[] { "pv_sb_access", "pv_sb_refresh" }) cookies.put(new JSONObject()
            .put("name", name).put("value", "original-" + name).put("host", okhttp3.HttpUrl.get(BuildConfig.API_ORIGIN).host())
            .put("expiresAt", System.currentTimeMillis() + 60_000));
        new SecureSessionStore(context).write(new JSONObject().put("cookies", cookies));
        return context;
    }

    private Headers rotated(String marker) {
        return new Headers.Builder()
            .add("Set-Cookie", "pv_sb_access=" + marker + "-access; Path=/; Secure; HttpOnly; Max-Age=300")
            .add("Set-Cookie", "pv_sb_refresh=" + marker + "-refresh; Path=/; Secure; HttpOnly; Max-Age=300").build();
    }

    private Response reply(Request request, int status, Headers headers, ResponseBody body) {
        return new Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(status)
            .message(status == 200 ? "OK" : "Test fixture").headers(headers).body(body).build();
    }

    private NativeHttpClient client(Context context, Interceptor interceptor) throws Exception {
        return new NativeHttpClient(context, new OkHttpClient.Builder().addInterceptor(interceptor)
            .followRedirects(false).cookieJar(okhttp3.CookieJar.NO_COOKIES).build());
    }

    private String cookie(Context context, String name) throws Exception {
        JSONArray cookies = new SecureSessionStore(context).read().optJSONArray("cookies");
        for (int i = 0; cookies != null && i < cookies.length(); i++) {
            JSONObject value = cookies.getJSONObject(i);
            if (name.equals(value.getString("name"))) return value.getString("value");
        }
        return null;
    }

    private void get(NativeHttpClient client, String id) throws Exception {
        client.request("/api/auth/me", "GET", Collections.emptyMap(), new byte[0], id, () -> false);
    }

    private ResponseBody failingBody() {
        return new ResponseBody() {
            @Override public MediaType contentType() { return MediaType.get("application/json"); }
            @Override public long contentLength() { return 20; }
            @Override public BufferedSource source() {
                return Okio.buffer(new Source() {
                    @Override public long read(Buffer sink, long count) throws IOException { throw new IOException("Synthetic interrupted body"); }
                    @Override public Timeout timeout() { return Timeout.NONE; }
                    @Override public void close() {}
                });
            }
        };
    }

    @Test public void missingAndRejectedMediaKeepRotationForTheNextRequest() throws Exception {
        for (int scenario = 0; scenario < 3; scenario++) {
            Context context = isolatedContext(); AtomicReference<String> sent = new AtomicReference<>();
            final int current = scenario;
            NativeHttpClient transport = client(context, chain -> {
                Request request = chain.request();
                if (request.url().encodedPath().equals(MEDIA_PATH)) {
                    Headers headers = rotated("media").newBuilder().add("Content-Type", current == 1 ? "text/html" : "image/png").build();
                    ResponseBody body = current == 2 ? new ResponseBody() {
                        @Override public MediaType contentType() { return MediaType.get("image/png"); }
                        @Override public long contentLength() { return TransportPolicy.MEDIA_LIMIT + 1L; }
                        @Override public BufferedSource source() { return new Buffer(); }
                    } : ResponseBody.create(new byte[0], MediaType.get("image/png"));
                    return reply(request, current == 0 ? 404 : 200, headers, body);
                }
                sent.set(request.header("Cookie"));
                return reply(request, 200, new Headers.Builder().build(), ResponseBody.create("{}", MediaType.get("application/json")));
            });
            NativeHttpClient.MediaResult result = transport.media(MEDIA_PATH); result.stream.close();
            assertEquals(current == 0 ? 404 : 502, result.status);
            assertEquals("media-refresh", cookie(context, "pv_sb_refresh"));
            get(transport, "after-media");
            assertTrue(sent.get().contains("pv_sb_refresh=media-refresh"));
        }
    }

    @Test public void interruptedAndOversizedBodiesKeepAcceptedRotation() throws Exception {
        for (boolean oversized : new boolean[] { false, true }) {
            Context context = isolatedContext();
            NativeHttpClient transport = client(context, chain -> reply(chain.request(), 200, rotated("body"), oversized ? new ResponseBody() {
                @Override public MediaType contentType() { return MediaType.get("application/json"); }
                @Override public long contentLength() { return TransportPolicy.RESPONSE_LIMIT + 1L; }
                @Override public BufferedSource source() { return new Buffer(); }
            } : failingBody()));
            try { get(transport, "broken-body"); fail("Accepted broken response body"); }
            catch (IOException | IllegalArgumentException expected) {}
            assertEquals("body-refresh", cookie(context, "pv_sb_refresh"));
        }
    }

    @Test public void cancellationAfterHeadersKeepsRotationButRejectsBody() throws Exception {
        Context context = isolatedContext(); AtomicBoolean cancelled = new AtomicBoolean();
        NativeHttpClient transport = client(context, chain -> reply(chain.request(), 200, rotated("cancel"), new ResponseBody() {
            @Override public MediaType contentType() { return MediaType.get("application/json"); }
            @Override public long contentLength() { return 2; }
            @Override public BufferedSource source() { cancelled.set(true); return new Buffer().writeUtf8("{}"); }
        }));
        try {
            transport.request("/api/auth/me", "GET", Collections.emptyMap(), new byte[0], "cancelled-body", cancelled::get);
            fail("Accepted cancelled response");
        } catch (java.io.InterruptedIOException expected) {}
        assertEquals("cancel-refresh", cookie(context, "pv_sb_refresh"));
    }

    @Test public void redirectsNeverAdoptCookiesOrExposeLocation() throws Exception {
        Context context = isolatedContext();
        NativeHttpClient transport = client(context, chain -> reply(chain.request(), 302,
            rotated("redirect").newBuilder().add("Location", "https://example.invalid/").build(),
            ResponseBody.create(new byte[0], null)));
        NativeHttpClient.Result response = transport.request("/api/auth/me", "GET", Collections.emptyMap(), new byte[0], "redirect", () -> false);
        assertEquals(302, response.status); assertFalse(response.headers.containsKey("location"));
        assertEquals("original-pv_sb_refresh", cookie(context, "pv_sb_refresh"));
        transport.media(MEDIA_PATH).stream.close();
        assertEquals("original-pv_sb_refresh", cookie(context, "pv_sb_refresh"));
    }

    @Test public void failedLogoutPreservesCredentialsAndSuccessfulLogoutClearsThem() throws Exception {
        Context context = isolatedContext(); AtomicBoolean success = new AtomicBoolean();
        NativeHttpClient transport = client(context, chain -> reply(chain.request(), success.get() ? 204 : 503,
            rotated("logout"), ResponseBody.create(new byte[0], null)));
        assertEquals(503, transport.request("/api/auth/logout", "POST", Collections.emptyMap(), new byte[0], "logout-fails", () -> false).status);
        assertTrue(transport.hasSession()); assertEquals("original-pv_sb_refresh", cookie(context, "pv_sb_refresh"));
        success.set(true);
        assertEquals(204, transport.request("/api/auth/logout", "POST", Collections.emptyMap(), new byte[0], "logout-succeeds", () -> false).status);
        assertFalse(transport.hasSession()); assertNull(cookie(context, "pv_sb_refresh"));
    }

    @Test public void identityExchangeWaitsForTheCompleteBodyAndFreshCookiePair() throws Exception {
        for (int scenario = 0; scenario < 3; scenario++) {
            Context context = isolatedContext(); final int current = scenario;
            Headers headers = current == 1 ? new Headers.Builder().add("Set-Cookie", "pv_sb_access=incomplete; Path=/; Secure; HttpOnly; Max-Age=300").build() : rotated("exchange");
            NativeHttpClient transport = client(context, chain -> reply(chain.request(), 200, headers,
                current == 0 ? failingBody() : ResponseBody.create("{}", MediaType.get("application/json"))));
            try {
                transport.request("/api/auth/mobile/exchange", "POST", Collections.emptyMap(), new byte[0], "exchange", () -> false);
                assertEquals(2, current);
            } catch (IOException | SecurityException expected) { assertNotEquals(2, current); }
            assertEquals(current == 2 ? "exchange-refresh" : "original-pv_sb_refresh", cookie(context, "pv_sb_refresh"));
        }
    }

    @Test public void nativeGoogleCompletionCommitsOnlyAValidatedFullReply() throws Exception {
        final String path = NativeGoogleAuthPolicy.COMPLETE;
        for (int scenario = 0; scenario < 6; scenario++) {
            Context context = isolatedContext(); final int current = scenario;
            Headers headers = current == 2 ? new Headers.Builder()
                .add("Set-Cookie", "pv_sb_access=incomplete; Path=/; Secure; HttpOnly; Max-Age=300").build() : rotated("google");
            String body = current == 1 ? "{}" : current == 5
                ? "{\"authenticated\":true,\"redirectTo\":\"https://foreign.test\"}"
                : "{\"authenticated\":true,\"redirectTo\":\"/user/dashboard\"}";
            NativeHttpClient transport = client(context, chain -> reply(chain.request(), current == 4 ? 403 : 200, headers,
                current == 0 ? failingBody() : ResponseBody.create(body, MediaType.get("application/json"))));
            try {
                NativeHttpClient.Result result = transport.request(path, "POST", Collections.emptyMap(), new byte[0], "native-google", () -> false);
                assertEquals(current == 4 ? 403 : 200, result.status);
                assertTrue(current == 3 || current == 4);
            } catch (IOException | IllegalArgumentException | SecurityException expected) {
                assertTrue(current == 0 || current == 1 || current == 2 || current == 5);
            }
            assertEquals(current == 3 ? "google-refresh" : "original-pv_sb_refresh", cookie(context, "pv_sb_refresh"));
        }
    }

    @Test public void oldGenerationCannotReturnAnAccountBodyOrRestoreCookies() throws Exception {
        Context context = isolatedContext(); AtomicReference<NativeHttpClient> reference = new AtomicReference<>();
        AtomicBoolean signedOut = new AtomicBoolean();
        NativeHttpClient transport = client(context, chain -> {
            if (chain.request().url().encodedPath().equals("/api/auth/logout"))
                return reply(chain.request(), 204, new Headers.Builder().build(), ResponseBody.create(new byte[0], null));
            return reply(chain.request(), 200, rotated("old"), new ResponseBody() {
            @Override public MediaType contentType() { return MediaType.get("application/json"); }
            @Override public long contentLength() { return 2; }
            @Override public BufferedSource source() {
                if (signedOut.compareAndSet(false, true)) try {
                    // Exercise the actual priority logout path while a response
                    // holds the normal lease. No background timing assumptions.
                    reference.get().request("/api/auth/logout", "POST", Collections.emptyMap(), new byte[0], "logout-during-body", () -> false);
                } catch (Exception error) { throw new RuntimeException(error); }
                return new Buffer().writeUtf8("{}");
            }
        }); });
        reference.set(transport);
        try { get(transport, "late-body"); fail("Returned old account response"); } catch (IOException expected) {}
        assertNull(cookie(context, "pv_sb_refresh")); assertFalse(transport.hasSession());
        long oldEpoch = transport.epoch(); transport.invalidateIdentityRequests(false);
        try {
            transport.request("/api/auth/me", "GET", Collections.emptyMap(), new byte[0], "queued-before-logout", () -> false, oldEpoch);
            fail("Executed request from an old identity generation");
        } catch (java.io.InterruptedIOException expected) {}
    }

    @Test public void directCredentialsCancelPersistedBrowserProofWithoutLosingTheExistingSession() throws Exception {
        Context context = isolatedContext(); AtomicBoolean attemptedOldExchange = new AtomicBoolean();
        NativeHttpClient transport = client(context, chain -> {
            if (chain.request().url().encodedPath().equals("/api/auth/mobile/exchange")) attemptedOldExchange.set(true);
            return reply(chain.request(), 401, new Headers.Builder().build(), ResponseBody.create("{}", MediaType.get("application/json")));
        });
        transport.pending(new JSONObject().put("state", "old-browser-state").put("verifier", "old-browser-verifier")
            .put("expiresAt", System.currentTimeMillis() + 60_000));
        long browserEpoch = transport.epoch();
        transport.prepareCredentialAuth();
        assertTrue(transport.epoch() > browserEpoch);
        assertNull(transport.pending());
        assertFalse(new SecureSessionStore(context).read().has("pending"));
        try {
            transport.request("/api/auth/mobile/exchange", "POST", Collections.emptyMap(), new byte[0], "stale-browser", () -> false, browserEpoch);
            fail("Redeemed a browser proof superseded by in-app credentials");
        } catch (java.io.InterruptedIOException expected) {}
        assertFalse(attemptedOldExchange.get());
        assertEquals(401, transport.request("/api/auth/login", "POST", Collections.emptyMap(), new byte[0], "failed-new-credentials", () -> false).status);
        assertTrue(transport.hasSession());
        assertEquals("original-pv_sb_refresh", cookie(context, "pv_sb_refresh"));
        // The cancellation is durable across recreation, unlike an in-memory
        // pending flag: a deferred cold callback cannot recover its verifier.
        NativeHttpClient reopened = client(context, chain -> { throw new IOException("No requests expected"); });
        assertNull(reopened.pending()); assertTrue(reopened.hasSession());
    }

    @Test public void directCredentialChoiceRejectsAnExchangeWhoseBodyArrivesLater() throws Exception {
        Context context = isolatedContext(); AtomicReference<NativeHttpClient> reference = new AtomicReference<>();
        NativeHttpClient transport = client(context, chain -> reply(chain.request(), 200, rotated("stale-browser"), new ResponseBody() {
            @Override public MediaType contentType() { return MediaType.get("application/json"); }
            @Override public long contentLength() { return 2; }
            @Override public BufferedSource source() {
                try { reference.get().prepareCredentialAuth(); }
                catch (Exception error) { throw new RuntimeException(error); }
                return new Buffer().writeUtf8("{}");
            }
        }));
        reference.set(transport);
        transport.pending(new JSONObject().put("state", "old-browser-state").put("expiresAt", System.currentTimeMillis() + 60_000));
        try {
            transport.request("/api/auth/mobile/exchange", "POST", Collections.emptyMap(), new byte[0], "exchange-racing-credentials", () -> false);
            fail("Installed a browser session after a new credential choice");
        } catch (java.io.InterruptedIOException expected) {}
        assertNull(transport.pending());
        assertEquals("original-pv_sb_refresh", cookie(context, "pv_sb_refresh"));
        assertTrue(transport.hasSession());
    }

    @Test public void onlyCredentialProofPostsSupersedeBrowserAuthentication() {
        for (String path : new String[] { "/api/auth/login", "/api/auth/register-unified", "/api/auth/verify-unified", "/api/auth/primary-reentry", "/api/auth/primary-reentry/verify",
            "/api/digital-market/login", "/api/auth/verification-team-login", "/api/verification-teams/login" }) {
            assertTrue(path, PineVelaTransportPlugin.credentialRequest(path, "POST"));
            assertTrue(path, PineVelaTransportPlugin.credentialRequest(path + "?source=app", "POST"));
            assertTrue(path, PineVelaTransportPlugin.credentialRequest(path.toUpperCase(java.util.Locale.ROOT) + "/?source=app", "POST"));
            assertFalse(path, PineVelaTransportPlugin.credentialRequest(path, "GET"));
        }
        for (String path : new String[] { "/api/auth/me", "/api/auth/captcha", "/api/auth/resend-unified", "/api/auth/mobile/exchange" })
            assertFalse(path, PineVelaTransportPlugin.credentialRequest(path, "POST"));
        assertTrue(NativeHttpClient.operationPath("/api/auth/MOBILE/exchange/?source=app").startsWith("/api/auth/mobile/"));
        assertEquals("/api/auth/logout", NativeHttpClient.operationPath("/api/auth/LOGOUT/"));
    }
}
