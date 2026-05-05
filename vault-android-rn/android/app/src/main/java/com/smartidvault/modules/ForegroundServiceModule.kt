package com.smartidvault.modules

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import com.facebook.react.bridge.*

class ForegroundServiceModule(reactContext: ReactContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ForegroundService"

    companion object {
        const val CHANNEL_ID = "smartid-vault-connection"
        const val NOTIFICATION_ID = 1
    }

    @ReactMethod
    fun start(promise: Promise) {
        try {
            createNotificationChannel()
            val intent = Intent(reactApplicationContext, SmartIDForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("FG_SERVICE_ERROR", "Failed to start: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, SmartIDForegroundService::class.java)
            reactApplicationContext.stopService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("FG_SERVICE_ERROR", "Failed to stop: ${e.message}", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SmartID Vault Connection",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the WebRTC connection alive when app is backgrounded"
            }
            val manager = reactApplicationContext.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}

class SmartIDForegroundService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, ForegroundServiceModule.CHANNEL_ID)
                .setContentTitle("SmartID Vault")
                .setContentText("Connected")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("SmartID Vault")
                .setContentText("Connected")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .build()
        }

        startForeground(ForegroundServiceModule.NOTIFICATION_ID, notification)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
