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
import org.smartid.vault.hig.HardwareInterruptGate

class QesOverlayService : Service() {

    private var overlayView: View? = null
    private var countdownHandler: Handler? = null
    private var countdownRunnable: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW -> showOverlay()
            ACTION_DISMISS -> dismissOverlay()
            ACTION_UPDATE_COUNTDOWN -> {
                val seconds = intent.getIntExtra(EXTRA_SECONDS, INITIAL_COUNTDOWN_SECONDS)
                restartCountdownFrom(seconds)
            }
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopCountdown()
        removeOverlay()
        cancelFallbackNotification()
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
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = 0
        }

        overlayView = inflater.inflate(R.layout.qes_overlay, null)
        overlayView?.let { view -> wm.addView(view, params) }
        Log.i(TAG, "QES overlay displayed at bottom third of screen")

        restartCountdownFrom(INITIAL_COUNTDOWN_SECONDS)
    }

    private fun dismissOverlay() {
        stopCountdown()
        removeOverlay()
        cancelFallbackNotification()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Log.i(TAG, "QES overlay dismissed")
    }

    private fun updateCountdownDisplay(seconds: Int) {
        overlayView?.findViewById<TextView>(R.id.countdown_text)?.let {
            it.text = getString(R.string.qes_overlay_countdown_format, seconds)
        }
    }

    private fun restartCountdownFrom(seconds: Int) {
        stopCountdown()
        updateCountdownDisplay(seconds)
        countdownHandler = Handler(Looper.getMainLooper())
        countdownRunnable = object : Runnable {
            private var remaining = seconds.coerceIn(0, INITIAL_COUNTDOWN_SECONDS)
            override fun run() {
                remaining--
                if (remaining >= 0) {
                    updateCountdownDisplay(remaining)
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
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(
            FALLBACK_NOTIFICATION_ID,
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.qes_overlay_title))
                .setContentText(getString(R.string.qes_overlay_authorize_hint))
                .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setOngoing(true)
                .build()
        )
        Log.w(TAG, "Overlay not available, showing notification fallback")
    }

    private fun cancelFallbackNotification() {
        (getSystemService(NOTIFICATION_SERVICE) as? NotificationManager)
            ?.cancel(FALLBACK_NOTIFICATION_ID)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.qes_notification_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = getString(R.string.qes_notification_channel_desc)
            }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.qes_notification_active_text))
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
        private const val INITIAL_COUNTDOWN_SECONDS = 30

        const val ACTION_SHOW = "org.smartid.vault.action.SHOW_OVERLAY"
        const val ACTION_DISMISS = "org.smartid.vault.action.DISMISS_OVERLAY"
        const val ACTION_UPDATE_COUNTDOWN = "org.smartid.vault.action.UPDATE_COUNTDOWN"
        const val EXTRA_SECONDS = "seconds"

        fun show(context: Context) {
            context.startForegroundService(
                Intent(context, QesOverlayService::class.java).apply { action = ACTION_SHOW }
            )
        }

        fun dismiss(context: Context) {
            context.startService(
                Intent(context, QesOverlayService::class.java).apply { action = ACTION_DISMISS }
            )
        }

        fun updateCountdown(context: Context, seconds: Int) {
            context.startService(
                Intent(context, QesOverlayService::class.java).apply {
                    action = ACTION_UPDATE_COUNTDOWN
                    putExtra(EXTRA_SECONDS, seconds)
                }
            )
        }
    }
}
