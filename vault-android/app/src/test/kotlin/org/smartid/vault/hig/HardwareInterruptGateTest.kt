package org.smartid.vault.hig

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.shadows.ShadowLooper

@RunWith(RobolectricTestRunner::class)
class HardwareInterruptGateTest {

    private lateinit var gate: HardwareInterruptGate

    @Before
    fun setUp() {
        gate = HardwareInterruptGate(RuntimeEnvironment.getApplication())
    }

    @Test
    fun `initial state is IDLE`() {
        assertEquals(HardwareInterruptGate.State.IDLE, gate.getState())
    }

    @Test
    fun `arm transitions from IDLE to WAITING`() {
        gate.arm("session-1", "tx-hash", "zk-hash", "webauthn-hash")
        assertEquals(HardwareInterruptGate.State.WAITING, gate.getState())
    }

    @Test
    fun `arm in non-IDLE state is ignored`() {
        gate.arm("session-1", "tx-hash", "zk-hash", "webauthn-hash")
        assertEquals(HardwareInterruptGate.State.WAITING, gate.getState())
        gate.arm("session-2", "tx-hash", "zk-hash", "webauthn-hash")
        assertEquals(HardwareInterruptGate.State.WAITING, gate.getState())
    }

    @Test
    fun `Volume Down in WAITING transitions to RELEASED`() {
        gate.arm("session-1", "tx-hash", "zk-hash", "webauthn-hash")
        val event = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN)
        val consumed = gate.onKeyEvent(event)
        assertTrue(consumed)
        assertEquals(HardwareInterruptGate.State.RELEASED, gate.getState())
    }

    @Test
    fun `Volume Up in WAITING transitions to CANCELLED`() {
        gate.arm("session-1", "tx-hash", "zk-hash", "webauthn-hash")
        val event = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_UP)
        val consumed = gate.onKeyEvent(event)
        assertTrue(consumed)
        assertEquals(HardwareInterruptGate.State.CANCELLED, gate.getState())
    }

    @Test
    fun `Volume Down ignored in IDLE state`() {
        val event = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN)
        val consumed = gate.onKeyEvent(event)
        assertFalse(consumed)
        assertEquals(HardwareInterruptGate.State.IDLE, gate.getState())
    }

    @Test
    fun `Volume Up ignored in IDLE state`() {
        val event = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_UP)
        val consumed = gate.onKeyEvent(event)
        assertFalse(consumed)
        assertEquals(HardwareInterruptGate.State.IDLE, gate.getState())
    }

    @Test
    fun `Volume Down ignored after gate completed`() {
        gate.arm("session-1", "tx-hash", "zk-hash", "webauthn-hash")
        gate.onKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN))
        gate.onGhostActuatorCompleted()

        val event = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN)
        val consumed = gate.onKeyEvent(event)
        assertFalse(consumed)
        assertEquals(HardwareInterruptGate.State.COMPLETED, gate.getState())
    }

    @Test
    fun `timeout transitions to CANCELLED`() {
        gate.arm("session-1", "tx-hash", "zk-hash", "webauthn-hash")
        ShadowLooper.runUiThreadTasksIncludingDelayedTasks()
        assertEquals(HardwareInterruptGate.State.CANCELLED, gate.getState())
    }

    @Test
    fun `reset returns to IDLE from RELEASED`() {
        gate.arm("session-1", "tx-hash", "zk-hash", "webauthn-hash")
        gate.onKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN))
        assertEquals(HardwareInterruptGate.State.RELEASED, gate.getState())
        gate.reset()
        assertEquals(HardwareInterruptGate.State.IDLE, gate.getState())
    }

    @Test
    fun `re-arm after reset works cleanly`() {
        gate.arm("session-1", "tx-hash", "zk-hash", "webauthn-hash")
        gate.onKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN))
        gate.reset()
        assertEquals(HardwareInterruptGate.State.IDLE, gate.getState())

        gate.arm("session-2", "tx-hash", "zk-hash", "webauthn-hash")
        assertEquals(HardwareInterruptGate.State.WAITING, gate.getState())
    }

    @Test
    fun `onGhostActuatorCompleted transitions RELEASED to COMPLETED`() {
        gate.arm("session-1", "tx-hash", "zk-hash", "webauthn-hash")
        gate.onKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN))
        assertEquals(HardwareInterruptGate.State.RELEASED, gate.getState())

        gate.onGhostActuatorCompleted()
        assertEquals(HardwareInterruptGate.State.COMPLETED, gate.getState())
    }

    @Test
    fun `Volume Up after Volume Down does nothing`() {
        gate.arm("session-1", "tx-hash", "zk-hash", "webauthn-hash")
        gate.onKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN))
        assertEquals(HardwareInterruptGate.State.RELEASED, gate.getState())

        val upConsumed = gate.onKeyEvent(
            KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_UP)
        )
        assertFalse(upConsumed)
    }

    @Test
    fun `key events ignored in non-WAITING states`() {
        var consumed = gate.onKeyEvent(
            KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_UP)
        )
        assertFalse(consumed)

        consumed = gate.onKeyEvent(
            KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_VOLUME_DOWN)
        )
        assertFalse(consumed)
    }
}
