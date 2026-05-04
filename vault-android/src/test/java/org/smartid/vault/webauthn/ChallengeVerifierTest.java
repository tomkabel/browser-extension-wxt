package org.smartid.vault.webauthn;

import org.junit.Before;
import org.junit.Test;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;

import static org.junit.Assert.*;

public class ChallengeVerifierTest {
    private ChallengeVerifier verifier;

    @Before
    public void setUp() {
        verifier = new ChallengeVerifier();
    }

    private byte[] createValidSerialized() {
        byte[] proof = new byte[64];
        Arrays.fill(proof, (byte) 0xAB);
        String origin = "https://example.com";
        byte[] originBytes = origin.getBytes(StandardCharsets.UTF_8);
        byte[] nonce = new byte[32];
        Arrays.fill(nonce, (byte) 0xCD);

        int headerSize = 1 + 2 + proof.length + 2 + originBytes.length + 1 + 4 + 32;
        int padding = (32 - (headerSize % 32)) % 32;
        int totalSize = headerSize + padding;

        ByteBuffer buf = ByteBuffer.allocate(totalSize);
        buf.put((byte) 0x01);
        buf.putShort((short) proof.length);
        buf.put(proof);
        buf.putShort((short) originBytes.length);
        buf.put(originBytes);
        buf.put((byte) 0x04);
        buf.put("1234".getBytes(StandardCharsets.US_ASCII));
        buf.put(nonce);
        for (int i = 0; i < padding; i++) buf.put((byte) 0);

        return buf.array();
    }

    @Test
    public void parseTlvComponents_roundtrips() {
        byte[] serialized = createValidSerialized();
        ChallengeVerifier.ChallengeComponents components = verifier.parseTlvComponents(serialized);

        assertEquals(0x01, components.version);
        assertEquals("https://example.com", components.origin);
        assertEquals("1234", components.controlCode);
        assertEquals(32, components.sessionNonce.length);
        assertEquals(64, components.zkTlsProof.length);
    }

    @Test
    public void verifyChallenge_passesWithValidInputs() throws Exception {
        byte[] serialized = createValidSerialized();
        byte[] challengeHash = MessageDigest.getInstance("SHA-256").digest(serialized);
        String clientDataJsonChallenge = base64UrlEncode(challengeHash);

        ChallengeVerifier.VerificationResult result = verifier.verifyChallenge(serialized, clientDataJsonChallenge);
        assertTrue("Challenge verification should pass", result.passed);
    }

    @Test
    public void verifyChallenge_failsOnMismatchedOrigin() throws Exception {
        byte[] serialized = createValidSerialized();

        byte[] wrongOriginBytes = "https://evil.com".getBytes(StandardCharsets.UTF_8);
        ByteBuffer buf = ByteBuffer.allocate(serialized.length);
        buf.put((byte) 0x01);
        buf.putShort((short) 64);
        byte[] proof = new byte[64];
        Arrays.fill(proof, (byte) 0xAB);
        buf.put(proof);
        buf.putShort((short) wrongOriginBytes.length);
        buf.put(wrongOriginBytes);
        buf.put((byte) 0x04);
        buf.put("1234".getBytes(StandardCharsets.US_ASCII));
        byte[] nonce = new byte[32];
        Arrays.fill(nonce, (byte) 0xCD);
        buf.put(nonce);
        while (buf.hasRemaining()) buf.put((byte) 0);
        byte[] wrongSerialized = buf.array();

        byte[] challengeHash = MessageDigest.getInstance("SHA-256").digest(serialized);
        String clientDataJsonChallenge = base64UrlEncode(challengeHash);

        ChallengeVerifier.VerificationResult result = verifier.verifyChallenge(wrongSerialized, clientDataJsonChallenge);
        assertFalse("Should fail on origin mismatch", result.passed);
    }

