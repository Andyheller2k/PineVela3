package app.pinevela.mobile;

import android.app.Activity;
import android.content.Context;
import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialUnsupportedException;
import androidx.credentials.exceptions.NoCredentialException;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/** Android owns this entire credential interaction; neither tokens nor provider
 * exception text is returned through Capacitor or written to logs/storage. */
final class NativeGoogleSignIn {
    interface Result {
        void credential(String token);
        void failure(String message, String code);
    }

    static void request(Activity activity, String serverClientId, String nonce, CancellationSignal cancellation, Result result) {
        try {
            GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId).setNonce(nonce).build();
            GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
            CredentialManager.create(activity).getCredentialAsync(activity, request, cancellation,
                ContextCompat.getMainExecutor(activity), new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override public void onResult(GetCredentialResponse response) {
                        try { result.credential(token(response.getCredential())); }
                        catch (Exception ignored) { result.failure("Google returned an unsupported sign-in response. Try again.", "GOOGLE_RESPONSE_INVALID"); }
                    }
                    @Override public void onError(GetCredentialException error) {
                        if (error instanceof GetCredentialCancellationException)
                            result.failure("Google sign-in was cancelled.", "GOOGLE_CANCELLED");
                        else if (error instanceof NoCredentialException)
                            result.failure("No Google account is available. Add an account to this phone, then try again.", "GOOGLE_NO_ACCOUNT");
                        else if (error instanceof GetCredentialProviderConfigurationException || error instanceof GetCredentialUnsupportedException)
                            result.failure("Google sign-in needs Google Play services on this phone. Update them, then try again.", "GOOGLE_UNAVAILABLE");
                        else result.failure("Google sign-in could not start. Check your connection and try again.", "GOOGLE_SIGN_IN_FAILED");
                    }
                });
        } catch (Exception ignored) { result.failure("Google sign-in is unavailable on this phone. Update Google Play services and try again.", "GOOGLE_UNAVAILABLE"); }
    }

    static String token(Credential credential) {
        if (!(credential instanceof CustomCredential) || !(GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())
            || GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_SIWG_CREDENTIAL.equals(credential.getType())))
            throw new IllegalArgumentException("Unsupported Google credential.");
        String token = GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
        if (!NativeGoogleAuthPolicy.validToken(token)) throw new IllegalArgumentException("Invalid Google credential.");
        return token;
    }

    /** Clear this app's provider preference only after confirmed app logout.
     * This neither signs out the phone's Google account nor revokes other apps. */
    static void clear(Context context) {
        try {
            CredentialManager.create(context).clearCredentialStateAsync(new ClearCredentialStateRequest(), null,
                ContextCompat.getMainExecutor(context), new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override public void onResult(Void ignored) {}
                    @Override public void onError(ClearCredentialException ignored) {}
                });
        } catch (Exception ignored) { /* The server-confirmed app logout remains complete. */ }
    }
}
