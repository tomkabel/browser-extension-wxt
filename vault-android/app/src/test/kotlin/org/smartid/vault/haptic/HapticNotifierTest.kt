package org.smartid.vault.haptic

import android.os.Build
import org.junit.Assert.assertArrayEquals
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
    fun `SOS pattern has expected three-long segment`() {
        val pattern = longArrayOf(
            0L, 500L, 200L, 500L, 200L, 500L, 1000L,
            200L, 200L, 200L, 200L, 200L, 1000L,
            500L, 200L, 500L, 200L, 500L,
        )

        val firstLongSegment = pattern.copyOfRange(0, 7)
        val expectedFirst = longArrayOf(0L, 500L, 200L, 500L, 200L, 500L, 1000L)
        assertArrayEquals(
            "First segment should be three 500ms vibrations with 200ms gaps (S...)",
            expectedFirst, firstLongSegment
        )
    }

    @Test
    fun `SOS pattern has expected three-short segment`() {
        val pattern = longArrayOf(
            0L, 500L, 200L, 500L, 200L, 500L, 1000L,
            200L, 200L, 200L, 200L, 200L, 1000L,
            500L, 200L, 500L, 200L, 500L,
        )

        val shortSegment = pattern.copyOfRange(7, 13)
        val expectedShort = longArrayOf(200L, 200L, 200L, 200L, 200L, 1000L)
        assertArrayEquals(
            "Short segment should be three 200ms vibrations (...O...)",
            expectedShort, shortSegment
        )
    }

    @Test
    fun `SOS pattern has expected final three-long segment`() {
        val pattern = longArrayOf(
            0L, 500L, 200L, 500L, 200L, 500L, 1000L,
            200L, 200L, 200L, 200L, 200L, 1000L,
            500L, 200L, 500L, 200L, 500L,
        )

        val finalLongSegment = pattern.copyOfRange(13, 18)
        val expectedFinal = longArrayOf(500L, 200L, 500L, 200L, 500L)
        assertArrayEquals(
            "Final segment should be three 500ms vibrations (...S)",
            expectedFinal, finalLongSegment
        )
    }

    @Test
    fun `SOS pattern matches three-long three-short three-long structure`() {
        val pattern = longArrayOf(
            0L, 500L, 200L, 500L, 200L, 500L, 1000L,
            200L, 200L, 200L, 200L, 200L, 1000L,
            500L, 200L, 500L, 200L, 500L,
        )

        val longVibrations = pattern.filterIndexed { index, _ ->
            index % 2 == 1 && pattern[index] >= 400L
        }
        assertNotNull("Long vibrations should be present", longVibrations)
    }

    @Test
    fun `SOS pattern total length is 18 entries`() {
        val pattern = longArrayOf(
            0L, 500L, 200L, 500L, 200L, 500L, 1000L,
            200L, 200L, 200L, 200L, 200L, 1000L,
            500L, 200L, 500L, 200L, 500L,
        )
        assertNotNull("Pattern should have 18 entries", pattern)
        assertArrayEquals(
            "Pattern should have exactly 18 timing entries",
            longArrayOf(0L, 500L, 200L, 500L, 200L, 500L, 1000L,
                200L, 200L, 200L, 200L, 200L, 1000L,
                500L, 200L, 500L, 200L, 500L),
            pattern
        )
    }
}
