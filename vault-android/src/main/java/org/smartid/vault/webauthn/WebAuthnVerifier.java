package org.smartid.vault.webauthn;

import android.util.Log;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.ECFieldFp;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.EllipticCurve;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * Verifies WebAuthn assertion signatures using stored ECDSA P-256 public keys.
 *
 * The public key is provisioned during Phase 0 pairing (raw uncompressed coordinates
 * or X.509/SPKI encoded), stored in the Android trust-store, and used to verify
 * subsequent assertions.
 *
 * Signature verification: SHA256withECDSA over authenticatorData || SHA256(clientDataJSON)
 */
public class WebAuthnVerifier {
    private static final String TAG = "WebAuthnVerifier";
    private static final int MAX_FAILED_ATTEMPTS = 3;
    private static final long FAILURE_WINDOW_MS = 300_000;

    private final Map<String, StoredCredential> credentialStore;
    private final Map<String, FailureTracker> failureTracker;

    public WebAuthnVerifier() {
        this.credentialStore = new HashMap<>();
        this.failureTracker = new HashMap<>();
    }

    public static class StoredCredential {
        public final String credentialId;
        public final byte[] publicKeyBytes;
        public final long provisionedAt;
        public boolean valid;

        public StoredCredential(String credentialId, byte[] publicKeyBytes) {
            this.credentialId = credentialId;
            this.publicKeyBytes = publicKeyBytes;
            this.provisionedAt = System.currentTimeMillis();
            this.valid = true;
        }
    }

    private static class FailureTracker {
        int count;
        long firstFailureAt;

        FailureTracker() {
            this.count = 0;
            this.firstFailureAt = System.currentTimeMillis();
        }

        boolean isThresholdExceeded() {
            long elapsed = System.currentTimeMillis() - firstFailureAt;
            if (elapsed > FAILURE_WINDOW_MS) {
                count = 1;
                firstFailureAt = System.currentTimeMillis();
                return false;
            }
            return ++count >= MAX_FAILED_ATTEMPTS;
        }
    }

    public static class VerificationResult {
        public final boolean passed;
        public final String reason;

        private VerificationResult(boolean passed, String reason) {
            this.passed = passed;
            this.reason = reason;
        }

        public static VerificationResult success() {
            return new VerificationResult(true, null);
        }

        public static VerificationResult failure(String reason) {
            return new VerificationResult(false, reason);
        }
    }

    public void storeCredential(String credentialId, byte[] uncompressedPublicKey) {
        StoredCredential credential = new StoredCredential(credentialId, uncompressedPublicKey);
        credentialStore.put(credentialId, credential);
        String label = credentialId.substring(0, Math.min(16, credentialId.length()));
        Log.i(TAG, "Credential stored: " + label + "...");
    }

    public void invalidateCredential(String credentialId) {
        StoredCredential stored = credentialStore.get(credentialId);
        if (stored != null) {
            stored.valid = false;
            String label = credentialId.substring(0, Math.min(16, credentialId.length()));
            Log.w(TAG, "Credential invalidated: " + label + "...");
            logAuditEvent("key_invalidated", credentialId);
        }
    }

