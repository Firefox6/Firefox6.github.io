package ch.fittrack.widgets;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SessionStore {
    private static final String PREFERENCES = "fittrack_widget_session";
    private static final String KEY_CIPHERTEXT = "session_ciphertext";
    private static final String KEY_IV = "session_iv";
    private static final String KEY_ALIAS = "fittrack_widget_session_key_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private final SharedPreferences preferences;

    SessionStore(Context context) {
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    synchronized void save(Session session) throws Exception {
        JSONObject payload = new JSONObject()
            .put("access_token", session.accessToken)
            .put("refresh_token", session.refreshToken)
            .put("user_id", session.userId)
            .put("expires_at_ms", session.expiresAtMs);

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8));

        preferences.edit()
            .putString(KEY_CIPHERTEXT, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString(KEY_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .apply();
    }

    synchronized Session load() {
        String encodedCiphertext = preferences.getString(KEY_CIPHERTEXT, null);
        String encodedIv = preferences.getString(KEY_IV, null);
        if (encodedCiphertext == null || encodedIv == null) return null;

        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateKey(),
                new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP))
            );
            byte[] plaintext = cipher.doFinal(Base64.decode(encodedCiphertext, Base64.NO_WRAP));
            JSONObject payload = new JSONObject(new String(plaintext, StandardCharsets.UTF_8));
            return new Session(
                payload.getString("access_token"),
                payload.getString("refresh_token"),
                payload.getString("user_id"),
                payload.getLong("expires_at_ms")
            );
        } catch (Exception error) {
            clear();
            return null;
        }
    }

    synchronized void clear() {
        preferences.edit().clear().apply();
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    static final class Session {
        final String accessToken;
        final String refreshToken;
        final String userId;
        final long expiresAtMs;

        Session(String accessToken, String refreshToken, String userId, long expiresAtMs) {
            this.accessToken = accessToken;
            this.refreshToken = refreshToken;
            this.userId = userId;
            this.expiresAtMs = expiresAtMs;
        }
    }
}
