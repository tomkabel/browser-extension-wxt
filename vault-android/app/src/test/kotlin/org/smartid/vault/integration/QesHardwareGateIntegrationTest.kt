package org.smartid.vault.integration

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLooper
import org.smartid.vault.audit.AuditLogger
import org.smartid.vault.haptic.HapticNotifier
import org.smartid.vault.hig.HardwareInterruptGate

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class QesHardwareGateIntegrationTest {

    private lateinit var gate: HardwareInterruptGate
    private lateinit var auditLogger: AuditLogger

    @Before
    fun setUp() {
        auditLogger = AuditLogger(RuntimeEnvironment.getApplication())
        gate = HardwareInterruptGate(
            RuntimeEnvironment.getApplication(),
            HapticNotifier(RuntimeEnvironment.getApplication()),
            auditLogger,
        )
    }

    @Test
    fun `full happy path PIN2 detection to actuation`() {
        gate.arm("integ-session-1", "tx-hash-1", "zk-hash-1", "webauthn-hash-1")
        assertEquals(HardwareInterruptGate.State.WAITING, gate.getState())

        val consumed = gate.onKeyEvent(
            KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN)
        )
        assertTrue(consumed)
        assertEquals(HardwareInterruptGate.State.RELEASED, gate.getState())

        gate.onGhostActuatorCompleted()
        assertEquals(HardwareInterruptGate.State.COMPLETED, gate.getState())

        val entries = auditLogger.getAllEntries()
        val completedEntry = entries.find { it.result == "COMPLETED" }
        assertTrue("Completed audit entry should exist", completedEntry != null)
        assertEquals("VOLUME_DOWN", completedEntry!!.interruptType)
        assertTrue("actuationTimestamp should be set", completedEntry.actuationTimestamp > 0)
    }

    @Test
    fun `timeout produces cancellation audit entry and CANCELLED state`() {
        gate.arm("integ-session-2", "tx-hash-2", "zk-hash-2", "webauthn-hash-2")
        assertEquals(HardwareInterruptGate.State.WAITING, gate.getState())

        ShadowLooper.runUiThreadTasksIncludingDelayedTasks()

        assertEquals(HardwareInterruptGate.State.CANCELLED, gate.getState())

        val entries = auditLogger.getAllEntries()
        val timeoutEntry = entries.find { it.result == "CANCELLED" }
        assertTrue("Timeout audit entry should exist", timeoutEntry != null)
        assertEquals("TIMEOUT", timeoutEntry!!.interruptType)
        assertEquals(0L, timeoutEntry.interruptTimestamp)
        assertEquals(0L, timeoutEntry.actuationTimestamp)
    }

    @Test
    fun `Volume Up cancel produces cancellation audit entry`() {
        gate.arm("integ-session-3", "tx-hash-3", "zk-hash-3", "webauthn-hash-3")
        assertEquals(HardwareInterruptGate.State.WAITING, gate.getState())

        val consumed = gate.onKeyEvent(
            KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_UP)
        )
        assertTrue(consumed)
        assertEquals(HardwareInterruptGate.State.CANCELLED, gate.getState())

        val entries = auditLogger.getAllEntries()
        val cancelledEntry = entries.find { it.result == "CANCELLED" }
        assertTrue("Cancelled audit entry should exist", cancelledEntry != null)
        assertEquals("VOLUME_UP", cancelledEntry!!.interruptType)
        assertEquals(0L, cancelledEntry.actuationTimestamp)
    }

    @Test
    fun `Volume Up cancel prevents actuation`() {
        gate.arm("integ-session-4", "tx-hash-4", "zk-hash-4", "webauthn-hash-4")
        gate.onKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_UP))
        assertEquals(HardwareInterruptGate.State.CANCELLED, gate.getState())

        gate.onGhostActuatorCompleted()
        assertEquals(HardwareInterruptGate.State.CANCELLED, gate.getState())
    }

    @Test
    fun `multiple sessions can be chained with reset`() {
        gate.arm("s1", "tx1", "zk1", "wa1")
        gate.onKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN))
        gate.onGhostActuatorCompleted()
        assertEquals(HardwareInterruptGate.State.COMPLETED, gate.getState())
        gate.reset()
        assertEquals(HardwareInterruptGate.State.IDLE, gate.getState())

        gate.arm("s2", "tx2", "zk2", "wa2")
        assertEquals(HardwareInterruptGate.State.WAITING, gate.getState())
        gate.onKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN))
        assertEquals(HardwareInterruptGate.State.RELEASED, gate.getState())
        gate.onGhostActuatorCompleted()
        assertEquals(HardwareInterruptGate.State.COMPLETED, gate.getState())
    }
}
