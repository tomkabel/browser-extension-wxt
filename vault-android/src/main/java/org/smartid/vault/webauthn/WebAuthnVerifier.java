package org.smartid.vault.webauthn;

import android.util.Log;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.ECPoint;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.InvalidKeySpecException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * Verifies WebAuthn assertion signatures using stored ECDSA P-256 public keys.
 *
 * The public key is provisioned during Phase 0 pairing (raw uncompressed coordinates),
 * stored in the Android trust-store, and used to verify subsequent assertions.
 *
 * Signature verification: SHA256withECDSA over authenticatorData || SHA256(clientDataJSON)
 */
public class WebAuthnVerifier {
    private static final String TAG = "WebAuthnVerifier";

    private final Map<String, StoredCredential> credentialStore;

    public WebAuthnVerifier() {
        this.credentialStore = new HashMap<>();
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
        Log.i(TAG, "Credential stored: " + credentialId.substring(0, 16) + "...");
    }

    public void invalidateCredential(String credentialId) {
        StoredCredential stored = credentialStore.get(credentialId);
        if (stored != null) {
            stored.valid = false;
            Log.w(TAG, "Credential invalidated: " + credentialId.substring(0, 16) + "...");
            logAuditEvent("key_invalidated", credentialId);
        }
    }

    public PublicKey reconstructPublicKey(byte[] uncompressedPublicKey)
            throws NoSuchAlgorithmException, InvalidKeySpecException {

        if (uncompressedPublicKey.length != 65 || uncompressedPublicKey[0] != 0x04) {
            throw new IllegalArgumentException("Invalid uncompressed public key format");
        }

        byte[] xBytes = Arrays.copyOfRange(uncompressedPublicKey, 1, 33);
        byte[] yBytes = Arrays.copyOfRange(uncompressedPublicKey, 33, 65);

        java.math.BigInteger x = new java.math.BigInteger(1, xBytes);
        java.math.BigInteger y = new java.math.BigInteger(1, yBytes);

        ECPoint point = new ECPoint(x, y);

        ECParameterSpec ecSpec = new ECParameterSpec(
                new java.security.spec.EllipticCurve(
                        new java.security.spec.ECFieldFp(
                                new java.math.BigInteger("115792089210356248762697446949407573530086143415290314195533631308867097853951")
                        ),
                        new java.math.BigInteger("115792089210356248762697446949407573530086143415290314195533631308867097853948"),
                        new java.math.BigInteger("41058363725152142129326129780047268409114441015993725554835256314039467401291")
                ),
                new ECPoint(
                        new java.math.BigInteger("48439561293906451759052585252797914202762949526041747995844080717082404635286"),
                        new java.math.BigInteger("36134250956749795798585127919587881956611106672985015071877198253568414405109")
                ),
                new java.math.BigInteger("115792089210356248762697446949407573529996955224135760342422259061068512044369"),
                1
        );

        ECPublicKeySpec keySpec = new ECPublicKeySpec(point, ecSpec);
        KeyFactory keyFactory = KeyFactory.getInstance("EC");
        return keyFactory.generatePublic(keySpec);
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
                invalidateCredential(credentialId);
                return VerificationResult.failure("Signature verification failed: key invalidated");
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