    @Test
    public void verifyChallenge_failsOnMismatchedControlCode() throws Exception {
        byte[] serialized = createValidSerialized();

        byte[] wrongCodeBytes = "5678".getBytes(StandardCharsets.US_ASCII);
        ByteBuffer buf = ByteBuffer.allocate(serialized.length);
        buf.put((byte) 0x01);
        buf.putShort((short) 64);
        byte[] proof = new byte[64];
        Arrays.fill(proof, (byte) 0xAB);
        buf.put(proof);
        buf.putShort((short) "https://example.com".length());
        buf.put("https://example.com".getBytes(StandardCharsets.UTF_8));
        buf.put((byte) 0x04);
        buf.put(wrongCodeBytes);
        byte[] nonce = new byte[32];
        Arrays.fill(nonce, (byte) 0xCD);
        buf.put(nonce);
        while (buf.hasRemaining()) buf.put((byte) 0);
        byte[] wrongSerialized = buf.array();

        byte[] challengeHash = MessageDigest.getInstance("SHA-256").digest(serialized);
        String clientDataJsonChallenge = base64UrlEncode(challengeHash);

        ChallengeVerifier.VerificationResult result = verifier.verifyChallenge(wrongSerialized, clientDataJsonChallenge);
        assertFalse("Should fail on control code mismatch", result.passed);
    }

    @Test
    public void verifyChallenge_failsOnMismatchedNonce() throws Exception {
        byte[] serialized = createValidSerialized();

        byte[] wrongNonce = new byte[32];
        Arrays.fill(wrongNonce, (byte) 0xFF);
        ByteBuffer buf = ByteBuffer.allocate(serialized.length);
        buf.put((byte) 0x01);
        buf.putShort((short) 64);
        byte[] proof = new byte[64];
        Arrays.fill(proof, (byte) 0xAB);
        buf.put(proof);
        buf.putShort((short) "https://example.com".length());
        buf.put("https://example.com".getBytes(StandardCharsets.UTF_8));
        buf.put((byte) 0x04);
        buf.put("1234".getBytes(StandardCharsets.US_ASCII));
        buf.put(wrongNonce);
        while (buf.hasRemaining()) buf.put((byte) 0);
        byte[] wrongSerialized = buf.array();

        byte[] challengeHash = MessageDigest.getInstance("SHA-256").digest(serialized);
        String clientDataJsonChallenge = base64UrlEncode(challengeHash);

        ChallengeVerifier.VerificationResult result = verifier.verifyChallenge(wrongSerialized, clientDataJsonChallenge);
        assertFalse("Should fail on nonce mismatch", result.passed);
    }

    @Test
    public void verifyNonceUniqueness_rejectsReplay() {
        byte[] nonce = new byte[32];
        Arrays.fill(nonce, (byte) 0x01);

        ChallengeVerifier.VerificationResult first = verifier.verifyNonceUniqueness(nonce);
        assertTrue("First use should pass", first.passed);

        ChallengeVerifier.VerificationResult second = verifier.verifyNonceUniqueness(nonce);
        assertFalse("Replay should be rejected", second.passed);
    }

    @Test
    public void verifyFull_requiresNonceUniqueness() throws Exception {
        byte[] serialized = createValidSerialized();
        ChallengeVerifier.ChallengeComponents components = verifier.parseTlvComponents(serialized);
        byte[] nonceFromTlv = components.sessionNonce;

        byte[] challengeHash = MessageDigest.getInstance("SHA-256").digest(serialized);
        String clientDataJsonChallenge = base64UrlEncode(challengeHash);

        ChallengeVerifier.VerificationResult first = verifier.verifyFull(serialized, clientDataJsonChallenge, nonceFromTlv);
        assertTrue("First full verification should pass", first.passed);

        ChallengeVerifier.VerificationResult second = verifier.verifyFull(serialized, clientDataJsonChallenge, nonceFromTlv);
        assertFalse("Replayed nonce should fail full verification", second.passed);
    }

    @Test
    public void verifyFull_rejectsMismatchedNonce() throws Exception {
        byte[] serialized = createValidSerialized();
        byte[] challengeHash = MessageDigest.getInstance("SHA-256").digest(serialized);
        String clientDataJsonChallenge = base64UrlEncode(challengeHash);

        byte[] wrongNonce = new byte[32];
        Arrays.fill(wrongNonce, (byte) 0xFF);

        ChallengeVerifier.VerificationResult result = verifier.verifyFull(serialized, clientDataJsonChallenge, wrongNonce);
        assertFalse("Mismatched nonce should fail full verification", result.passed);
    }

    private static String base64UrlEncode(byte[] data) {
        String standard = android.util.Base64.encodeToString(data, android.util.Base64.NO_WRAP);
        return standard.replace('+', '-').replace('/', '_').replace("=", "");
    }
}
