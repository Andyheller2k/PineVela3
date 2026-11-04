package app.pinevela.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(name = "PineVelaTransport")
public final class PineVelaTransportPlugin extends Plugin {
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(8));
    private final ThreadPoolExecutor apiWorker = new ThreadPoolExecutor(3, 3, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(16));
    private final Map<String, AtomicBoolean> pendingRequests = new ConcurrentHashMap<>();
    private final AtomicLong queuedBytes = new AtomicLong();
    private final AtomicLong authIntent = new AtomicLong();
    private final Object authIntentLock = new Object();
    private final SecureRandom random = new SecureRandom();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile NativeGoogleAttempt nativeGoogle;
    private volatile boolean completingAuth;

    private static final class NativeGoogleAttempt {
        final long intent;
        final PluginCall call;
        final NativeHttpClient client;
        final String verifier, mode;
        final JSONObject acceptance;
        final CancellationSignal cancellation = new CancellationSignal();
        final AtomicBoolean settled = new AtomicBoolean();
        Runnable timeout;
        volatile String requestId;
        NativeGoogleAttempt(long intent, PluginCall call, NativeHttpClient client, String verifier, String mode, JSONObject acceptance) {
            this.intent = intent; this.call = call; this.client = client; this.verifier = verifier; this.mode = mode; this.acceptance = acceptance;
        }
    }

    @PluginMethod
    public void request(PluginCall call) {
        final NativeHttpClient transport;
        try { transport = http(); }
        catch (Exception ignored) { call.reject("Secure session storage is unavailable.", "TRANSPORT_ERROR"); return; }
        String path = call.getString("path"), requestId = call.getString("requestId");
        String method;
        byte[] body;
        Map<String, String> headers = new LinkedHashMap<>();
        try {
            TransportPolicy.path(path);
            if (NativeHttpClient.operationPath(path).startsWith("/api/auth/mobile/")) throw new IllegalArgumentException();
            method = TransportPolicy.method(call.getString("method", "GET"));
            if (requestId == null || !requestId.matches("[A-Za-z0-9_-]{1,128}")) throw new IllegalArgumentException();
            String encoded = call.getString("bodyBase64", "");
            if (encoded.length() > ((long) TransportPolicy.bodyLimit(path) + 2) / 3 * 4 || !encoded.matches("[A-Za-z0-9+/]*={0,2}")) throw new IllegalArgumentException();
            body = Base64.decode(encoded, Base64.NO_WRAP);
            if (body.length > TransportPolicy.bodyLimit(path) || ((method.equals("GET") || method.equals("HEAD")) && body.length != 0)) throw new IllegalArgumentException();
            JSONObject inputHeaders = call.getObject("headers", new JSObject());
            if (inputHeaders.length() > 16) throw new IllegalArgumentException();
            Iterator<String> names = inputHeaders.keys();
            while (names.hasNext()) {
                String name = names.next(); Object value = inputHeaders.get(name);
                if (!(value instanceof String) || !TransportPolicy.requestHeader(name, (String) value)) throw new IllegalArgumentException();
                headers.put(name, (String) value);
            }
        } catch (Exception error) { call.reject("Invalid native API request.", "INVALID_REQUEST"); return; }
        AtomicBoolean cancelled = new AtomicBoolean(false);
        if (pendingRequests.putIfAbsent(requestId, cancelled) != null) { call.reject("Duplicate request identifier.", "INVALID_REQUEST"); return; }
        long queued = queuedBytes.addAndGet(body.length);
        if (queued > 32 * 1024 * 1024L) {
            queuedBytes.addAndGet(-body.length); pendingRequests.remove(requestId);
            call.reject("Native API request queue is full.", "BUSY"); return;
        }
        final long acceptedEpoch;
        try {
            synchronized (authIntentLock) {
                if (credentialRequest(path, method)) {
                    authIntent.incrementAndGet();
                    cancelNativeGoogleLocked();
                    transport.prepareCredentialAuth();
                    cancelQueuedRequestsExcept(requestId);
                }
                acceptedEpoch = transport.epoch();
            }
        } catch (Exception error) {
            queuedBytes.addAndGet(-body.length); pendingRequests.remove(requestId, cancelled);
            call.reject("Unable to start secure sign-in.", "TRANSPORT_ERROR"); return;
        }
        Runnable task = () -> {
                try {
                    NativeHttpClient.Result response = http().request(path, method, headers, body, requestId, cancelled::get, acceptedEpoch);
                    if (NativeHttpClient.operationPath(path).equals("/api/auth/logout") && method.equals("POST") && response.status >= 200 && response.status < 300)
                        NativeGoogleSignIn.clear(getContext());
                    JSObject result = new JSObject();
                    result.put("status", response.status); result.put("headers", new JSObject(new JSONObject(response.headers).toString()));
                    result.put("bodyBase64", Base64.encodeToString(response.body, Base64.NO_WRAP));
                    call.resolve(result);
                } catch (Exception error) { call.reject(cancelled.get() ? "Request cancelled." : "Unable to complete secure API request.", cancelled.get() ? "CANCELLED" : "TRANSPORT_ERROR"); }
                finally { queuedBytes.addAndGet(-body.length); pendingRequests.remove(requestId, cancelled); }
            };
        try {
            if (NativeHttpClient.operationPath(path).equals("/api/auth/logout") && method.equals("POST")) {
                NativeHttpClient client = http();
                synchronized (authIntentLock) { authIntent.incrementAndGet(); cancelNativeGoogleLocked(); client.prepareLogout(requestId); }
                for (Map.Entry<String, AtomicBoolean> entry : pendingRequests.entrySet()) if (!entry.getKey().equals(requestId)) {
                    entry.getValue().set(true); client.cancel(entry.getKey());
                }
                // A single bounded priority lane: a slow upload or a queue of
                // dashboard reads cannot make sign-out wait minutes.
                new Thread(task, "pinevela-secure-logout").start();
            } else apiWorker.execute(task);
        } catch (java.util.concurrent.RejectedExecutionException error) {
            queuedBytes.addAndGet(-body.length); pendingRequests.remove(requestId, cancelled);
            call.reject("Native API request queue is full.", "BUSY");
        } catch (Exception error) {
            queuedBytes.addAndGet(-body.length); pendingRequests.remove(requestId, cancelled);
            call.reject("Unable to close the secure session.", "TRANSPORT_ERROR");
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("requestId", ""); AtomicBoolean request = pendingRequests.get(id);
        if (request != null) { request.set(true); try { http().cancel(id); } catch (Exception ignored) {} }
        call.resolve();
    }

    @PluginMethod
    public void beginAuth(PluginCall call) {
        String mode = call.getString("mode");
        String provider = call.getString("provider");
        if ((!"login".equals(mode) && !"signup".equals(mode)) || (provider != null && !"google".equals(provider))) { call.reject("Invalid authentication mode.", "INVALID_REQUEST"); return; }
        JSObject acceptance = call.getObject("termsAcceptance");
        if (acceptance != null && (!"signup".equals(mode) || !"google".equals(provider) || acceptance.length() != 2
            || !Boolean.TRUE.equals(acceptance.opt("accepted")) || !(acceptance.opt("version") instanceof String)
            || !acceptance.optString("version").matches("\\d{4}-\\d{2}-\\d{2}"))) {
            call.reject("Accept the current Terms before signing up with Google.", "INVALID_REQUEST"); return;
        }
        if ("google".equals(provider) && "signup".equals(mode) && acceptance == null) {
            call.reject("Accept the current Terms before signing up with Google.", "INVALID_REQUEST"); return;
        }
        final long intent;
        final NativeHttpClient client;
        try {
            client = http();
            synchronized (authIntentLock) {
                intent = authIntent.incrementAndGet();
                cancelNativeGoogleLocked();
                // Invalidate immediately, before a queued older callback can be
                // mistaken for this new browser choice.
                client.prepareCredentialAuth();
                cancelQueuedRequestsExcept("");
            }
        } catch (Exception error) { call.reject("Unable to start secure sign-in.", "TRANSPORT_ERROR"); return; }
        if ("google".equals(provider)) {
            try {
                JSONObject terms = acceptance == null ? null : new JSONObject().put("accepted", true).put("version", acceptance.getString("version"));
                NativeGoogleAttempt attempt = new NativeGoogleAttempt(intent, call, client, randomToken(), mode, terms);
                synchronized (authIntentLock) { requireAuthIntent(intent); nativeGoogle = attempt; }
                submitNativeGoogle(attempt, () -> startNativeGoogle(attempt));
            } catch (Exception ignored) { call.reject("Unable to start secure Google sign-in.", "GOOGLE_SIGN_IN_FAILED"); }
            return;
        }
        queue(call, () -> {
            try {
            String verifier = randomToken(), state = randomToken();
            String challenge = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            JSONObject pending = new JSONObject().put("verifier", verifier).put("state", state).put("expiresAt", System.currentTimeMillis() + 10 * 60_000L);
            final long acceptedEpoch;
            synchronized (authIntentLock) {
                requireAuthIntent(intent);
                client.pending(pending);
                acceptedEpoch = client.epoch();
            }
            JSONObject body = new JSONObject().put("challenge", challenge).put("state", state).put("mode", mode).put("client", BuildConfig.DEBUG ? "android-debug" : "android");
            if (provider != null) body.put("provider", provider);
            if (acceptance != null) body.put("termsAcceptance", new JSONObject().put("accepted", true).put("version", acceptance.getString("version")));
            NativeHttpClient.Result result = client.request("/api/auth/mobile/start", "POST", Collections.emptyMap(), body.toString().getBytes(StandardCharsets.UTF_8), "native-auth-start", () -> authIntent.get() != intent, acceptedEpoch);
            if (result.status != 200 && result.status != 201) throw new SecurityException();
            JSONObject response = new JSONObject(new String(result.body, StandardCharsets.UTF_8));
            String url = TransportPolicy.browserUrl(response.optString("browserUrl"), client.origin);
            getActivity().runOnUiThread(() -> {
                try {
                    synchronized (authIntentLock) {
                        requireAuthIntent(intent);
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url)); browserIntent.addCategory(Intent.CATEGORY_BROWSABLE);
                        getActivity().startActivity(browserIntent);
                        JSObject responseState = new JSObject(); responseState.put("pending", true); call.resolve(responseState);
                    }
                } catch (Exception error) {
                    try { worker.execute(() -> abortAuthIntent(client, intent)); } catch (Exception ignored) {}
                    call.reject("No browser is available for secure sign-in.", "BROWSER_UNAVAILABLE");
                }
            });
            } catch (Exception error) { abortAuthIntent(client, intent); throw error; }
        });
    }

    private void startNativeGoogle(NativeGoogleAttempt attempt) throws Exception {
        final long epoch;
        synchronized (authIntentLock) { requireNativeGoogle(attempt); epoch = attempt.client.epoch(); }
        String challenge = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(attempt.verifier.getBytes(StandardCharsets.US_ASCII)), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        JSONObject body = new JSONObject().put("challenge", challenge).put("mode", attempt.mode).put("client", BuildConfig.DEBUG ? "android-debug" : "android");
        if (attempt.acceptance != null) body.put("termsAcceptance", attempt.acceptance);
        attempt.requestId = "native-google-start-" + attempt.intent;
        NativeHttpClient.Result reply = attempt.client.request(NativeGoogleAuthPolicy.START, "POST", Collections.emptyMap(), body.toString().getBytes(StandardCharsets.UTF_8),
            attempt.requestId, () -> authIntent.get() != attempt.intent || attempt.settled.get(), epoch);
        if (reply.status != 200) { rejectNativeGoogleReply(attempt, reply, true); return; }
        JSONObject config = new JSONObject(new String(reply.body, StandardCharsets.UTF_8));
        if (config.length() != 4 || !(config.opt("flowId") instanceof String) || !(config.opt("nonce") instanceof String)
            || !(config.opt("serverClientId") instanceof String) || !(config.opt("expiresAt") instanceof String)) throw new SecurityException();
        final String flowId = config.getString("flowId"), nonce = config.getString("nonce"), serverClientId = config.getString("serverClientId");
        final long deadline = NativeGoogleAuthPolicy.validateStart(flowId, nonce, serverClientId, config.getString("expiresAt"), System.currentTimeMillis());
        synchronized (authIntentLock) {
            requireNativeGoogle(attempt);
            attempt.timeout = () -> failNativeGoogle(attempt, "Google sign-in took too long. Start again from the app.", "GOOGLE_TIMEOUT");
            main.postDelayed(attempt.timeout, Math.max(1L, Math.min(NativeGoogleAuthPolicy.MAX_LIFETIME_MS, deadline - System.currentTimeMillis())));
        }
        getActivity().runOnUiThread(() -> {
            synchronized (authIntentLock) {
                if (!currentNativeGoogle(attempt)) return;
                NativeGoogleSignIn.request(getActivity(), serverClientId, nonce, attempt.cancellation, new NativeGoogleSignIn.Result() {
                    @Override public void credential(String token) { submitNativeGoogle(attempt, () -> completeNativeGoogle(attempt, flowId, token)); }
                    @Override public void failure(String message, String code) { failNativeGoogle(attempt, message, code); }
                });
            }
        });
    }

    private void completeNativeGoogle(NativeGoogleAttempt attempt, String flowId, String idToken) throws Exception {
        if (!NativeGoogleAuthPolicy.validToken(idToken)) throw new SecurityException();
        final long epoch;
        synchronized (authIntentLock) {
            requireNativeGoogle(attempt);
            invalidateIdentityRequests(attempt.client, true);
            epoch = attempt.client.epoch();
        }
        JSONObject body = new JSONObject().put("flowId", flowId).put("verifier", attempt.verifier).put("idToken", idToken);
        attempt.requestId = "native-google-complete-" + attempt.intent;
        NativeHttpClient.Result reply = attempt.client.request(NativeGoogleAuthPolicy.COMPLETE, "POST", Collections.emptyMap(), body.toString().getBytes(StandardCharsets.UTF_8),
            attempt.requestId, () -> authIntent.get() != attempt.intent || attempt.settled.get(), epoch);
        if (reply.status != 200) { rejectNativeGoogleReply(attempt, reply, false); return; }
        // The transport validated this exact success document before committing
        // the fresh cookie pair. No provider credential is exposed in the result.
        JSONObject success = new JSONObject(new String(reply.body, StandardCharsets.UTF_8));
        String destination = NativeGoogleAuthPolicy.destination(success.getString("redirectTo"));
        synchronized (authIntentLock) {
            requireNativeGoogle(attempt);
            if (!attempt.client.hasSession()) throw new SecurityException();
            attempt.client.authResolved();
            attempt.settled.set(true); nativeGoogle = null;
            if (attempt.timeout != null) main.removeCallbacks(attempt.timeout);
            JSObject result = new JSObject(); result.put("pending", false); result.put("authenticated", true); result.put("redirectTo", destination);
            attempt.call.resolve(result);
            JSObject event = new JSObject(); event.put("redirectTo", destination);
            notifyListeners("authComplete", event, true);
        }
    }

    private void rejectNativeGoogleReply(NativeGoogleAttempt attempt, NativeHttpClient.Result reply, boolean starting) {
        String code = "";
        try { code = new JSONObject(new String(reply.body, StandardCharsets.UTF_8)).optString("code"); } catch (Exception ignored) {}
        if ("terms_version_changed".equals(code) || "terms_acceptance_required".equals(code))
            failNativeGoogle(attempt, "Read and accept the current Terms before signing up with Google.", "GOOGLE_TERMS_REQUIRED");
        else if ("account_choice_required".equals(code))
            failNativeGoogle(attempt, "Choose your resident or seller portal and sign in with its credentials.", "GOOGLE_ACCOUNT_CHOICE_REQUIRED");
        else if ("portal_pin_required".equals(code))
            failNativeGoogle(attempt, "This portal requires its access PIN. Sign in with your portal credentials.", "GOOGLE_PORTAL_PIN_REQUIRED");
        else if (reply.status == 429)
            failNativeGoogle(attempt, "Too many sign-in attempts. Wait a minute, then try again.", "GOOGLE_RATE_LIMITED");
        else if (starting && (reply.status == 404 || reply.status == 503))
            failNativeGoogle(attempt, "Native Google sign-in is not available yet. Apply the latest PineVela server update, then try again.", "GOOGLE_NOT_CONFIGURED");
        else failNativeGoogle(attempt, starting ? "Google sign-in could not start. Check your connection and try again."
            : "Google could not sign in to this PineVela account. Check your account and try again.", "GOOGLE_SIGN_IN_FAILED");
    }

    private void submitNativeGoogle(NativeGoogleAttempt attempt, CheckedTask task) {
        try { worker.execute(() -> { try { task.run(); } catch (Exception ignored) { failNativeGoogle(attempt, "Google sign-in could not finish. Check your connection and try again.", "GOOGLE_SIGN_IN_FAILED"); } }); }
        catch (java.util.concurrent.RejectedExecutionException ignored) { failNativeGoogle(attempt, "Sign-in is busy. Try again shortly.", "BUSY"); }
    }
    private boolean currentNativeGoogle(NativeGoogleAttempt attempt) { return nativeGoogle == attempt && !attempt.settled.get() && authIntent.get() == attempt.intent; }
    private void requireNativeGoogle(NativeGoogleAttempt attempt) { if (!currentNativeGoogle(attempt)) throw new IllegalStateException("Google sign-in was superseded."); }
    private void failNativeGoogle(NativeGoogleAttempt attempt, String message, String code) {
        synchronized (authIntentLock) {
            if (!currentNativeGoogle(attempt)) return;
            authIntent.incrementAndGet();
            attempt.client.invalidateIdentityRequests(false);
            try { attempt.client.abortAuthTransition(); } catch (Exception ignored) {}
            nativeGoogle = null; attempt.settled.set(true);
            if (attempt.timeout != null) main.removeCallbacks(attempt.timeout);
            if (attempt.requestId != null) attempt.client.cancel(attempt.requestId);
            attempt.cancellation.cancel();
            attempt.call.reject(message, code);
        }
    }
    /** Caller first advances authIntent and then establishes the new epoch. */
    private void cancelNativeGoogleLocked() {
        NativeGoogleAttempt attempt = nativeGoogle; nativeGoogle = null;
        if (attempt == null || !attempt.settled.compareAndSet(false, true)) return;
        if (attempt.timeout != null) main.removeCallbacks(attempt.timeout);
        if (attempt.requestId != null) attempt.client.cancel(attempt.requestId);
        attempt.cancellation.cancel();
        attempt.call.reject("Google sign-in was cancelled by another account action.", "GOOGLE_CANCELLED");
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String value = call.getString("url");
        try {
            URI url = new URI(value == null ? "" : value);
            if (!"https".equals(url.getScheme()) || url.getHost() == null || url.getRawUserInfo() != null ||
                url.getPort() != -1 || value.length() > 8192 || value.matches(".*[\\x00-\\x20\\x7f].*")) throw new IllegalArgumentException();
            getActivity().runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(value)); intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    getActivity().startActivity(intent); call.resolve();
                } catch (Exception ignored) { call.reject("No browser is available.", "BROWSER_UNAVAILABLE"); }
            });
        } catch (Exception ignored) { call.reject("Invalid external link.", "INVALID_REQUEST"); }
    }

    @PluginMethod
    public void getStatus(PluginCall call) { status(call); }

    @PluginMethod
    public void resumeAuth(PluginCall call) {
        queue(call, () -> {
            if (Boolean.TRUE.equals(call.getBoolean("acknowledge", false))) http().acknowledgeAuth();
            JSObject result = new JSObject(); result.put("pending", nativeGoogle != null || http().pending() != null || completingAuth); call.resolve(result);
        });
    }

    private void status(PluginCall call) {
        queue(call, () -> {
            JSObject result = new JSObject(); result.put("pending", nativeGoogle != null || http().pending() != null || completingAuth); call.resolve(result);
        });
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        URI callback;
        Map<String, String> query = new LinkedHashMap<>();
        try {
            callback = new URI(intent.getData().toString());
            if (!TransportPolicy.callback(callback, BuildConfig.DEBUG ? "pinevela-debug" : "pinevela")) return;
            for (String part : callback.getRawQuery().split("&", -1)) {
                String[] pair = part.split("=", 2);
                if (pair.length != 2 || !pair[0].matches("code|state") || !pair[1].matches("[A-Za-z0-9_-]{32,256}") || query.put(pair[0], pair[1]) != null) return;
            }
            if (query.size() != 2) return;
        } catch (Exception ignored) { return; }
        try { worker.execute(() -> completeAuth(query)); } catch (java.util.concurrent.RejectedExecutionException ignored) { authError(); }
    }

    private void completeAuth(Map<String, String> query) {
        long intent = -1;
        try {
            NativeHttpClient client = http(); final JSONObject pending; final long acceptedEpoch;
            synchronized (authIntentLock) {
                pending = client.pending();
                if (pending == null || !MessageDigest.isEqual(pending.optString("state").getBytes(StandardCharsets.US_ASCII), query.get("state").getBytes(StandardCharsets.US_ASCII))) return;
                intent = authIntent.get();
                completingAuth = true;
                invalidateIdentityRequests(client, true);
                // Consume before exchange. Duplicate/deferred intents cannot replay an exchange.
                client.clearPending();
                acceptedEpoch = client.epoch();
            }
            final long expectedIntent = intent;
            JSONObject body = new JSONObject().put("code", query.get("code")).put("state", query.get("state")).put("verifier", pending.getString("verifier"));
            NativeHttpClient.Result response = client.request("/api/auth/mobile/exchange", "POST", Collections.emptyMap(), body.toString().getBytes(StandardCharsets.UTF_8), "native-auth-exchange", () -> authIntent.get() != expectedIntent, acceptedEpoch);
            if (response.status != 200 || !client.hasSession()) throw new SecurityException();
            JSONObject result = new JSONObject(new String(response.body, StandardCharsets.UTF_8));
            synchronized (authIntentLock) {
                requireAuthIntent(expectedIntent);
                client.authResolved();
                JSObject event = new JSObject(); event.put("redirectTo", TransportPolicy.redirect(result.optString("redirectTo", "/user/dashboard")));
                // request() persists the secure cookie jar before returning.
                notifyListeners("authComplete", event, true);
            }
        } catch (Exception ignored) {
            try { abortAuthIntent(http(), intent); } catch (Exception ignoredAgain) {}
            if (intent >= 0 && authIntent.get() == intent) authError();
        }
        finally { completingAuth = false; }
    }

    private void authError() {
        JSObject error = new JSObject(); error.put("code", "AUTH_HANDOFF_FAILED");
        notifyListeners("authError", error, true);
    }

    private NativeHttpClient http() throws Exception { return NativeHttpClient.get(getContext()); }
    static boolean credentialRequest(String path, String method) {
        if (!"POST".equals(method)) return false;
        switch (NativeHttpClient.operationPath(path)) {
            case "/api/auth/login": case "/api/auth/register-unified": case "/api/auth/verify-unified":
            case "/api/auth/primary-reentry": case "/api/auth/primary-reentry/verify":
            case "/api/digital-market/login": case "/api/auth/verification-team-login": case "/api/verification-teams/login": return true;
            default: return false;
        }
    }
    private void cancelQueuedRequestsExcept(String keep) {
        for (Map.Entry<String, AtomicBoolean> entry : pendingRequests.entrySet()) if (!entry.getKey().equals(keep)) entry.getValue().set(true);
    }
    private void requireAuthIntent(long intent) {
        if (authIntent.get() != intent) throw new IllegalStateException("Sign-in was superseded by another account action.");
    }
    private void abortAuthIntent(NativeHttpClient client, long intent) {
        synchronized (authIntentLock) {
            if (authIntent.get() == intent) try { client.abortAuthTransition(); } catch (Exception ignored) {}
        }
    }
    private void invalidateIdentityRequests(NativeHttpClient client, boolean exchangingIdentity) {
        for (Map.Entry<String, AtomicBoolean> entry : pendingRequests.entrySet()) entry.getValue().set(true);
        client.invalidateIdentityRequests(exchangingIdentity);
    }
    private String randomToken() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING); }
    private interface CheckedTask { void run() throws Exception; }
    private void queue(PluginCall call, CheckedTask task) {
        try { worker.execute(() -> { try { task.run(); } catch (Exception ignored) { call.reject("Unable to complete secure authentication.", "AUTH_HANDOFF_FAILED"); } }); }
        catch (java.util.concurrent.RejectedExecutionException ignored) { call.reject("Native API request queue is full.", "BUSY"); }
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (authIntentLock) {
            authIntent.incrementAndGet();
            NativeGoogleAttempt attempt = nativeGoogle;
            cancelNativeGoogleLocked();
            if (attempt != null) {
                attempt.client.invalidateIdentityRequests(false);
                try { attempt.client.abortAuthTransition(); } catch (Exception ignored) {}
            }
        }
        for (Map.Entry<String, AtomicBoolean> entry : pendingRequests.entrySet()) {
            entry.getValue().set(true); try { http().cancel(entry.getKey()); } catch (Exception ignored) {}
        }
        worker.shutdown();
        apiWorker.shutdown();
    }
}
