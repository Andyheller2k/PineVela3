package app.pinevela.mobile;

import android.content.Context;
import android.util.Base64;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import okhttp3.Cache;
import okhttp3.CookieJar;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Real Android OkHttp disk-cache tests over an isolated loopback TLS socket.
 * No WebView/session state, hosted account, payment, or external server is used. */
@RunWith(AndroidJUnit4.class)
public class PublicMediaCacheTest {
    private static final String UUID = "11111111-1111-4111-8111-111111111111";
    private static final String PATH = "/api/media/" + UUID;
    private static final byte[] PHOTO_A = Base64.decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n/8AAAAASUVORK5CYII=", Base64.DEFAULT);
    private static final byte[] PHOTO_B = Arrays.copyOf(PHOTO_A, PHOTO_A.length + 1);
    // Public test-only TLS identity, generated solely for this loopback fixture.
    // It is present only in the instrumentation APK, never debug/release assets.
    private static final String FIXTURE_KEYSTORE = "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";
    private static final char[] FIXTURE_PASSWORD = "public-media-loopback-fixture".toCharArray();

    private final List<Cache> caches = new ArrayList<>();
    private final List<OkHttpClient> clients = new ArrayList<>();
    private File directory;
    private Cache cache;
    private OkHttpClient client;
    private Tls tls;
    private Fixture fixture;

