package com.vedamatch.calls

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Групповой звонок, пока приложение не на экране (VED-360, живая проверка
 * 27.09: Realme RMX2155 ↔ Samsung A51).
 *
 * Что сломалось. «Я ещё здесь» (`POST /chat/group-calls/:id/heartbeat`)
 * слал JS-таймер `setInterval` раз в 15 с. Но таймеры React Native на
 * Android идут от `Choreographer` и встают, как только `Activity` уходит в
 * паузу (`JavaTimerManager.onHostPause` → `clearFrameCallback`). Любой уход
 * с экрана — свёрнутое приложение, системное окно согласия на показ экрана
 * — останавливал подтверждения, и через 45 с (`GROUP_CALL_PARTICIPANT_TTL_MS`
 * на сервере) уборщик убирал человека из комнаты. Вернувшись, клиент видел
 * себя вне состава и заканчивал звонок.
 *
 * Что делает эта служба:
 *
 * - **тикает сама**: `Handler` главного потока раз в `TICK_MS` шлёт в JS
 *   событие `groupCallTick`, а по нему JS отправляет heartbeat. Нативные
 *   события доходят до JS и при погашенных таймерах — встают только
 *   таймеры, а не поток JS;
 * - **держит процесс на переднем плане** с типом `microphone`: без службы
 *   свёрнутое приложение становится «кэшированным», и Android 12+ может его
 *   заморозить (тогда не тикает уже ничего), а микрофон приложения в фоне
 *   система глушит. Тип `microphone` — ровно то, что происходит: идёт
 *   разговор.
 *
 * Своя служба, а не `CallForegroundService` звонка один на один: та
 * завязана на `Connection` Telecom и на смах из «недавних» кладёт трубку
 * звонка один на один (`HangupHeadlessTaskService`) — в группе это был бы
 * запрос не туда. Здесь на смах служба просто уходит, а сервер убирает
 * участника тем же уборщиком через 45 с — это и есть «приложение убито».
 */
class GroupCallKeepAliveService : Service() {
  companion object {
    private const val TAG = "VedamatchGroupCall"
    private const val EXTRA_CALL_ID = "callId"
    private const val NOTIFICATION_ID = 7720

    /**
     * Шаг тика. Тот же, что у heartbeat'а (`GROUP_CALL_HEARTBEAT_MS`):
     * три пропуска подряд — это TTL сервера, одного-двух он не заметит.
     */
    const val TICK_MS = 15_000L

    fun start(context: Context, callId: String) {
      val intent = Intent(context, GroupCallKeepAliveService::class.java)
        .putExtra(EXTRA_CALL_ID, callId)
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (error: RuntimeException) {
        // Android 12+ не даёт поднять службу из фона
        // (`ForegroundServiceStartNotAllowedException`). Звонок от этого не
        // рвётся — просто в фоне подтверждения не пойдут, как было до неё.
        Log.w(TAG, "Служба группового звонка не запущена", error)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, GroupCallKeepAliveService::class.java))
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private val tick = object : Runnable {
    override fun run() {
      VedamatchCallsModule.sendGroupCallTick()
      handler.postDelayed(this, TICK_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val callId = intent?.getStringExtra(EXTRA_CALL_ID)
    if (callId == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    val notification = buildNotification(callId)
    try {
      // Тип `microphone` на Android 14+ требует выданного RECORD_AUDIO и
      // старта с переднего плана — служба поднимается при входе в комнату,
      // когда оба условия выполнены (микрофон к этому моменту уже захвачен).
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
      )
    } catch (error: RuntimeException) {
      Log.w(TAG, "startForeground с типом microphone не принят", error)
      stopSelf()
      return START_NOT_STICKY
    }
    handler.removeCallbacks(tick)
    handler.postDelayed(tick, TICK_MS)
    // Без повторного запуска системой: перезапущенная служба без живого JS
    // тикала бы в пустоту.
    return START_NOT_STICKY
  }

  private fun buildNotification(callId: String): Notification {
    CallNotifications.ensureOngoingChannel(this)
    // Нажатие возвращает прямо на экран группового звонка.
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("vedamatch://group-call/$callId")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val contentPending = PendingIntent.getActivity(
      this,
      NOTIFICATION_ID,
      open,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName)
      .takeIf { it != 0 } ?: applicationInfo.icon
    return NotificationCompat.Builder(this, CallNotifications.ONGOING_CHANNEL_ID)
      .setSmallIcon(icon)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setContentTitle("Идёт групповой звонок")
      .setContentText("Нажмите, чтобы вернуться к звонку")
      .setUsesChronometer(true)
      .setWhen(System.currentTimeMillis())
      .setShowWhen(true)
      .setContentIntent(contentPending)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    // Приложение смахнули из «недавних»: разговора больше нет, служба не
    // нужна. Серверу ничего не шлём — heartbeat'ы прекратятся, и уборщик
    // уберёт участника через 45 с, как любого пропавшего.
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
