package com.smartid.vault.ghostactuator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GestureBuilderTest {

    private val defaultOptions = GestureOptions()

    @Test
    fun `single tap constructs stroke with correct timing`() {
        val builder = GestureBuilder(defaultOptions)
        val coords = floatArrayOf(500f, 800f)

        val built = builder.build(coords)

        assertEquals("Expected 1 stroke", 1, built.gesture.strokeCount)
        assertEquals("Duration should match default tap duration",
            defaultOptions.tapDurationMs, built.totalDurationMs)
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

        assertEquals("Expected 4 strokes for 4-digit PIN", 4, built.gesture.strokeCount)

        val expectedDuration = 4 * defaultOptions.tapDurationMs + 3 * defaultOptions.interTapDelayMs
        assertEquals("Duration should match cumulative timing", expectedDuration, built.totalDurationMs)
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
        assertEquals("Duration should use custom timing", expectedDuration, built.totalDurationMs)
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