    @Before public void setUp() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Cache fixtures must stay in the separate transport-test app", context.getPackageName().endsWith(".transporttest"));
        directory = new File(context.getCacheDir(), "public-media-cache-test-" + System.nanoTime());
        assertTrue(directory.mkdirs());
        tls = new Tls();
        fixture = new Fixture(tls);
        cache = openCache();
        client = openClient(cache);
    }

    @After public void tearDown() throws Exception {
        if (fixture != null) fixture.close();
        for (OkHttpClient owned : clients) {
            owned.connectionPool().evictAll();
            owned.dispatcher().executorService().shutdownNow();
        }
        for (Cache owned : caches) owned.close();
        if (fixture != null) assertNull("Unexpected loopback fixture fault", fixture.failure.get());
    }

    private Cache openCache() {
        Cache result = new Cache(directory, PublicMediaCacheInterceptor.MAX_BYTES);
        caches.add(result);
        return result;
    }

    private OkHttpClient.Builder isolatedBuilder() {
        return new OkHttpClient.Builder()
            .sslSocketFactory(tls.context.getSocketFactory(), tls.trustManager)
            .cookieJar(CookieJar.NO_COOKIES).followRedirects(false).retryOnConnectionFailure(false)
            .connectTimeout(1, TimeUnit.SECONDS).readTimeout(3, TimeUnit.SECONDS).callTimeout(4, TimeUnit.SECONDS);
    }

    private OkHttpClient openClient(Cache owned) {
        OkHttpClient result = isolatedBuilder().cache(owned)
            .addNetworkInterceptor(new PublicMediaCacheInterceptor(owned)).build();
        clients.add(result);
        return result;
    }

    private void assertDiskDoesNotContain(byte[]... forbidden) throws Exception {
        cache.flush();
        File[] files = directory.listFiles();
        assertNotNull(files);
        for (File file : files) if (file.isFile()) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[4096];
                for (int read; (read = input.read(buffer)) != -1;) bytes.write(buffer, 0, read);
            }
            byte[] disk = bytes.toByteArray();
            for (byte[] value : forbidden) {
                boolean found = false;
                for (int start = 0; start <= disk.length - value.length && !found; start++) {
                    int offset = 0;
                    while (offset < value.length && disk[start + offset] == value[offset]) offset++;
                    found = offset == value.length;
                }
                assertFalse("Rejected response/request material persisted in fixture cache: " + file.getName(), found);
            }
        }
    }

    private static String tag(byte[] body) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(body);
        StringBuilder result = new StringBuilder("\"pv-" + UUID + "-");
        for (byte value : digest) result.append(String.format(Locale.ROOT, "%02x", value & 255));
        return result.append('"').toString();
    }

    private static Reply publicPhoto(byte[] body) throws Exception {
        return new Reply(200, body).header("Content-Type", "image/png")
            .header("X-PineVela-Public-Photo", "1").header("ETag", tag(body))
            // The interceptor must override even an overly permissive upstream.
            .header("Cache-Control", "public, max-age=86400, immutable");
    }

    private static Reply validated(byte[] body) throws Exception {
        // A legitimate 304 need not repeat Content-Type and has no response body.
        return new Reply(304, new byte[0]).header("X-PineVela-Public-Photo", "1")
            .header("ETag", tag(body)).header("Cache-Control", "public, max-age=86400");
    }

    private Response get(String path) throws IOException {
        return client.newCall(new Request.Builder().url(fixture.url(path)).get().build()).execute();
    }

    private static void approvedPolicy(Response response) {
        String policy = response.header("Cache-Control", "").toLowerCase(Locale.ROOT);
        for (String required : new String[] { "private", "no-cache", "max-age=0", "must-revalidate" })
            assertTrue("Public photos must always revalidate: " + required, policy.contains(required));
        assertFalse(policy.contains("no-store"));
        assertFalse(policy.contains("immutable"));
    }

    private static void deniedPolicy(Response response) {
        assertTrue(response.header("Cache-Control", "").contains("no-store"));
    }

    private void prime() throws Exception {
        fixture.enqueue(publicPhoto(PHOTO_A));
        try (Response response = get(PATH)) {
            assertEquals(200, response.code());
            approvedPolicy(response);
            assertArrayEquals(PHOTO_A, response.body().bytes());
        }
        cache.flush();
    }

    @Test public void measuredUncachedBaselineAndCachedRetrievalUseTheSamePhotoAndServer() throws Exception {
        OkHttpClient uncached = isolatedBuilder().build(); clients.add(uncached);
        Request request = new Request.Builder().url(fixture.url(PATH)).get().build();
        for (int i = 0; i < 2; i++) {
            fixture.enqueue(publicPhoto(PHOTO_A));
            try (Response response = uncached.newCall(request).execute()) {
                assertEquals(200, response.code()); assertNull(response.cacheResponse());
                assertArrayEquals(PHOTO_A, response.body().bytes());
            }
        }
        int baselineRequests = fixture.requests.size();
        int baselineBodies = fixture.bodyCount();
        int baselineBytes = fixture.bodyBytes();
        fixture.enqueue(publicPhoto(PHOTO_A));
        try (Response response = get(PATH)) { assertArrayEquals(PHOTO_A, response.body().bytes()); }
        fixture.enqueue(validated(PHOTO_A));
        try (Response response = get(PATH)) {
            assertEquals(304, response.networkResponse().code());
            assertArrayEquals(PHOTO_A, response.body().bytes());
        }
        int cachedRequests = fixture.requests.size() - baselineRequests;
        int cachedBodies = fixture.bodyCount() - baselineBodies;
        int cachedBytes = fixture.bodyBytes() - baselineBytes;
        assertEquals(2, baselineRequests); assertEquals(2, baselineBodies);
        assertEquals(PHOTO_A.length * 2, baselineBytes);
        assertEquals(2, cachedRequests); assertEquals(1, cachedBodies);
        assertEquals(PHOTO_A.length, cachedBytes);
        assertNull(fixture.requests.get(1).headers.get("if-none-match"));
        assertEquals(tag(PHOTO_A), fixture.requests.get(3).headers.get("if-none-match"));
        Log.i("PineVelaCacheMetrics", "{\"fixture\":\"same-loopback-tls-server-and-photo\",\"uncachedRequests\":" + baselineRequests
            + ",\"uncachedBodies\":" + baselineBodies + ",\"uncachedBodyBytes\":" + baselineBytes
            + ",\"cachedRequests\":" + cachedRequests + ",\"cachedBodies\":" + cachedBodies + ",\"cachedBodyBytes\":" + cachedBytes + "}");
    }

    @Test public void publicPhotoRevalidatesWithOneBodyEvenWhenCookieIdentityChanges() throws Exception {
        fixture.enqueue(publicPhoto(PHOTO_A));
        Request initial = new Request.Builder().url(fixture.url(PATH)).header("Cookie", "fixture-context=one").get().build();
        try (Response response = client.newCall(initial).execute()) {
            assertEquals(200, response.code()); approvedPolicy(response);
            assertNull(response.cacheResponse());
            assertArrayEquals(PHOTO_A, response.body().bytes());
        }
        fixture.enqueue(validated(PHOTO_A));
        try (Response response = client.newCall(initial.newBuilder().header("Cookie", "fixture-context=two").build()).execute()) {
            assertEquals(200, response.code()); approvedPolicy(response);
            assertNotNull(response.cacheResponse()); assertNotNull(response.networkResponse());
            assertEquals(304, response.networkResponse().code());
            assertArrayEquals(PHOTO_A, response.body().bytes());
        }
        assertEquals(2, fixture.requests.size());
        assertEquals(tag(PHOTO_A), fixture.requests.get(1).headers.get("if-none-match"));
        assertEquals("fixture-context=two", fixture.requests.get(1).headers.get("cookie"));
        assertEquals(1, fixture.bodyCount());
    }

    @Test public void diskPhotoSurvivesFreshCacheAndClient() throws Exception {
        prime();
        cache.close(); caches.remove(cache);
        client.connectionPool().evictAll();
        cache = openCache(); client = openClient(cache);
        fixture.enqueue(validated(PHOTO_A));
        try (Response response = get(PATH)) {
            assertEquals(304, response.networkResponse().code());
            assertNotNull(response.cacheResponse());
            assertArrayEquals(PHOTO_A, response.body().bytes());
        }
        assertEquals(tag(PHOTO_A), fixture.requests.get(1).headers.get("if-none-match"));
        assertEquals(1, fixture.bodyCount());
    }

    @Test public void changedEtagDownloadsReplacementAndUsesItsNewValidator() throws Exception {
        prime(); fixture.enqueue(publicPhoto(PHOTO_B));
        try (Response response = get(PATH)) {
            assertEquals(200, response.networkResponse().code());
            assertArrayEquals(PHOTO_B, response.body().bytes());
        }
        fixture.enqueue(validated(PHOTO_B));
        try (Response response = get(PATH)) {
            assertEquals(304, response.networkResponse().code());
            assertArrayEquals(PHOTO_B, response.body().bytes());
        }
        assertEquals(tag(PHOTO_A), fixture.requests.get(1).headers.get("if-none-match"));
        assertEquals(tag(PHOTO_B), fixture.requests.get(2).headers.get("if-none-match"));
        assertEquals(2, fixture.bodyCount());
    }

    @Test public void revoked404EvictsThePublicPhotoAndItsValidator() throws Exception {
        prime(); fixture.enqueue(new Reply(404, new byte[0]).header("Cache-Control", "public, max-age=86400"));
        try (Response response = get(PATH)) {
            assertEquals(404, response.code()); deniedPolicy(response);
            assertArrayEquals(new byte[0], response.body().bytes());
        }
        fixture.enqueue(publicPhoto(PHOTO_B));
        try (Response response = get(PATH)) {
            assertNull(response.cacheResponse()); assertArrayEquals(PHOTO_B, response.body().bytes());
        }
        assertNull(fixture.requests.get(2).headers.get("if-none-match"));
    }

    @Test public void privatePhotosAreNeverStored() throws Exception {
        for (int i = 0; i < 2; i++) {
            Reply reply = publicPhoto(i == 0 ? PHOTO_A : PHOTO_B); reply.headers.remove("X-PineVela-Public-Photo");
            fixture.enqueue(reply);
            try (Response response = get(PATH)) {
                deniedPolicy(response); assertNull(response.cacheResponse());
                assertArrayEquals(i == 0 ? PHOTO_A : PHOTO_B, response.body().bytes());
            }
        }
        assertNull(fixture.requests.get(1).headers.get("if-none-match"));
        assertEquals(2, fixture.bodyCount());
    }

    @Test public void becomingPrivateEvictsPreviouslyPublicBody() throws Exception {
        prime(); Reply hidden = publicPhoto(PHOTO_B); hidden.headers.remove("X-PineVela-Public-Photo");
        fixture.enqueue(hidden);
        try (Response response = get(PATH)) { deniedPolicy(response); assertArrayEquals(PHOTO_B, response.body().bytes()); }
        fixture.enqueue(publicPhoto(PHOTO_A));
        try (Response response = get(PATH)) { assertNull(response.cacheResponse()); assertArrayEquals(PHOTO_A, response.body().bytes()); }
        assertNull(fixture.requests.get(2).headers.get("if-none-match"));
    }

    @Test public void cookieBearing200IsNeverStoredOrReplayed() throws Exception {
        prime(); fixture.enqueue(publicPhoto(PHOTO_B).header("Set-Cookie", "fixture-rotation=one; Secure; HttpOnly; Path=/"));
        try (Response response = get(PATH)) {
            deniedPolicy(response); assertNotNull(response.header("Set-Cookie"));
            assertArrayEquals(PHOTO_B, response.body().bytes());
        }
        fixture.enqueue(publicPhoto(PHOTO_A).header("Set-Cookie", "fixture-rotation=two; Secure; HttpOnly; Path=/"));
        try (Response response = get(PATH)) {
            deniedPolicy(response); assertNull(response.cacheResponse());
            assertArrayEquals(PHOTO_A, response.body().bytes());
        }
        assertNull(fixture.requests.get(2).headers.get("if-none-match"));
        assertNull(fixture.requests.get(2).headers.get("cookie"));
        assertEquals(3, fixture.bodyCount());
    }

    @Test public void cookieBearing304CannotSynthesizeACached200() throws Exception {
        prime(); fixture.enqueue(validated(PHOTO_A).header("Set-Cookie", "fixture-rotation=not-cacheable; Secure; HttpOnly; Path=/"));
        try (Response ignored = get(PATH)) { fail("Cookie-bearing 304 replayed a cached photograph"); }
        catch (IOException expected) { /* No cached body may escape this validation. */ }
        fixture.enqueue(publicPhoto(PHOTO_B));
        try (Response response = get(PATH)) { assertNull(response.cacheResponse()); assertArrayEquals(PHOTO_B, response.body().bytes()); }
        assertNull(fixture.requests.get(2).headers.get("if-none-match"));
    }

    @Test public void missingOrInvalid304ProofFailsClosedAndEvicts() throws Exception {
        for (int i = 0; i < 2; i++) {
            prime(); Reply denied = validated(PHOTO_A);
            if (i == 0) denied.headers.remove("X-PineVela-Public-Photo");
            else denied.header("ETag", "W/" + tag(PHOTO_A));
            fixture.enqueue(denied);
            try (Response ignored = get(PATH)) { fail("Unverified 304 replayed a cached photograph"); }
            catch (IOException expected) {}
            fixture.enqueue(publicPhoto(PHOTO_B));
            try (Response response = get(PATH)) { assertNull(response.cacheResponse()); assertArrayEquals(PHOTO_B, response.body().bytes()); }
            assertNull(fixture.requests.get(i * 3 + 2).headers.get("if-none-match"));
        }
    }

    @Test public void pathsMethodsAndResponseProofAreAnExactAllowlist() throws Exception {
        String[] paths = { PATH + "?size=1", "/api/media/not-a-uuid", PATH + "/", "/api/not-media/" + UUID, PATH, PATH, PATH, PATH };
        for (int scenario = 0; scenario < paths.length; scenario++) {
            for (int attempt = 0; attempt < 2; attempt++) {
                Reply reply = publicPhoto(PHOTO_A);
                if (scenario == 5) reply.header("X-PineVela-Public-Photo", "true");
                if (scenario == 6) reply.header("ETag", tag(PHOTO_A).replace(UUID, "22222222-2222-4222-8222-222222222222"));
                if (scenario == 7) reply.header("Content-Type", "image/jpeg");
                fixture.enqueue(reply);
                Request.Builder request = new Request.Builder().url(fixture.url(paths[scenario]));
                if (scenario == 4) request.post(RequestBody.create("{}", MediaType.get("application/json")));
                try (Response response = client.newCall(request.build()).execute()) {
                    deniedPolicy(response); assertNull(response.cacheResponse());
                    assertArrayEquals(PHOTO_A, response.body().bytes());
                }
                assertNull(fixture.requests.get(scenario * 2 + attempt).headers.get("if-none-match"));
            }
        }
        assertEquals(16, fixture.requests.size());
    }

    @Test public void webpDisplayVariantsRevalidateWithSeparateCacheIdentities() throws Exception {
        for (String size : new String[] { "", "card", "thumb" }) {
            String path=PATH+(size.isEmpty()?"":"?size="+size);
            String etag=tag(PHOTO_A);if(!size.isEmpty())etag=etag.substring(0,etag.length()-1)+"-"+size+"-webp-v1\"";
            fixture.enqueue(publicPhoto(PHOTO_A).header("Content-Type","image/webp").header("ETag",etag));
            try(Response first=get(path)){assertNull(first.cacheResponse());assertEquals("image/webp",first.header("Content-Type"));assertArrayEquals(PHOTO_A,first.body().bytes());}
            fixture.enqueue(validated(PHOTO_A).header("ETag",etag));
            try(Response cached=get(path)){assertNotNull(cached.cacheResponse());assertEquals(304,cached.networkResponse().code());assertArrayEquals(PHOTO_A,cached.body().bytes());}
            assertEquals(etag,fixture.requests.get(fixture.requests.size()-1).headers.get("if-none-match"));
        }
        assertEquals(6,fixture.requests.size());
    }

    @Test public void networkFailureNeverFallsBackToAnOfflinePhoto() throws Exception {
        prime(); fixture.close();
        try (Response ignored = get(PATH)) { fail("Returned a stale public photo without server authorization"); }
        catch (IOException expected) {}
        assertEquals(1, fixture.requests.size());
    }

    @Test public void sensitiveVaryHeadersNeverPersistCredentialsOrImageBytes() throws Exception {
        String cookie = "fixture-sensitive-vary-cookie-value";
        String authorization = "Bearer fixture-sensitive-vary-auth-value";
        for (String vary : new String[] { "Cookie", "Accept-Encoding, cOoKiE", "Authorization", "Proxy-Authorization", "*" }) {
            prime();
            fixture.enqueue(publicPhoto(PHOTO_B).header("Vary", vary));
            Request request = new Request.Builder().url(fixture.url(PATH)).header("Cookie", cookie)
                .header("Authorization", authorization).get().build();
            try (Response response = client.newCall(request).execute()) {
                deniedPolicy(response); assertArrayEquals(PHOTO_B, response.body().bytes());
            }
            assertDiskDoesNotContain(cookie.getBytes(StandardCharsets.UTF_8), authorization.getBytes(StandardCharsets.UTF_8), PHOTO_A, PHOTO_B);
            fixture.enqueue(publicPhoto(PHOTO_A).header("Vary", vary));
            try (Response response = client.newCall(request).execute()) {
                deniedPolicy(response); assertNull(response.cacheResponse());
                assertArrayEquals(PHOTO_A, response.body().bytes());
            }
            assertNull(fixture.requests.get(fixture.requests.size() - 1).headers.get("if-none-match"));
            assertDiskDoesNotContain(cookie.getBytes(StandardCharsets.UTF_8), authorization.getBytes(StandardCharsets.UTF_8), PHOTO_A, PHOTO_B);
        }
    }

    private static final class Reply {
        final int status; final byte[] body;
        final Map<String, String> headers = new LinkedHashMap<>();
        Reply(int status, byte[] body) { this.status = status; this.body = body; }
        Reply header(String name, String value) { headers.put(name, value); return this; }
    }

    private static final class RecordedRequest {
        final String method, path; final Map<String, String> headers;
        RecordedRequest(String method, String path, Map<String, String> headers) { this.method = method; this.path = path; this.headers = headers; }
    }

    private static final class Tls {
        final SSLContext context; final X509TrustManager trustManager;
        Tls() throws Exception {
            KeyStore identity = KeyStore.getInstance("PKCS12");
            identity.load(new ByteArrayInputStream(Base64.decode(FIXTURE_KEYSTORE, Base64.DEFAULT)), FIXTURE_PASSWORD);
            KeyManagerFactory keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            keys.init(identity, FIXTURE_PASSWORD);
            KeyStore trusted = KeyStore.getInstance(KeyStore.getDefaultType()); trusted.load(null);
            trusted.setCertificateEntry("loopback-only", identity.getCertificate("public-media-fixture"));
            TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()); factory.init(trusted);
            X509TrustManager chosen = null;
            for (TrustManager manager : factory.getTrustManagers()) if (manager instanceof X509TrustManager) chosen = (X509TrustManager) manager;
            if (chosen == null) throw new IllegalStateException("Missing fixture trust manager");
            trustManager = chosen; context = SSLContext.getInstance("TLS");
            context.init(keys.getKeyManagers(), new TrustManager[] { trustManager }, new SecureRandom());
        }
    }

    private static final class Fixture implements AutoCloseable {
        final ServerSocket listener;
        final List<RecordedRequest> requests = Collections.synchronizedList(new ArrayList<>());
        final List<Integer> transmittedBodies = Collections.synchronizedList(new ArrayList<>());
        final AtomicReference<Throwable> failure = new AtomicReference<>();
        final BlockingQueue<Reply> replies = new LinkedBlockingQueue<>();
        final ExecutorService worker = Executors.newSingleThreadExecutor();
        volatile boolean closed;

        Fixture(Tls tls) throws Exception {
            listener = tls.context.getServerSocketFactory().createServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
            worker.execute(() -> {
                while (!closed) {
                    try (Socket socket = listener.accept()) {
                        socket.setSoTimeout(3000);
                        BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
                        String first = reader.readLine();
                        if (first == null) throw new IOException("Missing fixture request");
                        String[] start = first.split(" ", 3); if (start.length != 3) throw new IOException("Malformed fixture request");
                        Map<String, String> headers = new LinkedHashMap<>();
                        for (String line; (line = reader.readLine()) != null && !line.isEmpty();) {
                            int separator = line.indexOf(':');
                            if (separator > 0) headers.put(line.substring(0, separator).toLowerCase(Locale.ROOT), line.substring(separator + 1).trim());
                        }
                        int remaining = Integer.parseInt(headers.getOrDefault("content-length", "0"));
                        while (remaining-- > 0) if (reader.read() == -1) throw new IOException("Incomplete fixture request body");
                        requests.add(new RecordedRequest(start[0], start[1], headers));
                        Reply reply = replies.poll(3, TimeUnit.SECONDS);
                        if (reply == null) throw new IOException("Missing queued fixture response");
                        StringBuilder response = new StringBuilder("HTTP/1.1 " + reply.status + (reply.status == 304 ? " Not Modified\r\n" : " Fixture\r\n"));
                        response.append("Connection: close\r\n");
                        if (reply.status != 304) response.append("Content-Length: ").append(reply.body.length).append("\r\n");
                        for (Map.Entry<String, String> entry : reply.headers.entrySet()) response.append(entry.getKey()).append(": ").append(entry.getValue()).append("\r\n");
                        response.append("\r\n");
                        OutputStream output = socket.getOutputStream(); output.write(response.toString().getBytes(StandardCharsets.US_ASCII));
                        if (reply.status != 304) output.write(reply.body);
                        output.flush();
                        synchronized (transmittedBodies) { transmittedBodies.add(reply.status == 304 ? 0 : reply.body.length); transmittedBodies.notifyAll(); }
                    } catch (Throwable error) { if (!closed) failure.compareAndSet(null, error); }
                }
            });
        }

        String url(String path) { return "https://127.0.0.1:" + listener.getLocalPort() + path; }
        void enqueue(Reply reply) { replies.add(reply); }
        private void responsesComplete() throws InterruptedException {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
            synchronized (transmittedBodies) {
                while (transmittedBodies.size() < requests.size() && System.nanoTime() < deadline) transmittedBodies.wait(20);
                assertEquals("Fixture must finish each counted network response", requests.size(), transmittedBodies.size());
            }
        }
        int bodyCount() throws InterruptedException { responsesComplete(); int count = 0; synchronized (transmittedBodies) { for (int size : transmittedBodies) if (size > 0) count++; } return count; }
        int bodyBytes() throws InterruptedException { responsesComplete(); int count = 0; synchronized (transmittedBodies) { for (int size : transmittedBodies) count += size; } return count; }
        @Override public void close() throws Exception {
            if (closed) return;
            closed = true; listener.close(); worker.shutdownNow();
            worker.awaitTermination(3, TimeUnit.SECONDS);
        }
    }
}
