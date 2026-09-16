package com.vedamatch.calls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.Person

/**
 * Полноэкранное уведомление входящего звонка (VED-221, п.2-3). Отдельный
 * канал высокой важности с рингтоном и вибрацией — обычные сообщения
 * (`messages`, `expo-notifications`/`push-bridge.tsx`) через него не идут,
 * их канал не трогаем.
 *
 * `CallStyle.forIncomingCall` доступен только с API 31 — на более старых
 * (min SDK проекта ниже) собираем обычное уведомление с теми же двумя
 * действиями и `fullScreenIntent`, полноэкранный показ у обоих одинаков.
 */
object CallNotifications {
  const val CHANNEL_ID = "calls"
  private const val ACTION_ANSWER = "com.vedamatch.calls.ANSWER"
  private const val ACTION_DECLINE = "com.vedamatch.calls.DECLINE"
  const val EXTRA_CALL_ID = "callId"
  const val EXTRA_ACTION = "vedamatchCallAction"

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Звонки", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Входящие звонки VedaMatch"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 800, 500, 800, 500, 800)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      // Системный рингтон по умолчанию, не собственный WAV: `ringtone-incoming.wav`
      // (`lib/calls/ringtone.ts`) — JS-ассет, зашитый в Metro-бандл, а не
      // Android `raw`-ресурс, поэтому по прямому URI из нативного кода
      // недоступен. Звук на экране блокировки при свёрнутом/закрытом
      // приложении играет система по каналу — задел на брендированный
      // рингтон (копия WAV в `res/raw` при сборке) оставлен на этап 3.
      val ringtoneUri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
        ?: Settings.System.DEFAULT_RINGTONE_URI
      setSound(
        ringtoneUri,
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
    }
    manager.createNotificationChannel(channel)
  }

  fun notificationIdFor(callId: String): Int = callId.hashCode()

  /** Явный intent на собственную главную `Activity`: свой модуль не знает
   *  класс `MainActivity` хоста на этапе компиляции (другой Gradle-модуль),
   *  поэтому берёт его тем же способом, что и запуск приложения из лаунчера. */
  private fun launchAppIntent(context: Context): Intent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return intent
  }

  private fun actionReceiverIntent(context: Context, callId: String, action: String): Intent =
    Intent(context, CallActionReceiver::class.java).apply {
      this.action = action
      putExtra(EXTRA_CALL_ID, callId)
    }

  private fun immutableBroadcast(context: Context, requestCode: Int, intent: Intent): PendingIntent =
    PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  private fun immutableActivity(context: Context, requestCode: Int, intent: Intent): PendingIntent =
    PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun show(context: Context, info: PendingCallStore.CallInfo) {
    ensureChannel(context)
    val notificationId = info.notificationId
    val answerPending = immutableBroadcast(context, notificationId * 2, actionReceiverIntent(context, info.callId, ACTION_ANSWER))
    val declinePending = immutableBroadcast(context, notificationId * 2 + 1, actionReceiverIntent(context, info.callId, ACTION_DECLINE))
    val fullScreenIntent = launchAppIntent(context).putExtra(EXTRA_CALL_ID, info.callId).putExtra(EXTRA_ACTION, "open")
    val fullScreenPending = immutableActivity(context, notificationId, fullScreenIntent)
    val title = if (info.kind == "video") "Видеозвонок" else "Звонок"
    // Тот же плоский силуэт, что уже собирает `expo-notifications`
    // (app.config.ts, плагин `expo-notifications`, `drawable/notification_icon`)
    // — свой ресурс модуль не заводит, чтобы значок в шторке не расходился
    // между звонком и обычным сообщением.
    val smallIconRes = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIconRes)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setOngoing(true)
      .setAutoCancel(false)
      .setFullScreenIntent(fullScreenPending, true)
      .setContentIntent(fullScreenPending)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val person = Person.Builder().setName(info.callerName).build()
      builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(person, declinePending, answerPending))
    } else {
      builder
        .setContentTitle(title)
        .setContentText(info.callerName)
        .addAction(0, "Отклонить", declinePending)
        .addAction(0, "Ответить", answerPending)
    }

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(notificationId, builder.build())
  }

  fun cancel(context: Context, callId: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(notificationIdFor(callId))
  }
}
