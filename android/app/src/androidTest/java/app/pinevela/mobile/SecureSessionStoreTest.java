package app.pinevela.mobile;

import android.content.Context;
import android.content.ContextWrapper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SecureSessionStoreTest {
    private Context isolatedContext() {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(app.getCacheDir(), "secure-store-test-" + System.nanoTime()); directory.mkdirs();
        return new ContextWrapper(app) { @Override public File getNoBackupFilesDir() { return directory; } };
    }

    @Test public void credentialsRoundTripOnlyInAuthenticatedCiphertext() throws Exception {
        Context context = isolatedContext(); SecureSessionStore store = new SecureSessionStore(context);
        String sentinel = "test-only-private-session-material";
        store.write(new JSONObject().put("cookies", sentinel));
        byte[] disk = Files.readAllBytes(new File(context.getNoBackupFilesDir(), "pinevela-session.aesgcm").toPath());
        assertFalse(new String(disk, StandardCharsets.ISO_8859_1).contains(sentinel));
        assertEquals(sentinel, new SecureSessionStore(context).read().getString("cookies"));
        byte[] first = disk.clone(); store.write(new JSONObject().put("cookies", sentinel));
        assertFalse(java.util.Arrays.equals(first, Files.readAllBytes(new File(context.getNoBackupFilesDir(), "pinevela-session.aesgcm").toPath())));
    }

    @Test public void modifiedCiphertextFailsClosed() throws Exception {
        Context context = isolatedContext(); SecureSessionStore store = new SecureSessionStore(context);
        store.write(new JSONObject().put("cookies", "test-only-secret"));
        try (RandomAccessFile file = new RandomAccessFile(new File(context.getNoBackupFilesDir(), "pinevela-session.aesgcm"), "rw")) {
            file.seek(file.length() - 1); int value = file.read(); file.seek(file.length() - 1); file.write(value ^ 1);
        }
        try { store.read(); fail("Accepted modified ciphertext"); } catch (javax.crypto.AEADBadTagException expected) {}
    }
}
