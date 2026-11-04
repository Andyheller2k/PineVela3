/*
 * Upstream blocklist data Copyright (c) 2026 OkHttp Authors.
 * Licensed under the Apache License, Version 2.0.
 * https://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed
 * under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 * CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 *
 * Java network-interceptor adaptation of the eight-SPKI check in:
 * https://github.com/square/okhttp/blob/parent-5.5.1/okhttp/src/commonJvmAndroid/kotlin/okhttp3/internal/tls/CertificateBlocklist.kt
 * Pinned release 5.5.1 (2026-10-22), CVE-2026-111943.
 * Default platform certificate and hostname verification still happen first.
 * This check runs before CallServerInterceptor sends HTTP headers/body.
 */
package app.pinevela.mobile;

import okhttp3.Connection;
import okhttp3.Handshake;
import okhttp3.Interceptor;
import okhttp3.Response;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import javax.net.ssl.SSLPeerUnverifiedException;

final class CompromisedCertificateGuard implements Interceptor {
    private static final Set<String> BLOCKED = new HashSet<>(Arrays.asList(
        "43bffa19d6ef651451f6841e019931e96f6f2eaeff28ab4b6f1ce4576de2717b",
        "49dd353dc2b919a3770645117d0e60c16115e7d1bc259eefe734b00ea434fe5f",
        "5c0660a2b164910d8ff589c18e14552e9e0ec237dcefe2cb736d41a4811f81a0",
        "63ecefee431d49523bc1136c4e72d0206a477086caf606cd5cf025686c109cf8",
        "92c063d67e8f14db71d288e11266ffdaf69cbf115f7bab14f3bc2f68d25e0e30",
        "e0254c7fcdc265e2f0f8a428dabb75ab4ae039b4872d62f5ee57f0877d5a8a41",
        "ebed6475c2c2d80fcb199f3fe8dd6e6b3ce60b77eb15d4e42c3dec0c6f5b5105",
        "ec4ffa1ad0ac88081314b7aaffef6a91f97cd57291bb5ba686c5415f5eb4f6b6"
    ));

    static boolean blocked(String fingerprint) { return BLOCKED.contains(fingerprint); }
    static String sha256(byte[] publicKeySpki) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(publicKeySpki);
        StringBuilder hex = new StringBuilder(64);
        for (byte value : digest) { hex.append(Character.forDigit((value >>> 4) & 15, 16)); hex.append(Character.forDigit(value & 15, 16)); }
        return hex.toString();
    }

    @Override public Response intercept(Chain chain) throws IOException {
        Connection connection = chain.connection();
        Handshake handshake = connection == null ? null : connection.handshake();
        if (handshake == null) throw new SSLPeerUnverifiedException("Secure transport requires a verified TLS handshake.");
        try {
            for (Certificate certificate : handshake.peerCertificates()) {
                if (!(certificate instanceof X509Certificate) || blocked(sha256(certificate.getPublicKey().getEncoded())))
                    throw new SSLPeerUnverifiedException("Certificate is not permitted for secure transport.");
            }
        } catch (SSLPeerUnverifiedException error) { throw error; }
        catch (Exception error) { throw new SSLPeerUnverifiedException("Unable to validate secure transport certificate."); }
        return chain.proceed(chain.request());
    }
}
