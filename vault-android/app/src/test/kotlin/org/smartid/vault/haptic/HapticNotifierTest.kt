package org.smartid.vault.haptic

import android.os.Build
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.UPSIDE_DOWN_CAKE])
class HapticNotifierTest {

    @Test
    fun `notifier can be created`() {
        val notifier = HapticNotifier(RuntimeEnvironment.getApplication())
        assertNotNull(notifier)
    }

    @Test
    fun `SOS_PATTERN has correct length`() {
        assertEquals("SOS pattern should have 18 timing entries",
            18, HapticNotifier.SOS_PATTERN.size)
    }

    @Test
    fun `SOS_PATTERN has expected three-long segment`() {
        val firstLongSegment = HapticNotifier.SOS_PATTERN.copyOfRange(0, 7)
        val expectedFirst = longArrayOf(0L, 500L, 200L, 500L, 200L, 500L, 1000L)
        assertArrayEquals("First segment should be three 500ms vibrations with 200ms gaps (S...)",
            expectedFirst, firstLongSegment)
    }

    @Test
    fun `SOS_PATTERN has expected three-short segment`() {
        val shortSegment = HapticNotifier.SOS_PATTERN.copyOfRange(7, 13)
        val expectedShort = longArrayOf(200L, 200L, 200L, 200L, 200L, 1000L)
        assertArrayEquals("Short segment should be three 200ms vibrations (...O...)",
            expectedShort, shortSegment)
    }

    @Test
    fun `SOS_PATTERN has expected final three-long segment`() {
        val finalLongSegment = HapticNotifier.SOS_PATTERN.copyOfRange(13, 18)
        val expectedFinal = longArrayOf(500L, 200L, 500L, 200L, 500L)
        assertArrayEquals("Final segment should be three 500ms vibrations (...S)",
            expectedFinal, finalLongSegment)
    }

    @Test
    fun `SOS_PATTERN matches three-long three-short three-long structure`() {
        val pattern = HapticNotifier.SOS_PATTERN
        val longVibrations = mutableListOf<Long>()
        for (i in pattern.indices step 2) {
            if (pattern[i] >= 400L) longVibrations.add(pattern[i])
        }
        assertEquals("Should have exactly 6 long vibrations (three in first block, three in last)",
            6, longVibrations.size)
        longVibrations.forEach { v ->
            assertEquals("Each long vibration should be 500ms", 500L, v)
        }
    }
}
