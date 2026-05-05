package com.smartid.vault.audit

import android.util.Log
import java.time.Instant

data class AuditEvent(
    val timestamp: Instant = Instant.now(),
    val eventType: String,
    val success: Boolean,
    val details: Map<String, String> = emptyMap(),
)

class AuditLogger {

    private val events = mutableListOf<AuditEvent>()

    fun log(eventType: String, success: Boolean, details: Map<String, String> = emptyMap()) {
        val event = AuditEvent(
            eventType = eventType,
            success = success,
            details = details,
        )
        synchronized(events) {
            events.add(event)
        }
        Log.i(TAG, "[${event.eventType}] success=$success details=$details")
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
