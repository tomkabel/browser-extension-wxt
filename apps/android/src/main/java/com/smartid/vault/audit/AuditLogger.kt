package com.smartid.vault.audit

import android.util.Log
import java.time.Instant

data class AuditEvent(
    val timestamp: Instant = Instant.now(),
    val eventType: String,
    val success: Boolean,
    val details: Map<String, String> = emptyMap(),
) {
    fun safeDetails(): Map<String, String> {
        val redacted = mutableMapOf<String, String>()
        for ((key, value) in details) {
            redacted[key] = when {
                key.contains("pin", ignoreCase = true) -> "***"
                key.contains("token", ignoreCase = true) -> value.take(8) + "..."
                key.contains("password", ignoreCase = true) -> "***"
                value.length > 128 -> value.take(128) + "..."
                else -> value
            }
        }
        return redacted
    }
}

class AuditLogger {

    private val events = mutableListOf<AuditEvent>()

    fun log(eventType: String, success: Boolean, details: Map<String, String> = emptyMap()) {
        val redacted = details.mapValues { (key, value) ->
            when {
                key.contains("pin", ignoreCase = true) -> "***"
                key.contains("token", ignoreCase = true) -> value.take(8) + "..."
                key.contains("password", ignoreCase = true) -> "***"
                value.length > 128 -> value.take(128) + "..."
                else -> value
            }
        }
        val event = AuditEvent(
            eventType = eventType,
            success = success,
            details = redacted,
        )
        synchronized(events) {
            events.add(event)
        }
        Log.i(TAG, "[${event.eventType}] success=$success details=$redacted")
    }

    fun getRecent(limit: Int = 50): List<AuditEvent> {
        synchronized(events) {
            return events.takeLast(limit).toList()
        }
    }

    fun clear() {
        synchronized(events) {
            events.clear()
        }
    }

    companion object {
        private const val TAG = "SmartID.Vault"
    }
}
