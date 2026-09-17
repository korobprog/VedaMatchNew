package com.vedamatch.calls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
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
  private const val TAG = "VedamatchCalls"
  const val CHANNEL_ID = "calls"
  /** Отдельный канал для уведомления ИДУЩЕГО разговора (VED-222, §1) — без
   *  звука и вибрации: `CHANNEL_ID` выше настроен звонить (рингтон,
   *  IMPORTANCE_HIGH) и для тихого «Идёт звонок · имя · 01:23» не подходит —
   *  единственный вызов `notify()` на разговор всё равно проиграл бы
   *  уведомление по звуку канала один раз при показе, только чтобы тут же
   *  умолкнуть навсегда (обновления идут через `setUsesChronometer`, без
   *  повторных `notify()`), что не соответствует ожиданию «тихое служебное
   *  уведомление о процессе», а не «нотификация с внимание-привлекающим
   *  сигналом». */
  const val ONGOING_CHANNEL_ID = "calls_ongoing"
  private const val ACTION_ANSWER = "com.vedamatch.calls.ANSWER"
  private const val ACTION_DECLINE = "com.vedamatch.calls.DECLINE"
  private const val ACTION_END = "com.vedamatch.calls.END"
  const val EXTRA_CALL_ID = "callId"
  const val EXTRA_ACTION = "vedamatchCallAction"
  /** Один разговор одновременно — фиксированный id вместо `notificationIdFor`,
   *  чтобы обновление того же уведомления не плодило второе. */
  const val ONGOING_NOTIFICATION_ID = 7719

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

  fun ensureOngoingChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(ONGOING_CHANNEL_ID) != null) return
    val channel = NotificationChannel(ONGOING_CHANNEL_ID, "Идущий звонок", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Постоянное уведомление, пока разговор VedaMatch идёт"
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
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

    // `CallStyle.forIncomingCall` требует и `Person` с непустым именем, и
    // либо активную foreground-службу, либо `setFullScreenIntent(...)` на
    // этом же builder'е — оба условия здесь выполнены (`fullScreenPending`
    // выше), но это системное требование Android, не наша гарантия: любое
    // отклонение (пустое имя, будущая правка кода, уберёт fullScreenIntent
    // по ошибке) бросает `IllegalArgumentException` внутри `builder.build()`
    // и без try/catch уронило бы весь показ уведомления молча (исключение
    // ловится вызывающим `showIncomingCall`, но там уже поздно — обычное
    // уведомление ниже так и не покажется). Деградация — тот же билдер без
    // `CallStyle`, с ручными заголовком/кнопками, как для API < 31.
    var usedCallStyle = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        val person = Person.Builder().setName(info.callerName).build()
        builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(person, declinePending, answerPending))
        usedCallStyle = true
      } catch (error: Exception) {
        Log.w(TAG, "show: CallStyle отказал для callId=${info.callId}, обычное уведомление", error)
      }
    }
    if (!usedCallStyle) {
      builder
        .setContentTitle(title)
        .setContentText(info.callerName)
        .addAction(0, "Отклонить", declinePending)
        .addAction(0, "Ответить", answerPending)
    }

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    try {
      manager.notify(notificationId, builder.build())
      Log.i(TAG, "show: уведомление на канале $CHANNEL_ID показано, callId=${info.callId}")
    } catch (error: Exception) {
      Log.w(TAG, "show: notify() отказал для callId=${info.callId}", error)
    }
  }

  fun cancel(context: Context, callId: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(notificationIdFor(callId))
  }

  private fun smallIconRes(context: Context): Int =
    context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon

  /** Deep link прямо на экран разговора (`vedamatch://call/<id>`,
   *  `expo-router`, `scheme` в `app.config.ts`) — не просто запуск главной
   *  `Activity`: нажатие на уведомление ИДУЩЕГО разговора должно вернуть
   *  человека в сам экран звонка (VED-222, п.1 спеки: «нажатие — вернуться в
   *  экран звонка»), а не в то место приложения, где он был до ответа —
   *  `launchAppIntent` (используется для входящего, `show()`) этого не
   *  делает специально: там нужен просто подъём процесса и полноэкранный
   *  intent решает сам, `ReturnToCallBanner`/автонавигация в `call-provider.tsx`
   *  доводят до экрана. Для уже идущего разговора кружного пути через баннер
   *  не нужно — маршрут уже известен точно. */
  private fun callScreenIntent(context: Context, callId: String): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse("vedamatch://call/$callId")).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }

  /**
   * Постоянное уведомление «Идёт звонок» (VED-222, п.1) —
   * `CallStyle.forOngoingCall` на API 31+, обычная схема с ручным заголовком
   * ниже. Время идёт через `setUsesChronometer`/`setWhen(startedAtMs)` —
   * системный рендер тикает сам раз в секунду без повторных `notify()`
   * (дешевле по батарее, чем свой `Handler`-таймер, и не рискует разойтись с
   * `call-timer.ts` на самом экране, который считает от того же
   * `connectedAt`). Имя и тип разговора — в заголовке/подписи, конкретный
   * текст системный рендер `CallStyle` не даёт склеить в одну строку
   * («Идёт звонок · имя · 01:23» из спеки — описание содержимого, не
   * литеральный шаблон: имя, состояние «идёт разговор» и тикающее время
   * показаны как отдельные системные поля того же уведомления, аналогично
   * системной звонилке и WhatsApp/Telegram).
   */
  fun buildOngoing(context: Context, callId: String, callerName: String, kind: String, startedAtMs: Long): Notification {
    ensureOngoingChannel(context)
    val endPending = immutableBroadcast(context, ONGOING_NOTIFICATION_ID, actionReceiverIntent(context, callId, ACTION_END))
    val contentPending = immutableActivity(context, ONGOING_NOTIFICATION_ID, callScreenIntent(context, callId))
    val kindLabel = if (kind == "video") "Идёт видеозвонок" else "Идёт звонок"

    val builder = NotificationCompat.Builder(context, ONGOING_CHANNEL_ID)
      .setSmallIcon(smallIconRes(context))
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setUsesChronometer(true)
      .setWhen(startedAtMs)
      .setShowWhen(true)
      .setContentIntent(contentPending)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val person = Person.Builder().setName(callerName).build()
      builder.setStyle(NotificationCompat.CallStyle.forOngoingCall(person, endPending))
    } else {
      builder
        .setContentTitle(kindLabel)
        .setContentText(callerName)
        .addAction(0, "Завершить", endPending)
    }

    return builder.build()
  }
}
