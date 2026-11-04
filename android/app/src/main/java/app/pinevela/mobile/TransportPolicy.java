package app.pinevela.mobile;

import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Pure policy checks, shared by the bridge and protected-image transport. */
final class TransportPolicy {
    static final int GENERAL_BODY_LIMIT = 1024 * 1024;
    static final int RESPONSE_LIMIT = 8 * 1024 * 1024;
    static final int MEDIA_LIMIT = 6 * 1024 * 1024;
    private static final Set<String> METHODS = new HashSet<>(Arrays.asList("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"));
    private static final Set<String> REQUEST_HEADERS = new HashSet<>(Arrays.asList(
        "accept", "content-type", "if-none-match", "x-pinevela-manager-key", "x-pinevela-profile-context", "x-pinevela-account-context", "x-pinevela-ai-provider", "x-pinevela-session"
    ));
    private static final Set<String> RESPONSE_HEADERS = new HashSet<>(Arrays.asList(
        "content-type", "cache-control", "content-language", "retry-after", "etag", "last-modified", "x-content-type-options"
    ));
    private static final Set<String> DESTINATIONS = new HashSet<>(Arrays.asList(
        "/", "/login", "/signup", "/dashboard", "/user", "/student", "/manager", "/merchant", "/seller", "/staff", "/admin", "/officer", "/market", "/digital-market",
        "/user/dashboard", "/student/dashboard", "/manager/dashboard", "/merchant/dashboard", "/seller/dashboard", "/staff/dashboard", "/admin/dashboard", "/field-officer", "/customer-service"
    ));

    static String path(String value) {
        if (value == null || value.length() > 8192 || !value.startsWith("/api/") || value.indexOf('\\') >= 0 ||
            value.indexOf('#') >= 0 || value.matches(".*[\\x00-\\x20\\x7f].*")) throw new IllegalArgumentException("Invalid API path.");
        try {
            URI uri = new URI(value);
            String rawPath = uri.getRawPath();
            if (uri.isAbsolute() || uri.getRawAuthority() != null || uri.getFragment() != null ||
                rawPath == null || !rawPath.startsWith("/api/") || !rawPath.equals(uri.normalize().getRawPath()) ||
                rawPath.contains("//") || !rawPath.matches("/api/[A-Za-z0-9/_~.\\-]*")) throw new IllegalArgumentException();
            return value;
        } catch (Exception error) { throw new IllegalArgumentException("Invalid API path."); }
    }

    static String method(String value) {
        String method = value == null ? "GET" : value.toUpperCase(Locale.ROOT);
        if (!METHODS.contains(method)) throw new IllegalArgumentException("Unsupported request method.");
        return method;
    }

    static int bodyLimit(String path) {
        String clean = path.split("\\?", 2)[0];
        if (clean.matches("/api/storage/upload-(hostel|market|inspection|maintenance|repair)-image")) return 28 * 1024 * 1024;
        if (clean.equals("/api/storage/upload-profile-image") || clean.equals("/api/storage/upload-admin-profile")) return 7 * 1024 * 1024;
        return GENERAL_BODY_LIMIT;
    }

    static boolean requestHeader(String key, String value) {
        return key != null && value != null && key.length() <= 128 && value.length() <= 8192 &&
            REQUEST_HEADERS.contains(key.toLowerCase(Locale.ROOT)) && value.chars().noneMatch(character -> character <= 31 || character == 127);
    }

    static boolean responseHeader(String key) { return key != null && RESPONSE_HEADERS.contains(key.toLowerCase(Locale.ROOT)); }

    static boolean localDocument(String value) {
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && uri.getPort() == -1 && uri.getRawUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }

    static boolean captchaDocument(String value) {
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme()) && "pinevela.app".equals(uri.getHost()) && uri.getPort() == -1
                && uri.getRawUserInfo() == null && "/api/auth/mobile/captcha".equals(uri.getRawPath())
                && uri.getRawQuery() == null && uri.getRawFragment() == null;
        } catch (Exception ignored) { return false; }
    }

    static boolean captchaChildFrame(String value) { return "about:blank".equals(value) || "about:srcdoc".equals(value); }

    static String browserUrl(String value, String origin) {
        try {
            URI uri = new URI(value), base = new URI(origin);
            if (!"https".equals(uri.getScheme()) || !base.getHost().equals(uri.getHost()) || uri.getPort() != base.getPort() ||
                uri.getRawUserInfo() != null || uri.getFragment() != null || !"/api/auth/mobile/browser".equals(uri.getRawPath()) ||
                !uri.getRawPath().equals(uri.normalize().getRawPath())) throw new IllegalArgumentException();
            return value;
        } catch (Exception error) { throw new IllegalArgumentException("Invalid authentication destination."); }
    }

    static boolean callback(URI uri, String expectedScheme) {
        return expectedScheme.equals(uri.getScheme()) && "auth".equals(uri.getHost()) && uri.getPort() == -1 &&
            uri.getRawUserInfo() == null && "/callback".equals(uri.getRawPath()) && uri.getFragment() == null && uri.getRawQuery() != null &&
            !uri.getRawQuery().matches(".*[\\x00-\\x20\\x7f].*");
    }

    static String redirect(String value) {
        if (value == null || value.length() > 256 || value.indexOf('?') >= 0 || value.indexOf('#') >= 0) return "/dashboard";
        return DESTINATIONS.contains(value) ? value : "/dashboard";
    }
}
