package com.smartid.vault.ghostactuator

import android.graphics.Path
import android.view.accessibility.GestureDescription

class GestureBuilder(private val options: GestureOptions) {

    data class BuiltGesture(
        val gesture: GestureDescription,
        val totalDurationMs: Long,
    )

    fun build(coordinates: FloatArray): BuiltGesture {
        if (coordinates.size % 2 != 0) {
            throw IllegalArgumentException("Coordinate array must have even length (pairs of x,y)")
        }

        require(coordinates.size >= 2) { "At least one (x,y) coordinate pair required" }

        val builder = GestureDescription.Builder()
        var runningOffset = 0L

        for (i in coordinates.indices step 2) {
            val x = coordinates[i]
            val y = coordinates[i + 1]

            val path = Path().apply { moveTo(x, y) }
            val stroke = GestureDescription.StrokeDescription(
                path,
                runningOffset,
                options.tapDurationMs,
            )
            builder.addStroke(stroke)

            runningOffset += options.tapDurationMs + options.interTapDelayMs
        }

        return BuiltGesture(
            gesture = builder.build(),
            totalDurationMs = runningOffset - options.interTapDelayMs,
        )
    }
}
