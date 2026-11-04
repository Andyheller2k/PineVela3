package app.pinevela.mobile;

import java.io.IOException;
import java.util.Iterator;
import okhttp3.Cache;
import okhttp3.Interceptor;
import okhttp3.Request;
import okhttp3.Response;

/** Only server-verified public catalogue photos may enter the native disk cache. */
final class PublicMediaCacheInterceptor implements Interceptor {
    static final long MAX_BYTES = 20L * 1024 * 1024;
    private final Cache cache;

    PublicMediaCacheInterceptor(Cache cache) { this.cache = cache; }

    @Override public Response intercept(Chain chain) throws IOException {
        Request request = chain.request();
        Response response = chain.proceed(request);
        String path = request.url().encodedPath();
        String id = path.substring(path.lastIndexOf('/') + 1).toLowerCase(java.util.Locale.ROOT);
        boolean allowed = "GET".equals(request.method()) && request.url().query() == null
            && path.matches("/api/media/[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}")
            && "1".equals(response.header("X-PineVela-Public-Photo"))
            && response.headers("Set-Cookie").isEmpty()
            && !variesOnCredentials(response)
            && response.header("ETag", "").matches("\"pv-" + id + "-[a-f0-9]{64}\"")
            && (response.code() == 304 || (response.code() == 200
                && "image/png".equals(response.header("Content-Type"))
                && response.body() != null && response.body().contentLength() <= TransportPolicy.MEDIA_LIMIT));
        if (allowed) {
            // Revalidate every new retrieval. Never replay an offline/stale photo
            // after the server withdraws a listing or changes its visibility.
            return response.newBuilder().header("Cache-Control", "private, no-cache, max-age=0, must-revalidate").build();
        }
        // OkHttp can otherwise retain old public metadata when a URL becomes
        // private, or merge a cookie-bearing 304 into a previously cached entry.
        try {
            Iterator<String> urls = cache.urls();
            while (urls.hasNext()) if (request.url().toString().equals(urls.next())) urls.remove();
        } catch (IOException ignored) { /* No-cache remains fail closed below. */ }
        if (response.code() == 304) {
            response.close();
            throw new IOException("Unverified photograph cache validation.");
        }
        return response.newBuilder().header("Cache-Control", "private, no-store").build();
    }

    private static boolean variesOnCredentials(Response response) {
        // OkHttp persists Vary request headers alongside each body. Never let a
        // reverse-proxy header cause a session credential to be written there.
        for (String header : response.headers("Vary")) for (String name : header.split(",")) {
            String field = name.trim();
            if (field.equals("*") || field.equalsIgnoreCase("Cookie") || field.equalsIgnoreCase("Authorization")
                || field.equalsIgnoreCase("Proxy-Authorization")) return true;
        }
        return false;
    }
}
