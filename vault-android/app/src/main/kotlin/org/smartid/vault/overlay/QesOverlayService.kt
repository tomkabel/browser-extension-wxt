package org.smartid.vault.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat
import org.smartid.vault.R

class QesOverlayService : Service() {

    private var overlayView: View? = null
    private var countdownSeconds = 30
    private var countdownHandler: Handler? = null
    private var countdownRunnable: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val notification = buildNotification()
        startForeground(NOTIFICATION_ID, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW -> showOverlay()
            ACTION_DISMISS -> {
                stopCountdown()
                removeOverlay()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                Log.i(TAG, "QES overlay dismissed")
            }
            ACTION_UPDATE_COUNTDOWN -> {
                val seconds = intent.getIntExtra(EXTRA_SECONDS, 30)
                updateCountdown(seconds)
            }
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        removeOverlay()
        super.onDestroy()
    }

    private fun showOverlay() {
        if (overlayView != null) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !Settings.canDrawOverlays(this)) {
            showFallbackNotification()
            return
        }

        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val inflater = getSystemService(LAYOUT_INFLATER_SERVICE) as LayoutInflater

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        )

        params.gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        params.y = 0

        overlayView = inflater.inflate(R.layout.qes_overlay, null)
        overlayView?.let { view ->
            wm.addView(view, params)
            Log.i(TAG, "QES overlay displayed at bottom third of screen")
        }

        startCountdown()
    }

    private fun updateCountdown(seconds: Int) {
        countdownSeconds = seconds
        overlayView?.findViewById<TextView>(R.id.countdown_text)?.let {
            it.text = "Expires in: ${seconds}s"
        }
    }

    private fun startCountdown() {
        countdownHandler = Handler(Looper.getMainLooper())
        countdownRunnable = object : Runnable {
            override fun run() {
                countdownSeconds--
                if (countdownSeconds >= 0) {
                    updateCountdown(countdownSeconds)
                    countdownHandler?.postDelayed(this, 1000L)
                }
            }
        }
        countdownHandler?.postDelayed(countdownRunnable!!, 1000L)
    }

    private fun stopCountdown() {
        countdownRunnable?.let { countdownHandler?.removeCallbacks(it) }
        countdownHandler = null
        countdownRunnable = null
    }

    private fun removeOverlay() {
        overlayView?.let { view ->
            try {
                val wm = getSystemService(WINDOW_SERVICE) as WindowManager
                wm.removeView(view)
            } catch (e: Exception) {
                Log.w(TAG, "Error removing overlay: ${e.message}")
            }
            overlayView = null
        }
    }

    private fun showFallbackNotification() {
        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("QES Signature Armed")
            .setContentText("Verify transaction on Smart-ID app. Press VOLUME DOWN to authorize.")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(true)
            .build()
        notificationManager.notify(FALLBACK_NOTIFICATION_ID, notification)
        Log.w(TAG, "Overlay not available, showing notification fallback")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "QES Overlay Service",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Required for overlay foreground service"
            }
            val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SmartID Vault")
            .setContentText("QES signature service active")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "QesOverlayService"
        private const val CHANNEL_ID = "qes_overlay"
        private const val NOTIFICATION_ID = 1001
        private const val FALLBACK_NOTIFICATION_ID = 1002

        const val ACTION_SHOW = "org.smartid.vault.action.SHOW_OVERLAY"
        const val ACTION_DISMISS = "org.smartid.vault.action.DISMISS_OVERLAY"
        const val ACTION_UPDATE_COUNTDOWN = "org.smartid.vault.action.UPDATE_COUNTDOWN"
        const val EXTRA_SECONDS = "seconds"

        fun show(context: Context) {
            val intent = Intent(context, QesOverlayService::class.java).apply { action = ACTION_SHOW }
            context.startForegroundService(intent)
        }

        fun dismiss(context: Context) {
            val intent = Intent(context, QesOverlayService::class.java).apply { action = ACTION_DISMISS }
            context.startService(intent)
        }

        fun updateCountdown(context: Context, seconds: Int) {
            val intent = Intent(context, QesOverlayService::class.java).apply {
                action = ACTION_UPDATE_COUNTDOWN
                putExtra(EXTRA_SECONDS, seconds)
            }
            context.startService(intent)
        }
    }
}
