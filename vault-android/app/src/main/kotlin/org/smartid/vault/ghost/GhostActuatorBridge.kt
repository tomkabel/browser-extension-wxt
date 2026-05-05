package org.smartid.vault.ghost

import android.os.Parcel
import android.os.Parcelable
import java.lang.ref.WeakReference
import java.util.Random

data class Coordinate(val x: Float, val y: Float) : Parcelable {
    constructor(parcel: Parcel) : this(parcel.readFloat(), parcel.readFloat())

    override fun writeToParcel(parcel: Parcel, flags: Int) {
        parcel.writeFloat(x)
        parcel.writeFloat(y)
    }

    override fun describeContents(): Int = 0

    companion object {
        @JvmField
        val CREATOR: Parcelable.Creator<Coordinate> = object : Parcelable.Creator<Coordinate> {
            override fun createFromParcel(parcel: Parcel): Coordinate = Coordinate(parcel)
            override fun newArray(size: Int): Array<Coordinate?> = arrayOfNulls(size)
        }
    }
}

object GhostActuatorBridge {
    private var serviceRef: WeakReference<GhostActuatorService>? = null
    private var completionCallback: (() -> Unit)? = null
    private var failureCallback: ((Int) -> Unit)? = null
    private val rng = Random()

    fun bind(service: GhostActuatorService) {
        serviceRef = WeakReference(service)
    }

    fun unbind() {
        serviceRef = null
        completionCallback = null
        failureCallback = null
    }

    fun isServiceBound(): Boolean = serviceRef?.get() != null

    fun holdSequence(coordinates: List<Coordinate>) {
        serviceRef?.get()?.holdSequence(coordinates)
    }

    fun executeSequence() {
        serviceRef?.get()?.executeSequence()
    }

    fun clearSequence() {
        serviceRef?.get()?.clearSequence()
    }

    fun setOnCompleted(callback: () -> Unit) {
        completionCallback = callback
    }

    fun setOnFailed(callback: (Int) -> Unit) {
        failureCallback = callback
    }

    fun notifyCompleted() {
        completionCallback?.invoke()
    }

    fun notifyFailed(failedIndex: Int) {
        failureCallback?.invoke(failedIndex)
    }

    fun humanDelayMs(baseMs: Long = 120L): Long {
        val jitter = rng.nextInt(41) - 20
        return (baseMs + jitter).coerceAtLeast(80L)
    }
}
