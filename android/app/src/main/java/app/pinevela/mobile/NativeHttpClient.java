package app.pinevela.mobile;

import android.content.Context;
import okhttp3.Call;
import okhttp3.Cache;
import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.Headers;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.Semaphore;
import java.util.function.BooleanSupplier;

/** Isolated session transport; only verified public photos have a bounded disk cache. */
final class NativeHttpClient {
    static final class MediaResult {
        final int status;
        final InputStream stream;
        MediaResult(int status, InputStream stream) { this.status = status; this.stream = stream; }
    }
    static final class Result {
        final int status;
        final Map<String, String> headers;
        final byte[] body;
        Result(int status, Map<String, String> headers, byte[] body) { this.status = status; this.headers = headers; this.body = body; }
    }

    private static NativeHttpClient instance;
    static synchronized NativeHttpClient get(Context context) throws Exception {
        if (instance == null) instance = new NativeHttpClient(context.getApplicationContext());
        return instance;
    }

    private final SecureSessionStore store;
    private final JSONObject state;
    private final OkHttpClient client;
    private final OkHttpClient mediaClient;
    private final Map<String, Call> calls = new ConcurrentHashMap<>();
    private final AtomicLong mediaIds = new AtomicLong();
    private final Semaphore sessionLease = new Semaphore(1, true);
    private long sessionGeneration;
    private boolean closingSession;
    private String logoutRequestId;
    private boolean identityTransition;
    private boolean authResolved;
    final String origin = BuildConfig.API_ORIGIN;

    private NativeHttpClient(Context context) throws Exception {
        this(context, new OkHttpClient.Builder().cookieJar(CookieJar.NO_COOKIES)
            .addNetworkInterceptor(new CompromisedCertificateGuard())
            .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(40, TimeUnit.SECONDS).callTimeout(45, TimeUnit.SECONDS).build(),
            new Cache(new File(context.getCacheDir(), "public-photos-v1"), PublicMediaCacheInterceptor.MAX_BYTES));
    }

    // Package-only injection lets Android instrumentation exercise failures after
    // response headers using a deterministic client. No bridge configuration or
    // runtime origin override is exposed.
    NativeHttpClient(Context context, OkHttpClient client) throws Exception {
        this(context, client, null);
    }

    private NativeHttpClient(Context context, OkHttpClient client, Cache publicPhotos) throws Exception {
        store = new SecureSessionStore(context);
        // If secure storage is unavailable/corrupt, fail closed instead of silently
        // moving credentials into an unprotected fallback.
        state = store.read();
        this.client = client;
        // Synthetic injected clients remain uncached. The production singleton
        // exclusively owns this cache; API/session replies never enter it.
        mediaClient = publicPhotos == null ? client : client.newBuilder().cache(publicPhotos)
            .addNetworkInterceptor(new PublicMediaCacheInterceptor(publicPhotos)).build();
    }

    synchronized JSONObject pending() throws Exception {
        JSONObject pending = state.optJSONObject("pending");
        if (pending == null) return null;
        long expiry = pending.optLong("expiresAt", 0);
        if (expiry <= System.currentTimeMillis() || expiry > System.currentTimeMillis() + 11 * 60_000L) {
            clearPending(); return null;
        }
        return new JSONObject(pending.toString());
    }

    synchronized void pending(JSONObject pending) throws Exception { state.put("pending", pending); store.write(state); }
    synchronized void clearPending() throws Exception { state.remove("pending"); store.write(state); }
    synchronized boolean hasSession() throws Exception {
        String header = cookieHeader(HttpUrl.get(origin).host());
        return !closingSession && header.contains("pv_sb_access=") && header.contains("pv_sb_refresh=");
    }
    synchronized long epoch() { return sessionGeneration; }
    // Express routes accept case and trailing-slash variants. Security operation
    // classification must cover the same variants without changing the URL.
    static String operationPath(String path) {
        return path == null ? "" : path.split("\\?", 2)[0].toLowerCase(Locale.ROOT).replaceAll("/+$", "");
    }
    synchronized void authResolved() { authResolved = true; }
    synchronized void acknowledgeAuth() throws Exception {
        if (authResolved || pending() == null) { identityTransition = false; authResolved = false; }
    }
    synchronized void abortAuthTransition() throws Exception {
        state.remove("pending"); store.write(state); identityTransition = false; authResolved = false;
    }

    /** A new credential proof/browser choice supersedes the previous return,
     * even if it later fails. Existing verified cookies remain available. */
    void prepareCredentialAuth() throws Exception {
        synchronized (this) {
            if (closingSession) throw new IllegalStateException("Session is closing.");
            state.remove("pending"); store.write(state);
            sessionGeneration++; identityTransition = false; authResolved = false;
        }
        for (Call call : calls.values()) call.cancel();
    }