    public PublicKey reconstructPublicKey(byte[] publicKeyInput)
            throws NoSuchAlgorithmException, InvalidKeySpecException {

        if (publicKeyInput.length == 65 && publicKeyInput[0] == 0x04) {
            return reconstructFromUncompressedPoint(publicKeyInput);
        }

        if (publicKeyInput.length == 65 && (publicKeyInput[0] == 0x02 || publicKeyInput[0] == 0x03)) {
            throw new IllegalArgumentException(
                    "Compressed EC point encoding (0x" + Integer.toHexString(publicKeyInput[0] & 0xFF)
                            + ") is not supported. Provide uncompressed (0x04) or X.509/SPKI encoding.");
        }

        try {
            X509EncodedKeySpec keySpec = new X509EncodedKeySpec(publicKeyInput);
            KeyFactory keyFactory = KeyFactory.getInstance("EC");
            PublicKey key = keyFactory.generatePublic(keySpec);
            Log.d(TAG, "Public key reconstructed from X.509/SPKI encoding");
            return key;
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "Unsupported public key format: length=" + publicKeyInput.length
                            + " firstByte=0x" + Integer.toHexString(publicKeyInput[0] & 0xFF)
                            + ". Expected uncompressed point (65 bytes, 0x04) or X.509/SPKI.", e);
        }
    }

    private PublicKey reconstructFromUncompressedPoint(byte[] uncompressedPublicKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException {

        byte[] xBytes = java.util.Arrays.copyOfRange(uncompressedPublicKey, 1, 33);
        byte[] yBytes = java.util.Arrays.copyOfRange(uncompressedPublicKey, 33, 65);

        java.math.BigInteger x = new java.math.BigInteger(1, xBytes);
        java.math.BigInteger y = new java.math.BigInteger(1, yBytes);

        ECPoint point = new ECPoint(x, y);

        ECParameterSpec ecSpec = getP256Parameters();

        ECPublicKeySpec keySpec = new ECPublicKeySpec(point, ecSpec);
        KeyFactory keyFactory = KeyFactory.getInstance("EC");
        return keyFactory.generatePublic(keySpec);
    }

    private static ECParameterSpec getP256Parameters() throws NoSuchAlgorithmException {
        AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
        params.init(new ECGenParameterSpec("secp256r1"));
        return params.getParameterSpec(ECParameterSpec.class);
    }

    public VerificationResult verifyAssertion(
            String credentialId,
            byte[] authenticatorData,
            byte[] clientDataJson,
            byte[] signature
    ) {
        StoredCredential stored = credentialStore.get(credentialId);
        if (stored == null) {
            logAuditEvent("key_not_found", credentialId);
            return VerificationResult.failure("Credential not found: re-provisioning required");
        }

        if (!stored.valid) {
            logAuditEvent("key_invalid", credentialId);
            return VerificationResult.failure("Credential has been invalidated");
        }

        try {
            PublicKey publicKey = reconstructPublicKey(stored.publicKeyBytes);

            byte[] clientDataHash = MessageDigest.getInstance("SHA-256").digest(clientDataJson);

            byte[] signedData = ByteBuffer.allocate(authenticatorData.length + clientDataHash.length)
                    .put(authenticatorData)
                    .put(clientDataHash)
                    .array();

            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(publicKey);
            verifier.update(signedData);

            boolean verified = verifier.verify(signature);

            if (verified) {
                return VerificationResult.success();
            } else {
                logAuditEvent("signature_mismatch", credentialId);

                FailureTracker tracker = failureTracker.get(credentialId);
                if (tracker == null) {
                    tracker = new FailureTracker();
                    failureTracker.put(credentialId, tracker);
                }

                if (tracker.isThresholdExceeded()) {
                    Log.w(TAG, "Credential " + credentialId.substring(0, Math.min(16, credentialId.length()))
                            + "... exceeded failure threshold, invalidating");
                    invalidateCredential(credentialId);
                    return VerificationResult.failure("Signature verification failed repeatedly: key invalidated");
                }

                return VerificationResult.failure("Signature verification failed");
            }
        } catch (Exception e) {
            Log.e(TAG, "Assertion verification error", e);
            return VerificationResult.failure("Verification error: " + e.getMessage());
        }
    }

    private void logAuditEvent(String eventType, String credentialId) {
        String credentialHash = bytesToHex(hashSha256(credentialId.getBytes(StandardCharsets.UTF_8))).substring(0, 16);
        Log.i(TAG, "AUDIT: type=" + eventType + " credentialHash=" + credentialHash
                + " timestamp=" + System.currentTimeMillis());
    }

    private static byte[] hashSha256(byte[] input) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(input);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }

    static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xFF));
        }
        return sb.toString();
    }
}
