package org.smartid.vault.webauthn;

import org.junit.Before;
import org.junit.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.util.Arrays;

import static org.junit.Assert.*;

public class WebAuthnVerifierTest {
    private WebAuthnVerifier verifier;

    @Before
    public void setUp() {
        verifier = new WebAuthnVerifier();
    }

    @Test
    public void storeAndReconstructPublicKey() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(256);
        KeyPair keyPair = gen.generateKeyPair();

        byte[] encoded = keyPair.getPublic().getEncoded();
        byte[] uncompressed = extractUncompressedPoint(encoded);

        java.security.PublicKey reconstructed = verifier.reconstructPublicKey(uncompressed);
        assertNotNull("Reconstructed public key should not be null", reconstructed);
        assertEquals("EC", reconstructed.getAlgorithm());
    }

    @Test
    public void validAssertionSignaturePasses() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(256);
        KeyPair keyPair = gen.generateKeyPair();

        byte[] encoded = keyPair.getPublic().getEncoded();
        byte[] uncompressed = extractUncompressedPoint(encoded);

        String credentialId = "test-credential-id";
        verifier.storeCredential(credentialId, uncompressed);

        byte[] authenticatorData = new byte[37];
        Arrays.fill(authenticatorData, (byte) 0x10);

        byte[] clientDataJson = "{\"challenge\":\"test\"}".getBytes();
        byte[] clientDataHash = MessageDigest.getInstance("SHA-256").digest(clientDataJson);

        java.nio.ByteBuffer signedBuffer = java.nio.ByteBuffer.allocate(authenticatorData.length + clientDataHash.length);
        signedBuffer.put(authenticatorData);
        signedBuffer.put(clientDataHash);
        byte[] signedData = signedBuffer.array();

        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(keyPair.getPrivate());
        signer.update(signedData);
        byte[] signature = signer.sign();

        WebAuthnVerifier.VerificationResult result = verifier.verifyAssertion(
                credentialId, authenticatorData, clientDataJson, signature);
        assertTrue("Valid signature should pass", result.passed);
    }

    @Test
    public void tamperedClientDataJsonCausesFailure() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(256);
        KeyPair keyPair = gen.generateKeyPair();

        byte[] encoded = keyPair.getPublic().getEncoded();
        byte[] uncompressed = extractUncompressedPoint(encoded);

        String credentialId = "test-credential-2";
        verifier.storeCredential(credentialId, uncompressed);

        byte[] authenticatorData = new byte[37];
        Arrays.fill(authenticatorData, (byte) 0x10);

        byte[] originalClientDataJson = "{\"challenge\":\"original\"}".getBytes();
        byte[] tamperedClientDataJson = "{\"challenge\":\"tampered\"}".getBytes();

        byte[] clientDataHash = MessageDigest.getInstance("SHA-256").digest(originalClientDataJson);

        java.nio.ByteBuffer signedBuffer = java.nio.ByteBuffer.allocate(authenticatorData.length + clientDataHash.length);
        signedBuffer.put(authenticatorData);
        signedBuffer.put(clientDataHash);
        byte[] signedData = signedBuffer.array();

        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(keyPair.getPrivate());
        signer.update(signedData);
        byte[] signature = signer.sign();

        WebAuthnVerifier.VerificationResult result = verifier.verifyAssertion(
                credentialId, authenticatorData, tamperedClientDataJson, signature);
        assertFalse("Tampered clientDataJSON should fail", result.passed);
    }

    @Test
    public void unknownCredentialIsRejected() {
        byte[] authData = new byte[37];
        byte[] clientData = "{}".getBytes();
        byte[] sig = new byte[64];

        WebAuthnVerifier.VerificationResult result = verifier.verifyAssertion(
                "unknown", authData, clientData, sig);
        assertFalse("Unknown credential should be rejected", result.passed);
    }

    @Test
    public void invalidatedCredentialIsRejected() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(256);
        KeyPair keyPair = gen.generateKeyPair();

        byte[] uncompressed = extractUncompressedPoint(keyPair.getPublic().getEncoded());
        verifier.storeCredential("invalid-test", uncompressed);
        verifier.invalidateCredential("invalid-test");

        WebAuthnVerifier.VerificationResult result = verifier.verifyAssertion(
                "invalid-test", new byte[37], "{}".getBytes(), new byte[64]);
        assertFalse("Invalidated credential should be rejected", result.passed);
    }

    private static byte[] extractUncompressedPoint(byte[] encoded) {
        if (encoded.length == 91 && encoded[0] == 0x04) {
            byte[] uncompressed = new byte[65];
            uncompressed[0] = 0x04;
            System.arraycopy(encoded, 27, uncompressed, 1, 64);
            return uncompressed;
        }
        return encoded;
    }
}
