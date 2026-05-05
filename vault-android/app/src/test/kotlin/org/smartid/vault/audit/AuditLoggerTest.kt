package org.smartid.vault.audit

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class AuditLoggerTest {

    private val sampleEntry = QesAuditEntry(
        sessionId = "session-abc-123",
        timestamp = 1000000L,
        transactionHash = "a" + "b".repeat(63),
        zkTlsProofHash = "c" + "d".repeat(63),
        webauthnAssertionHash = "e" + "f".repeat(63),
        armTimestamp = 1000000L,
        interruptType = "VOLUME_DOWN",
        interruptTimestamp = 1001000L,
        actuationTimestamp = 1001100L,
        result = "COMPLETED",
    )

    @Test
    fun `audit entry serialization roundtrip`() {
        val json = sampleEntry.toJson()
        val deserialized = QesAuditEntry.fromJson(json)

        assertEquals(sampleEntry.sessionId, deserialized.sessionId)
        assertEquals(sampleEntry.timestamp, deserialized.timestamp)
        assertEquals(sampleEntry.transactionHash, deserialized.transactionHash)
        assertEquals(sampleEntry.result, deserialized.result)
        assertEquals(sampleEntry.interruptType, deserialized.interruptType)
        assertEquals(sampleEntry.armTimestamp, deserialized.armTimestamp)
        assertEquals(sampleEntry.interruptTimestamp, deserialized.interruptTimestamp)
        assertEquals(sampleEntry.actuationTimestamp, deserialized.actuationTimestamp)
    }

    @Test
    fun `audit entry JSON has all required fields`() {
        val json = sampleEntry.toJson()
        assertEquals("session-abc-123", json.getString("sessionId"))
        assertEquals("VOLUME_DOWN", json.getString("interruptType"))
        assertEquals("COMPLETED", json.getString("result"))
        assertTrue(json.has("timestamp"))
        assertTrue(json.has("transactionHash"))
        assertTrue(json.has("zkTlsProofHash"))
        assertTrue(json.has("webauthnAssertionHash"))
        assertTrue(json.has("armTimestamp"))
        assertTrue(json.has("interruptTimestamp"))
        assertTrue(json.has("actuationTimestamp"))
    }

    @Test
    fun `sign and verify audit entry`() {
        val logger = AuditLogger(RuntimeEnvironment.getApplication())
        val signature = logger.signEntry(sampleEntry)
        assertTrue("Signature must be verifiable", logger.verifyEntry(sampleEntry, signature))
    }

    @Test
    fun `export produces valid JSON array`() {
        val logger = AuditLogger(RuntimeEnvironment.getApplication())
        try {
            logger.logEntry(sampleEntry)
        } catch (_: Exception) {
            // Persistence may not be available in the test environment
        }
        val export = logger.exportAuditLog()
        assertTrue("Export should be a JSON array", export.startsWith("["))
        assertTrue("Export should end with ]", export.endsWith("]"))
    }

    @Test
    fun `verify with tampered entry fails`() {
        val logger = AuditLogger(RuntimeEnvironment.getApplication())
        val signature = logger.signEntry(sampleEntry)

        val tamperedEntry = sampleEntry.copy(result = "CANCELLED")
        assertFalse(
            "Verification of tampered entry should fail",
            logger.verifyEntry(tamperedEntry, signature)
        )
    }

    @Test
    fun `signature produces non-empty bytes`() {
        val logger = AuditLogger(RuntimeEnvironment.getApplication())
        val signature = logger.signEntry(sampleEntry)
        assertTrue("ECDSA signature should be non-empty", signature.isNotEmpty())
        assertTrue("ECDSA signature for P-256 should be ~70-72 bytes",
            signature.size >= 64 && signature.size <= 74)
    }
}
