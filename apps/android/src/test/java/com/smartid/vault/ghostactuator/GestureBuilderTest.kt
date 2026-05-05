package com.smartid.vault.ghostactuator

import org.junit.Test

class GestureBuilderTest {

    private val defaultOptions = GestureOptions()

    @Test
    fun `single tap constructs stroke with correct timing`() {
        val builder = GestureBuilder(defaultOptions)
        val coords = floatArrayOf(500f, 800f)

        val built = builder.build(coords)

        assert(built.gesture.strokeCount == 1) {
            "Expected 1 stroke, got ${built.gesture.strokeCount}"
        }
        assert(built.totalDurationMs == defaultOptions.tapDurationMs) {
            "Expected ${defaultOptions.tapDurationMs}ms, got ${built.totalDurationMs}ms"
        }
    }

    @Test
    fun `multi-digit sequence creates sequential strokes`() {
        val builder = GestureBuilder(defaultOptions)
        val coords = floatArrayOf(
            200f, 400f,
            500f, 600f,
            300f, 500f,
            400f, 700f,
        )

        val built = builder.build(coords)

        assert(built.gesture.strokeCount == 4) {
            "Expected 4 strokes for 4-digit PIN, got ${built.gesture.strokeCount}"
        }

        val expectedDuration =
            4 * defaultOptions.tapDurationMs + 3 * defaultOptions.interTapDelayMs
        assert(built.totalDurationMs == expectedDuration) {
            "Expected ${expectedDuration}ms, got ${built.totalDurationMs}ms"
        }
    }

    @Test
    fun `configurable timing uses custom values`() {
        val customOptions = GestureOptions(
            tapDurationMs = 80L,
            interTapDelayMs = 150L,
        )
        val builder = GestureBuilder(customOptions)
        val coords = floatArrayOf(100f, 200f, 300f, 400f)

        val built = builder.build(coords)

        val expectedDuration = 2 * 80L + 1 * 150L
        assert(built.totalDurationMs == expectedDuration) {
            "Expected ${expectedDuration}ms with custom timing, got ${built.totalDurationMs}ms"
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun `odd coordinate array throws`() {
        val builder = GestureBuilder(defaultOptions)
        builder.build(floatArrayOf(100f, 200f, 300f))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `empty coordinate array throws`() {
        val builder = GestureBuilder(defaultOptions)
        builder.build(floatArrayOf())
    }
}
