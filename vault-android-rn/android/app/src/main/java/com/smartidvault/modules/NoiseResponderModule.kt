package com.smartidvault.modules

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

class NoiseResponderModule(reactContext: ReactContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NoiseResponder"

    private val handshakeMap = ConcurrentHashMap<Int, HandshakeState>()
    private var nextHandle = 1
    private val random = SecureRandom()

    // Simplified Noise XX handshake state
    // In production, this wraps the noise-java library
    data class HandshakeState(
        val localStaticKey: ByteArray,
        var remoteStaticPublicKey: ByteArray? = null,
        var chainingKey: ByteArray? = null,
        var messageBuffer: ByteArray = byteArrayOf(),
        var isComplete: Boolean = false,
        var encryptKey: ByteArray? = null,
        var decryptKey: ByteArray? = null
    )

    @ReactMethod
    fun createResponderXX(localStaticKeyBytes: ReadableArray, promise: Promise) {
        try {
            val keyBytes = ByteArray(localStaticKeyBytes.size())
            for (i in 0 until localStaticKeyBytes.size()) {
                keyBytes[i] = localStaticKeyBytes.getInt(i).toByte()
            }

            val handle = nextHandle++
            val state = HandshakeState(localStaticKey = keyBytes)
            handshakeMap[handle] = state

            promise.resolve(handle)
        } catch (e: Exception) {
            promise.reject("NOISE_ERROR", "Failed to create responder: ${e.message}", e)
        }
    }

    @ReactMethod
    fun writeMessage(handle: Int, payload: ReadableArray, promise: Promise) {
        try {
            val state = handshakeMap[handle]
                ?: return promise.reject("NOISE_ERROR", "Invalid handle: $handle")

            val payloadBytes = ByteArray(payload.size())
            for (i in 0 until payload.size()) {
                payloadBytes[i] = payload.getInt(i).toByte()
            }

            // In production, this calls noise-java:
            // val packet = handshake.writeMessage(payloadBytes)
            // For now, build the message structure
            val message = buildMessage(0x00, 0x02, payloadBytes)

            val result = Arguments.createArray()
            for (b in message) {
                result.pushInt(b.toInt() and 0xFF)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("NOISE_ERROR", "Failed to write message: ${e.message}", e)
        }
    }

    @ReactMethod
    fun readMessage(handle: Int, packet: ReadableArray, promise: Promise) {
        try {
            val state = handshakeMap[handle]
                ?: return promise.reject("NOISE_ERROR", "Invalid handle: $handle")

            val packetBytes = ByteArray(packet.size())
            for (i in 0 until packet.size()) {
                packetBytes[i] = packet.getInt(i).toByte()
            }

            // In production, this calls noise-java:
            // val payload = handshake.readMessage(packetBytes)
            // state.remoteStaticPublicKey = handshake.remoteStaticPublicKey
            val payload = parsePayload(packetBytes)

            val result = Arguments.createArray()
            for (b in payload) {
                result.pushInt(b.toInt() and 0xFF)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("NOISE_ERROR", "Failed to read message: ${e.message}", e)
        }
    }

    @ReactMethod
    fun split(handle: Int, promise: Promise) {
        try {
            val state = handshakeMap[handle]
                ?: return promise.reject("NOISE_ERROR", "Invalid handle: $handle")

            // In production, this calls noise-java:
            // val pair = handshake.split()
            // val encryptKey = pair.sender.key
            // val decryptKey = pair.receiver.key
            // val chainingKey = handshake.chainingKey

            val result = Arguments.createMap()
            val encKey = Arguments.createArray()
            val decKey = Arguments.createArray()
            val chainKey = Arguments.createArray()

            // Placeholder: in production, these come from noise-java split()
            val encBytes = state.encryptKey ?: ByteArray(32)
            val decBytes = state.decryptKey ?: ByteArray(32)
            val chainBytes = state.chainingKey ?: ByteArray(32)

            for (b in encBytes) encKey.pushInt(b.toInt() and 0xFF)
            for (b in decBytes) decKey.pushInt(b.toInt() and 0xFF)
            for (b in chainBytes) chainKey.pushInt(b.toInt() and 0xFF)

            result.putArray("encryptKey", encKey)
            result.putArray("decryptKey", decKey)
            result.putArray("chainingKey", chainKey)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("NOISE_ERROR", "Failed to split: ${e.message}", e)
        }
    }

    @ReactMethod
    fun destroyHandle(handle: Int, promise: Promise) {
        handshakeMap.remove(handle)
        promise.resolve(null)
    }

    private fun buildMessage(version: Byte, type: Byte, payload: ByteArray): ByteArray {
        val length = payload.size
        return byteArrayOf(
            version,
            type,
            (length shr 8).toByte(),
            (length and 0xFF).toByte()
        ) + payload
    }

    private fun parsePayload(packet: ByteArray): ByteArray {
        if (packet.size < 4) return byteArrayOf()
        val length = ((packet[2].toInt() and 0xFF) shl 8) or (packet[3].toInt() and 0xFF)
        if (packet.size < 4 + length) return byteArrayOf()
        return packet.sliceArray(4 until (4 + length))
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
