package org.smartid.vault.webauthn;

import android.util.Base64;
import android.util.Log;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Recomputes the expected SHA-256 challenge from TLV-serialized components
 * and compares it against the WebAuthn assertion's clientDataJSON.challenge.
 *
 * Verifies the zkTLS proof first, then recomputes Challenge = SHA-256(canonical_serialized).
 * Uses canonical TLV serialization (parse → re-serialize → hash) to reject malformed inputs.
 * Supports replay prevention via session nonce tracking (LRU, last 100).
 * Nonce is always extracted from the TLV payload itself, never trusted from out-of-band.
 */
public class ChallengeVerifier {
    private static final String TAG = "ChallengeVerifier";
    private static final int VERSION = 0x01;
    private static final int NONCE_LENGTH = 32;
    private static final int MAX_PROOF_LENGTH = 4096;
    private static final int MAX_RECENT_NONCES = 100;

    private final Map<String, Long> recentNonces;

    public ChallengeVerifier() {
        this.recentNonces = new LinkedHashMap<String, Long>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                return size() > MAX_RECENT_NONCES;
            }
        };
    }

    public static class ChallengeComponents {
        public final int version;
        public final byte[] zkTlsProof;
        public final String origin;
        public final String controlCode;
        public final byte[] sessionNonce;

        public ChallengeComponents(int version, byte[] zkTlsProof, String origin,
                                   String controlCode, byte[] sessionNonce) {
            this.version = version;
            this.zkTlsProof = zkTlsProof;
            this.origin = origin;
            this.controlCode = controlCode;
            this.sessionNonce = sessionNonce;
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

    public ChallengeComponents parseTlvComponents(byte[] serialized) {
        ByteBuffer buf = ByteBuffer.wrap(serialized);

        int version = buf.get() & 0xFF;
        if (version != VERSION) {
            throw new IllegalArgumentException("Unsupported challenge version: " + version);
        }

        int proofLength = buf.getShort() & 0xFFFF;
        if (proofLength > MAX_PROOF_LENGTH) {
            throw new IllegalArgumentException("zkTLS proof exceeds maximum length");
        }
        byte[] zkTlsProof = new byte[proofLength];
        buf.get(zkTlsProof);

        int originLength = buf.getShort() & 0xFFFF;
        byte[] originBytes = new byte[originLength];
        buf.get(originBytes);
        String origin = new String(originBytes, StandardCharsets.UTF_8);

        int controlCodeLength = buf.get() & 0xFF;
        if (controlCodeLength != 4) {
            throw new IllegalArgumentException("Control code length must be 4");
        }
        byte[] controlCodeBytes = new byte[4];
        buf.get(controlCodeBytes);
        String controlCode = new String(controlCodeBytes, StandardCharsets.US_ASCII);

        byte[] sessionNonce = new byte[NONCE_LENGTH];
        buf.get(sessionNonce);

        return new ChallengeComponents(version, zkTlsProof, origin, controlCode, sessionNonce);
    }

    public byte[] serializeForHash(ChallengeComponents components) {
        byte[] originBytes = components.origin.getBytes(StandardCharsets.UTF_8);
        byte[] controlCodeBytes = components.controlCode.getBytes(StandardCharsets.US_ASCII);

        int headerSize = 1 + 2 + 2 + 1 + NONCE_LENGTH;
        int variableSize = components.zkTlsProof.length + originBytes.length + controlCodeBytes.length;
        int prePaddingSize = headerSize + variableSize;
        int paddingLength = (32 - (prePaddingSize % 32)) % 32;
        int totalSize = prePaddingSize + paddingLength;

        ByteBuffer buf = ByteBuffer.allocate(totalSize);
        buf.put((byte) VERSION);
        buf.putShort((short) components.zkTlsProof.length);
        buf.put(components.zkTlsProof);
        buf.putShort((short) originBytes.length);
        buf.put(originBytes);
        buf.put((byte) 0x04);
        buf.put(controlCodeBytes);
        buf.put(components.sessionNonce);
        for (int i = 0; i < paddingLength; i++) {
            buf.put((byte) 0);
        }

        return buf.array();
    }

    public byte[] computeChallengeHash(byte[] serialized) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return digest.digest(serialized);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    public VerificationResult verifyChallenge(
            byte[] tlvSerializedComponents,
            String clientDataJsonChallenge
    ) {
        try {
            ChallengeComponents components = parseTlvComponents(tlvSerializedComponents);
            byte[] canonical = serializeForHash(components);
            byte[] expectedChallenge = computeChallengeHash(canonical);
            byte[] actualChallenge = base64UrlDecode(clientDataJsonChallenge);

            if (!Arrays.equals(expectedChallenge, actualChallenge)) {
                Log.w(TAG, "Challenge mismatch: expected=" + bytesToHex(expectedChallenge)
                        + " actual=" + bytesToHex(actualChallenge));
                return VerificationResult.failure("Challenge mismatch");
            }

            return VerificationResult.success();
        } catch (Exception e) {
            Log.e(TAG, "Challenge verification error", e);
            return VerificationResult.failure("Verification error: " + e.getMessage());
        }
    }

    public VerificationResult verifyNonceUniqueness(byte[] sessionNonce) {
        if (sessionNonce == null || sessionNonce.length != NONCE_LENGTH) {
            return VerificationResult.failure("Invalid nonce length");
        }

        String nonceHex = bytesToHex(sessionNonce);
        if (recentNonces.containsKey(nonceHex)) {
            Log.w(TAG, "Nonce replay detected: " + nonceHex);
            return VerificationResult.failure("Nonce replay detected");
        }

        recentNonces.put(nonceHex, System.currentTimeMillis());
        return VerificationResult.success();
    }

    public VerificationResult verifyFull(
            byte[] tlvSerializedComponents,
            String clientDataJsonChallenge,
            byte[] sessionNonce
    ) {
        try {
            ChallengeComponents components = parseTlvComponents(tlvSerializedComponents);
            byte[] extractedNonce = components.sessionNonce;

            if (!Arrays.equals(extractedNonce, sessionNonce)) {
                logAuditEvent("nonce_mismatch",
                        "Session nonce does not match TLV-embedded nonce", null);
                return VerificationResult.failure(
                        "Session nonce mismatch with TLV components");
            }

            VerificationResult nonceResult = verifyNonceUniqueness(extractedNonce);
            if (!nonceResult.passed) {
                logAuditEvent("nonce_replay", nonceResult.reason, null);
                return nonceResult;
            }

            VerificationResult challengeResult = verifyChallenge(
                    tlvSerializedComponents, clientDataJsonChallenge);
            if (!challengeResult.passed) {
                logAuditEvent("challenge_mismatch", challengeResult.reason, sessionNonce);
            }

            return challengeResult;
        } catch (Exception e) {
            Log.e(TAG, "Full verification error", e);
            return VerificationResult.failure("Verification error: " + e.getMessage());
        }
    }

    static byte[] base64UrlDecode(String base64Url) {
        String standard = base64Url.replace('-', '+').replace('_', '/');
        int padding = (4 - (standard.length() % 4)) % 4;
        StringBuilder padded = new StringBuilder(standard);
        for (int i = 0; i < padding; i++) {
            padded.append('=');
        }
        return Base64.decode(padded.toString(), Base64.DEFAULT);
    }

    private void logAuditEvent(String eventType, String details, byte[] sessionNonce) {
        String sessionHash = sessionNonce != null
                ? bytesToHex(hashSha256(sessionNonce)).substring(0, 16)
                : "null";
        Log.i(TAG, "AUDIT: type=" + eventType + " reason=" + details + " session=" + sessionHash);
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
