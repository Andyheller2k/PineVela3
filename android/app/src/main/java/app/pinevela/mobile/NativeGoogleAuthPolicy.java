package app.pinevela.mobile;

import java.nio.charset.StandardCharsets;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONObject;

/** Native-only protocol validation. These values never become WebView credentials. */
final class NativeGoogleAuthPolicy {
    static final String START = "/api/auth/mobile/google/native/start";
    static final String COMPLETE = "/api/auth/mobile/google/native/complete";
    static final long MAX_LIFETIME_MS = 5 * 60_000L;
    private static final Set<String> DESTINATIONS = new HashSet<>(Arrays.asList(
        "/user/dashboard", "/student/dashboard", "/digital-market", "/digital-market/onboard",
        "/admin/dashboard", "/manager/dashboard", "/staff/dashboard", "/field-officer", "/customer-service"
    ));

    static long validateStart(String flowId, String nonce, String serverClientId, String expiresAt, long now) {
        if (flowId == null || !flowId.matches("[A-Za-z0-9_-]{43}") || nonce == null || !nonce.matches("[a-f0-9]{64}")
            || serverClientId == null || !serverClientId.matches("[0-9]{6,32}-[a-z0-9]{16,100}\\.apps\\.googleusercontent\\.com")
            || expiresAt == null || !expiresAt.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z"))
            throw new IllegalArgumentException("Invalid native Google configuration.");
        // SimpleDateFormat also works on the app's existing Android24 minimum.
        SimpleDateFormat parser = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        parser.setTimeZone(TimeZone.getTimeZone("UTC")); parser.setLenient(false);
        ParsePosition position = new ParsePosition(0); Date expiry = parser.parse(expiresAt, position);
        if (expiry == null || position.getIndex() != expiresAt.length() || expiry.getTime() <= now
            || expiry.getTime() > now + MAX_LIFETIME_MS + 30_000L)
            throw new IllegalArgumentException("Expired native Google configuration.");
        return expiry.getTime();
    }

    static boolean validToken(String value) {
        return value != null && value.length() >= 32 && value.length() <= 16_384
            && value.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+");
    }

    static String destination(String value) {
        if (!DESTINATIONS.contains(value)) throw new IllegalArgumentException("Invalid native Google destination.");
        return value;
    }

    /** Validate the entire success body before native credentials are committed. */
    static String completion(byte[] body) {
        try {
            if (body == null || body.length > 1024) throw new IllegalArgumentException();
            JSONObject response = new JSONObject(new String(body, StandardCharsets.UTF_8));
            if (response.length() != 2 || !Boolean.TRUE.equals(response.opt("authenticated"))
                || !(response.opt("redirectTo") instanceof String)) throw new IllegalArgumentException();
            return destination(response.getString("redirectTo"));
        } catch (Exception ignored) {
            throw new IllegalArgumentException("Invalid native Google completion response.");
        }
    }

    static boolean completePath(String value) { return COMPLETE.equals(canonicalPath(value)); }
    static boolean startPath(String value) { return START.equals(canonicalPath(value)); }
    private static String canonicalPath(String value) {
        return value == null ? "" : value.split("\\?", 2)[0].toLowerCase(Locale.ROOT).replaceAll("/+$", "");
    }
}
