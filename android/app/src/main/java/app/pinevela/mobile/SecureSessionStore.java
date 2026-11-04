package app.pinevela.mobile;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Session material never enters WebView cookies, Preferences, backup or JavaScript. */
final class SecureSessionStore {
    private static final String KEY_ALIAS = "pinevela.native.session.v1";
    private static final byte[] AAD = "PineVelaNativeSession:1".getBytes(StandardCharsets.UTF_8);
    private final AtomicFile file;

    SecureSessionStore(Context context) {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "pinevela-session.aesgcm"));
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).setKeySize(256).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }

    synchronized JSONObject read() throws Exception {
        if (!file.getBaseFile().exists()) return new JSONObject();
        byte[] bytes = file.readFully();
        if (bytes.length < 29 || bytes.length > 65536) throw new SecurityException("Invalid secure session.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, bytes, 0, 12));
        cipher.updateAAD(AAD);
        return new JSONObject(new String(cipher.doFinal(bytes, 12, bytes.length - 12), StandardCharsets.UTF_8));
    }

    synchronized void write(JSONObject state) throws Exception {
        byte[] plain = state.toString().getBytes(StandardCharsets.UTF_8);
        if (plain.length > 60000) throw new SecurityException("Secure session limit exceeded.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD(AAD);
        byte[] ciphertext = cipher.doFinal(plain), iv = cipher.getIV();
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(iv); output.write(ciphertext);
            file.finishWrite(output);
        } catch (Exception error) { if (output != null) file.failWrite(output); throw error; }
    }
}
