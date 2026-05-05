package org.smartid.vault.truststore;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import android.util.Log;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * Persistent trust-store for WebAuthn passkey public keys.
 *
 * Stores credential public keys provisioned during Phase 0 pairing.
 * Uses Android SharedPreferences for storage.
 *
 * <p><b>Security note</b>: This stores <em>public</em> keys only, which are not secret.
 * The plaintext SharedPreferences storage is intentional — public key material does not
 * require encryption at rest. If secret material must be stored, use
 * {@code EncryptedSharedPreferences} with a {@code MasterKey} instead.</p>
 */
public class CredentialTrustStore {
    private static final String TAG = "CredentialTrustStore";
    private static final String STORE_NAME = "smartid_credential_trust_store";

    private final SharedPreferences store;

    public CredentialTrustStore(Context context) {
        this.store = context.getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE);
    }

    public void storePublicKey(String credentialId, byte[] publicKeyBytes) {
        String encoded = Base64.encodeToString(publicKeyBytes, Base64.NO_WRAP);
        store.edit()
                .putString("pk:" + credentialId, encoded)
                .putLong("ts:" + credentialId, System.currentTimeMillis())
                .apply();
        String label = credentialId.substring(0, Math.min(16, credentialId.length()));
        Log.i(TAG, "Stored public key for credential: " + label + "...");
    }

    public byte[] getPublicKey(String credentialId) {
        String encoded = store.getString("pk:" + credentialId, null);
        if (encoded == null) {
            return null;
        }
        return Base64.decode(encoded, Base64.NO_WRAP);
    }

    public long getProvisionedAt(String credentialId) {
        return store.getLong("ts:" + credentialId, 0);
    }

    public void removeCredential(String credentialId) {
        store.edit()
                .remove("pk:" + credentialId)
                .remove("ts:" + credentialId)
                .apply();
        String label = credentialId.substring(0, Math.min(16, credentialId.length()));
        Log.w(TAG, "Removed credential: " + label + "...");
    }

    public boolean hasCredential(String credentialId) {
        return store.contains("pk:" + credentialId);
    }

    public int getCredentialCount() {
        Map<String, ?> all = store.getAll();
        int count = 0;
        for (String key : all.keySet()) {
            if (key.startsWith("pk:")) {
                count++;
            }
        }
        return count;
    }

    public void clearAll() {
        store.edit().clear().apply();
        Log.i(TAG, "Trust store cleared");
    }
}
