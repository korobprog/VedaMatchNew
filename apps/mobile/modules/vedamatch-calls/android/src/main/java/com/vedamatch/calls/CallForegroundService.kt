package com.vedamatch.calls

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Служба переднего плана «Идёт звонок» (VED-222, п.1,
 * `docs/mobile-calls-native.md` §12). Живёт ровно во время разговора: от
 * `startOngoingCall` (JS, при переходе фазы в `active`, `call-provider.tsx`)
 * до `endCall` (JS, `ended`) — оба идут через `VedamatchCallsModule`, никто
 * больше эту службу не запускает и не останавливает.
 *
 * Единственная обязанность — постоянное уведомление
 * (`CallNotifications.buildOngoing`) и тип foreground-службы для системы
 * (`phoneCall`+`microphone`, для видео ещё `camera`) — без него на Android 14
 * система обязана убить процесс за использование микрофона/камеры в фоне
 * без объявленной причины. Сама WebRTC-сессия (`webrtc-session.ts`) живёт
 * своей жизнью в JS/нативном аудиостеке, эта служба её не трогает — только
 * держит процесс и показывает, что разговор идёт, пока экран погашен или
 * приложение свёрнуто.
 */
class CallForegroundService : Service() {
  companion object {
    private const val EXTRA_CALL_ID = "callId"
    private const val EXTRA_CALLER_NAME = "callerName"
    private const val EXTRA_KIND = "kind"
    private const val EXTRA_STARTED_AT = "startedAt"

    /**
     * `callId` идущего разговора — исправление `feedback-002.md`, non-blocking
     * п.1: раньше `onTaskRemoved()` брал `callId` ТОЛЬКО из
     * `PendingCallStore.anyConnection()`, а self-managed `Connection`
     * регистрируется не для всех путей ответа (узкий случай из
     * `docs/mobile-calls-native.md` §12.10 — входящий, отвеченный тапом по
     * внутриприложенческому баннеру, пока приложение уже было открыто, без
     * похода через Telecom вовсе). Для такого разговора смах из списка
     * последних задач раньше прибирал СЛУЖБУ локально, но не слал headless
     * `hangup` — сервер/собеседник узнавали о конце только по таймеру обрыва
     * WebRTC (`DISCONNECT_GRACE_MS`, 15 с). Источник правды здесь — сама
     * служба (`startOngoingCall`/`endCall` всегда идут с реальным `callId`,
     * независимо от того, был ли зарегистрирован `Connection`), не
     * `PendingCallStore`.
     */
    @Volatile
    private var currentCallId: String? = null

    fun start(context: Context, callId: String, callerName: String, kind: String) {
      val intent = Intent(context, CallForegroundService::class.java).apply {
        putExtra(EXTRA_CALL_ID, callId)
        putExtra(EXTRA_CALLER_NAME, callerName)
        putExtra(EXTRA_KIND, kind)
        putExtra(EXTRA_STARTED_AT, System.currentTimeMillis())
      }
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, CallForegroundService::class.java))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val callId = intent?.getStringExtra(EXTRA_CALL_ID)
    if (callId == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    currentCallId = callId
    val callerName = intent.getStringExtra(EXTRA_CALLER_NAME) ?: ""
    val kind = intent.getStringExtra(EXTRA_KIND) ?: "audio"
    val startedAt = intent.getLongExtra(EXTRA_STARTED_AT, System.currentTimeMillis())
    val notification = CallNotifications.buildOngoing(this, callId, callerName, kind, startedAt)

    // `ServiceCompat.startForeground` сам ветвится по `Build.VERSION.SDK_INT`
    // (на версиях без понятия foreground-типа службы, до API 29, четвёртый
    // параметр просто игнорируется) — свою проверку версии поверх неё
    // дублировать не нужно, в этом весь смысл compat-обёртки androidx.core.
    val types = if (kind == "video")
      ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
        ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
    else
      ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    ServiceCompat.startForeground(this, CallNotifications.ONGOING_NOTIFICATION_ID, notification, types)

    // Разговор пережил перезапуск процесса системой (крайне маловероятно,
    // но `START_STICKY` — тот же выбор, что у большинства foreground-служб
    // разговора/музыки): без сохранённого `intent` (система перезапускает
    // службу с `intent == null`) `callId` взять неоткуда, службе нечего
    // показывать — она сама остановится на следующем `onStartCommand(null)`.
    return START_STICKY
  }

  /**
   * Пользователь смахнул приложение из списка последних, пока шёл разговор
   * (VED-222, п.1: «останавливать при ended на всех путях, в т.ч. крах
   * JS — onTaskRemoved»). Решение — завершить звонок, а не пытаться удержать
   * его живым без единой управляющей JS/UI-поверхности:
   *
   * - простое сворачивание (кнопка «домой», переключение на другое
   *   приложение) `onTaskRemoved` НЕ вызывает — разговор в этом,
   *   основном, сценарии продолжается штатно, именно ради него и существует
   *   вся эта служба (см. заголовок класса);
   * - явный смах из списка задач — системный сигнал «эту задачу закрывают»,
   *   а самоуправляемый `Connection` без него навсегда остался бы
   *   зарегистрированным в Telecom с уведомлением, которое некому погасить,
   *   если процесс позже всё-таки убьёт система (агрессивные политики
   *   энергосбережения некоторых производителей, см. этап 4/VED-223) —
   *   разрывать самим, пока это ещё можно сделать чисто, безопаснее, чем
   *   оставить зависший self-managed звонок.
   *
   * Сервер и собеседник узнают о конце разговора через
   * `HangupHeadlessTaskService` (исправление `feedback-001.md` этого этапа,
   * блокирующий п.2) — не через `VedamatchCallsModule.sendEndEvent`/
   * `NativeEventEmitter`, как было: у события нет гарантии, что JS-мост ещё
   * жив в момент, когда Activity уже разрушается, а `HeadlessJsTaskService`
   * с собственным wake lock — тот же проверенный паттерн, что уже несёт
   * `DeclineHeadlessTaskService` для симметричного случая «Отклонить из
   * фона». Локальная уборка (self-managed `Connection`, уведомление, сама
   * служба) остаётся синхронной и не ждёт сети — сервер может быть временно
   * недоступен, а Telecom и системная шторка обязаны освободиться сразу.
   *
   * `callId` берётся из `currentCallId` (сама служба знает его всегда —
   * `startOngoingCall` передаёт его при каждом старте), а не из
   * `PendingCallStore.anyConnection()`: `Connection` регистрируется не для
   * всех путей ответа (`feedback-002.md`, non-blocking п.1) — headless
   * `hangup` теперь уходит для ЛЮБОГО идущего разговора, `Connection`
   * (если он есть) по-прежнему разрывается отдельно, локально.
   */
  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    val callId = currentCallId
    if (callId != null) {
      // Запускается ДО остановки этой службы: свежий `HeadlessJsTaskService`
      // держит процесс живым через собственный wake lock, пока идёт HTTP —
      // порядок важен, иначе окно между `stopSelf()` этой службы и стартом
      // headless-задачи могло бы дать системе повод убить процесс раньше.
      HangupHeadlessTaskService.start(this, callId)
      PendingCallStore.anyConnection()?.disconnectFromApp()
    }
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    currentCallId = null
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
