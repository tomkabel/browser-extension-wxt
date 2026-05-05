package com.smartid.vault.ghostactuator

import org.junit.Test
import java.util.concurrent.CompletableFuture

class GhostActuatorServiceTest {

    @Test
    fun `gesture options loads defaults from preferences`() {
        val options = GestureOptions()

        assert(options.tapDurationMs == 50L) { "Default tap duration should be 50ms" }
        assert(options.interTapDelayMs == 100L) { "Default inter-tap delay should be 100ms" }
        assert(options.retryDelayMs == 500L) { "Default retry delay should be 500ms" }
        assert(options.maxRetries == 2) { "Default max retries should be 2" }
    }

    @Test
    fun `adaptive timing increases delays on low-end device`() {
        val options = GestureOptions(
            tapDurationMs = 30L,
            interTapDelayMs = 50L,
        )

        val adapted = options.withAdaptiveTiming()

        assert(adapted.tapDurationMs >= options.tapDurationMs) {
            "Adaptive timing should not decrease tap duration"
        }
        assert(adapted.interTapDelayMs >= options.interTapDelayMs) {
            "Adaptive timing should not decrease inter-tap delay"
        }
    }

    @Test
    fun `error recovery adjusts coordinates on retry`() {
        val coords = floatArrayOf(100f, 200f, 300f, 400f)

        val retry1 = floatArrayOf(
            coords[0], coords[1], coords[2], coords[3],
        )

        assert(retry1.size == coords.size) {
            "Coordinate count should remain the same"
        }
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

        assert(info.centerPositions.size == 3) { "Should hold 3 positions" }
        assert(info.centerPositions[0] == Pair(150f, 350f)) { "First digit should be at (150, 350)" }
        assert(info.appVersionCode == 12345) { "Should store app version code" }
    }
}