    void invalidateIdentityRequests(boolean exchangingIdentity) {
        synchronized (this) { sessionGeneration++; identityTransition = exchangingIdentity; authResolved = false; }
        for (Call call : calls.values()) call.cancel();
    }

    private void acquireLease(long expectedEpoch, BooleanSupplier cancelled) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (true) {
            synchronized (this) {
                if (cancelled.getAsBoolean() || expectedEpoch != sessionGeneration || closingSession)
                    throw new java.io.InterruptedIOException("Session request is no longer current.");
            }
            if (sessionLease.tryAcquire(100, TimeUnit.MILLISECONDS)) return;
            if (System.nanoTime() >= deadline) throw new java.io.InterruptedIOException("Session request queue timed out.");
        }
    }

    void prepareLogout(String requestId) throws Exception {
        synchronized (this) {
            if (closingSession) throw new IllegalStateException("Session is already closing.");
            // Invalidate browser handoffs too, but preserve actual session cookies
            // unless the server confirms logout.
            state.remove("pending"); store.write(state);
            sessionGeneration++; closingSession = true; logoutRequestId = requestId; identityTransition = false; authResolved = false;
        }
        for (Call call : calls.values()) call.cancel();
    }

    void cancel(String requestId) {
        Call call = calls.get(requestId);
        if (call != null) call.cancel();
    }

    /** Images stream directly to WebView; no base64 or decoded image buffers cross the bridge. */
    MediaResult media(String path) throws Exception {
        long expectedEpoch = epoch(); acquireLease(expectedEpoch, () -> false);
        try { return performMedia(path, expectedEpoch); }
        finally { sessionLease.release(); }
    }

    private MediaResult performMedia(String path, long expectedEpoch) throws Exception {
        TransportPolicy.path(path);
        if (!path.matches("/api/media/[A-Fa-f0-9-]{36}")) throw new IllegalArgumentException("Invalid media path.");
        HttpUrl url = HttpUrl.get(origin + path);
        Request.Builder builder = new Request.Builder().url(url).get().header("Origin", origin)
            .header("X-PineVela-Session", "cookie").header("X-PineVela-Native", "android").header("Cache-Control", "max-age=0");
        final long generation;
        synchronized (this) {
            if (closingSession || identityTransition || expectedEpoch != sessionGeneration) throw new IllegalStateException("Session is changing.");
            generation = sessionGeneration;
            String cookies = cookieHeader(url.host()); if (!cookies.isEmpty()) builder.header("Cookie", cookies);
        }
        String requestId = "media-" + mediaIds.incrementAndGet();
        Call call = mediaClient.newCall(builder.build()); call.timeout().timeout(20, TimeUnit.SECONDS);
        calls.put(requestId, call);
        final Response response;
        try { response = call.execute(); }
        catch (Exception error) { calls.remove(requestId, call); throw error; }
        try {
            // A denied/missing or malformed image may still have refreshed the
            // provider session. Persist accepted headers before checking its body.
            synchronized (this) {
                if (generation != sessionGeneration || closingSession) throw new java.io.InterruptedIOException("Stale session response.");
                // Only real network headers may update the session; cached
                // metadata must never replay a previous cookie rotation.
                Headers liveHeaders = response.cacheResponse() != null
                    ? (response.networkResponse() == null ? null : response.networkResponse().headers()) : response.headers();
                if (!redirect(response) && liveHeaders != null) mergeCookies(url, liveHeaders);
            }
            ResponseBody body = response.body();
            if (response.code() != 200 || body == null || !"image/png".equals(response.header("Content-Type")) || body.contentLength() > TransportPolicy.MEDIA_LIMIT) {
                int status = response.code(); response.close(); calls.remove(requestId, call);
                return new MediaResult(status >= 400 && status <= 599 ? status : 502, new java.io.ByteArrayInputStream(new byte[0]));
            }
            // No cookie updates happen while consuming the stream, so finishing
            // an old image after logout cannot write cookies back into the jar.
            return new MediaResult(200, new FilterInputStream(body.byteStream()) {
                private int received;
                private void counted(int count) throws IOException {
                    if (count > 0 && (received += count) > TransportPolicy.MEDIA_LIMIT) { close(); throw new IOException("Media response exceeds limit."); }
                }
                @Override public int read() throws IOException { int value = super.read(); if (value != -1) counted(1); return value; }
                @Override public int read(byte[] buffer, int offset, int length) throws IOException { int count = in.read(buffer, offset, length); counted(count); return count; }
                @Override public long skip(long amount) throws IOException {
                    long skipped = 0; byte[] buffer = new byte[8192];
                    while (skipped < amount) {
                        int count = read(buffer, 0, (int) Math.min(buffer.length, amount - skipped));
                        if (count == -1) break; skipped += count;
                    }
                    return skipped;
                }
                @Override public void close() throws IOException { try { super.close(); } finally { response.close(); calls.remove(requestId, call); } }
            });
        } catch (Exception error) { response.close(); calls.remove(requestId, call); throw error; }
    }

    // A fair lease serializes cookie-refreshing headers; the state lock is never
    // held across network I/O. Logout has its own priority lane and cancels the
    // lease holder. Generations also reject late responses ignoring cancellation.
    Result request(String path, String method, Map<String, String> suppliedHeaders, byte[] body,
                                String requestId, BooleanSupplier cancelled) throws Exception {
        return request(path, method, suppliedHeaders, body, requestId, cancelled, epoch());
    }

    Result request(String path, String method, Map<String, String> suppliedHeaders, byte[] body,
                   String requestId, BooleanSupplier cancelled, long acceptedEpoch) throws Exception {
        boolean logout = operationPath(path).equals("/api/auth/logout") && "POST".equals(method);
        if (logout) {
            synchronized (this) {
                if (!closingSession) prepareLogout(requestId);
                else if (!requestId.equals(logoutRequestId)) throw new IllegalStateException("Session is already closing.");
            }
        }
        long expectedEpoch = logout ? epoch() : acceptedEpoch;
        boolean leased = false;
        try {
            if (!logout) { acquireLease(expectedEpoch, cancelled); leased = true; }
            return performRequest(path, method, suppliedHeaders, body, requestId, cancelled, logout, expectedEpoch);
        }
        finally {
            if (leased) sessionLease.release();
            if (logout) synchronized (this) { if (requestId.equals(logoutRequestId)) { closingSession = false; logoutRequestId = null; } }
        }
    }

    private Result performRequest(String path, String method, Map<String, String> suppliedHeaders, byte[] body,
                                 String requestId, BooleanSupplier cancelled, boolean logout, long expectedEpoch) throws Exception {
        TransportPolicy.path(path); TransportPolicy.method(method);
        if (cancelled.getAsBoolean()) throw new java.io.InterruptedIOException("Request cancelled.");
        if (body.length > TransportPolicy.bodyLimit(path)) throw new IllegalArgumentException("Request body too large.");
        HttpUrl url = HttpUrl.get(origin + path);
        Request.Builder request = new Request.Builder().url(url);
        String contentType = "application/json";
        for (Map.Entry<String, String> header : suppliedHeaders.entrySet()) {
            if (!TransportPolicy.requestHeader(header.getKey(), header.getValue())) throw new IllegalArgumentException("Unsupported request header.");
            if (header.getKey().equalsIgnoreCase("content-type")) contentType = header.getValue();
            if (!header.getKey().equalsIgnoreCase("x-pinevela-session")) request.header(header.getKey(), header.getValue());
        }
        request.header("Origin", origin).header("X-PineVela-Session", "cookie")
            .header("X-PineVela-Native", "android").header("Cache-Control", "no-store");
        final long generation;
        synchronized (this) {
            if (expectedEpoch != sessionGeneration || (closingSession && !logout)) throw new IllegalStateException("Session is closing.");
            if (identityTransition && !operationPath(path).startsWith("/api/auth/mobile/")) throw new IllegalStateException("Session identity is changing.");
            generation = sessionGeneration;
            String cookies = cookieHeader(url.host()); if (!cookies.isEmpty()) request.header("Cookie", cookies);
        }
        boolean hasBody = !method.equals("GET") && !method.equals("HEAD");
        if (!hasBody && body.length != 0) throw new IllegalArgumentException("GET and HEAD cannot carry a body.");
        RequestBody requestBody = hasBody ? RequestBody.create(body, MediaType.get(contentType)) : null;
        request.method(method, requestBody);
        Call call = client.newCall(request.build());
        calls.put(requestId, call);
        try (Response response = call.execute()) {
            boolean nativeGoogleCompletion = NativeGoogleAuthPolicy.completePath(path);
            boolean exchange = operationPath(path).equals("/api/auth/mobile/exchange") || nativeGoogleCompletion;
            // A body error or UI cancellation must not discard a refresh already
            // accepted by the server. Identity exchange and successful logout are
            // committed separately only after their complete bounded reply.
            synchronized (this) {
                requireCurrentResponse(generation, logout);
                if (!redirect(response) && !logout && !exchange) mergeCookies(url, response.headers());
            }
            int limit = path.split("\\?", 2)[0].startsWith("/api/media/") ? TransportPolicy.MEDIA_LIMIT : TransportPolicy.RESPONSE_LIMIT;
            ResponseBody responseBody = response.body();
            byte[] bytes = readBounded(responseBody, limit);
            if (cancelled.getAsBoolean()) throw new java.io.InterruptedIOException("Request cancelled.");
            if (nativeGoogleCompletion && response.code() == 200) NativeGoogleAuthPolicy.completion(bytes);
            // Redirects never follow, never contribute cookies, and never expose Location.
            synchronized (this) {
                requireCurrentResponse(generation, logout);
                if (!redirect(response) && logout && response.isSuccessful()) {
                    state.put("cookies", new JSONArray()); state.remove("pending");
                    sessionGeneration++; store.write(state);
                } else if (exchange && response.code() == 200) mergeCookies(url, response.headers(), true);
            }
            Map<String, String> filtered = new LinkedHashMap<>();
            for (String name : response.headers().names()) if (TransportPolicy.responseHeader(name)) filtered.put(name.toLowerCase(Locale.ROOT), response.header(name));
            filtered.put("cache-control", "private, no-store");
            return new Result(response.code(), filtered, bytes);
        } finally { calls.remove(requestId, call); }
    }

    private static boolean redirect(Response response) { return response.code() >= 300 && response.code() < 400; }

    private void requireCurrentResponse(long generation, boolean logout) throws IOException {
        if (generation != sessionGeneration || (closingSession && !logout)) throw new java.io.InterruptedIOException("Stale session response.");
    }

    private String cookieHeader(String host) throws Exception {
        JSONArray cookies = state.optJSONArray("cookies");
        if (cookies == null) return "";
        StringBuilder value = new StringBuilder();
        for (int i = 0; i < cookies.length(); i++) {
            JSONObject cookie = cookies.getJSONObject(i);
            String name = cookie.optString("name"), token = cookie.optString("value");
            if (!allowedCookie(name) || !host.equals(cookie.optString("host")) || cookie.optLong("expiresAt") <= System.currentTimeMillis() ||
                !validCookieValue(token)) continue;
            if (value.length() != 0) value.append("; ");
            value.append(name).append('=').append(token);
        }
        return value.toString();
    }

    private void mergeCookies(HttpUrl url, Headers headers) throws Exception { mergeCookies(url, headers, false); }

    private void mergeCookies(HttpUrl url, Headers headers, boolean replace) throws Exception {
        Map<String, JSONObject> merged = new LinkedHashMap<>();
        JSONArray previous = state.optJSONArray("cookies");
        if (!replace && previous != null) for (int i = 0; i < previous.length(); i++) {
            JSONObject cookie = previous.getJSONObject(i);
            if (allowedCookie(cookie.optString("name")) && cookie.optLong("expiresAt") > System.currentTimeMillis()) merged.put(cookie.getString("name"), cookie);
        }
        boolean changed = false;
        for (String header : headers.values("Set-Cookie")) {
            if (header.length() > 20000) continue;
            Cookie cookie = Cookie.parse(url, header);
            if (cookie == null || !allowedCookie(cookie.name()) || !cookie.secure() || !cookie.httpOnly() ||
                !url.host().equals(cookie.domain()) || !cookie.path().equals("/") || !validCookieValue(cookie.value())) continue;
            changed = true;
            if (cookie.expiresAt() <= System.currentTimeMillis()) merged.remove(cookie.name());
            else merged.put(cookie.name(), new JSONObject().put("name", cookie.name()).put("value", cookie.value())
                .put("host", url.host()).put("expiresAt", Math.min(cookie.expiresAt(), System.currentTimeMillis() + 7 * 24 * 60 * 60_000L)));
        }
        if (replace && (!merged.containsKey("pv_sb_access") || !merged.containsKey("pv_sb_refresh"))) throw new SecurityException("Incomplete secure authentication session.");
        if (changed) { state.put("cookies", new JSONArray(merged.values())); store.write(state); }
    }

    private static boolean allowedCookie(String name) { return name.equals("pv_sb_access") || name.equals("pv_sb_refresh"); }
    private static boolean validCookieValue(String value) { return value.length() <= 18000 && value.matches("[\\x21-\\x2b\\x2d-\\x3a\\x3c-\\x7e]*"); }
    private static byte[] readBounded(ResponseBody body, int limit) throws Exception {
        if (body == null) return new byte[0];
        if (body.contentLength() > limit) throw new IllegalArgumentException("Response body too large.");
        try (InputStream input = body.byteStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384]; int count, total = 0;
            while ((count = input.read(buffer)) != -1) {
                total += count; if (total > limit) throw new IllegalArgumentException("Response body too large.");
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }
}
