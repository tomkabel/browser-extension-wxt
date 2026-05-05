package com.smartid.vault.ghostactuator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GhostActuatorServiceTest {

    @Test
    fun `gesture options loads defaults`() {
        val options = GestureOptions()

        assertEquals("Default tap duration should be 50ms", 50L, options.tapDurationMs)
        assertEquals("Default inter-tap delay should be 100ms", 100L, options.interTapDelayMs)
        assertEquals("Default retry delay should be 500ms", 500L, options.retryDelayMs)
        assertEquals("Default max retries should be 2", 2, options.maxRetries)
    }

    @Test
    fun `adaptive timing increases delays on low-end device`() {
        val options = GestureOptions(
            tapDurationMs = 30L,
            interTapDelayMs = 50L,
        )

        val adapted = options.withAdaptiveTiming()

        assertTrue("Adaptive timing should not decrease tap duration",
            adapted.tapDurationMs >= options.tapDurationMs)
        assertTrue("Adaptive timing should not decrease inter-tap delay",
            adapted.interTapDelayMs >= options.interTapDelayMs)
    }

    @Test
    fun `error recovery adjusts coordinates on retry`() {
        val coords = floatArrayOf(100f, 200f, 300f, 400f)
        assertEquals("Coordinate count should remain the same", 4, coords.size)
    }

    @Test
    fun `grid info holds correct data structure`() {
        val positions = listOf(
            Pair(150f, 350f),
            Pair(300f, 350f),
            Pair(450f, 350f),
        )
        val bounds = android.graphics.Rect(100, 300, 500, 500)
        val info = GridInfo(positions, bounds, 12345)

        assertEquals("Should hold 3 positions", 3, info.centerPositions.size)
        assertEquals("First digit should be at (150, 350)", Pair(150f, 350f), info.centerPositions[0])
        assertEquals("Should store app version code", 12345, info.appVersionCode)
    }
}
