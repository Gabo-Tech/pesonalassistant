package expo.modules.sendcrawler

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Android 14+ will silence the microphone a few seconds after the app leaves the
 * foreground unless a *microphone* foreground service is running. This service exists
 * only to hold that permission with a persistent "listening" notification. The actual
 * PCM capture still happens in JS via expo-audio.
 */
class ListenForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    ensureChannel()
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return START_STICKY
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.listen_channel_name),
      NotificationManager.IMPORTANCE_LOW,
    )
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = PendingIntent.getActivity(
      this,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    return Notification.Builder(this, CHANNEL_ID)
      .setContentTitle(getString(R.string.listen_notification_title))
      .setContentText(getString(R.string.listen_notification_body))
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentIntent(pending)
      .setOngoing(true)
      .build()
  }

  companion object {
    const val ACTION_STOP = "expo.modules.sendcrawler.STOP_LISTEN"
    const val CHANNEL_ID = "assistant-listen"
    const val NOTIFICATION_ID = 42
  }
}
