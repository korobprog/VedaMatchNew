package com.vedamatch.calls

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.telecom.Connection
import android.telecom.DisconnectCause
import android.util.Log

/**
 * Один self-managed звонок в глазах Telecom. Заголовок делает минимум,
 * который ждёт система (`setRinging`/`setActive`/`setDisconnected`) —
 * рисование самого экрана входящего звонка не входит в его обязанности у
 * self-managed сервиса (в отличие от managed ConnectionService системной
 * звонилки): это делает `CallNotifications` по сигналу `onShowIncomingCallUi`.
 *
 * `onAnswer`/`onReject`/`onDisconnect` здесь — путь, которым Telecom сообщает
 * о решении не через нашу собственную кнопку в уведомлении/сервисе
 * (`CallActionReceiver`), а системно: гарнитура, Bluetooth-кнопка (play/pause,
 * hook), Android Auto, и — для `onDisconnect` во время разговора — момент,
 * когда систему просит завершить нас кто-то ещё в Telecom (типично: пришёл
 * сотовый звонок, а наш self-managed аккаунт не объявляет `CAPABILITY_HOLD`,
 * см. `docs/mobile-calls-native.md` §12 — решение «завершить, а не отложить
 * на удержание»). Наша кнопка в уведомлении отвечает/завершает напрямую
 * через `CallActionReceiver` и тоже переводит соединение в нужное состояние
 * без похода через эти колбэки — события ниже дублируют результат для JS
 * ровно для «системных» путей, не только для нашего собственного UI.
 */
class VedamatchConnection(
  /** Публично: `CallForegroundService.onTaskRemoved` и `PendingCallStore`
   *  читают его снаружи, чтобы завершить единственный активный звонок, не
   *  зная его заранее (`anyConnection()`). */
  val callId: String,
  // Имена с суффиксом `Callback`, а не `onAnswer`/`onReject`: в Kotlin
  // свойство и переопределённый метод с одинаковым именем в одном классе —
  // риск неоднозначного резолва вызова, а не только стиль.
  private val onAnswerCallback: (String) -> Unit,
  private val onRejectCallback: (String) -> Unit,
  /** VED-222: единственный сигнал JS о том, что Telecom сам завершил активный
   *  разговор — гарнитура/Bluetooth-кнопка во время разговора, преемption
   *  сотовым звонком, Android Auto. Раньше `onDisconnect()` не звал никакой
   *  колбэк вовсе: Telecom-состояние обновлялось, а `CallSession`/WebRTC в JS
   *  продолжали жить бесконечно, ничего не зная о том, что разговор кончен
   *  (найдено при подготовке этапа 3 — тот же класс дефектов, что
   *  `feedback-001.md` уже находил у `onReject()`). */
  private val onEndCallback: (String) -> Unit,
) : Connection() {
  companion object {
    private const val TAG = "VedamatchCalls"
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
  }

  /** Монотонное время создания — возраст для `StaleCallPolicy`, не зависит
   *  от перевода часов на телефоне. */
  private val createdAtElapsedMs: Long = SystemClock.elapsedRealtime()

  fun ageMs(): Long = SystemClock.elapsedRealtime() - createdAtElapsedMs

  /** Ещё не отвечен: входящий звонит, исходящий набирает (или Telecom ещё
   *  не довёл его до этих состояний). */
  fun isUnanswered(): Boolean = when (state) {
    Connection.STATE_INITIALIZING, Connection.STATE_NEW, Connection.STATE_RINGING, Connection.STATE_DIALING -> true
    else -> false
  }

  fun stateLabel(): String = when (state) {
    Connection.STATE_RINGING, Connection.STATE_INITIALIZING, Connection.STATE_NEW -> "ringing"
    Connection.STATE_DIALING -> "dialing"
    Connection.STATE_ACTIVE -> "active"
    Connection.STATE_HOLDING -> "holding"
    Connection.STATE_DISCONNECTED -> "disconnected"
    else -> "other"
  }

  private val ringTimeout = Runnable {
    if (expireIfStale()) Log.w(TAG, "ring timeout: соединение не отвечено за ${StaleCallPolicy.STALE_RING_AFTER_MS} мс, погашено, callId=$callId")
  }

  /** Страховка от «звонит вечно» (прод-баг 2026-09-19): сервер кладёт
   *  дозвон в `missed` через `SERVER_RING_TIMEOUT_MS`, и если `call.ended`
   *  до нас не дошёл или разминулся с созданием соединения — гасим сами
   *  чуть позже серверного таймера. Зовётся сразу после `setRinging`/`setDialing`. */
  fun armRingTimeout() {
    mainHandler.removeCallbacks(ringTimeout)
    mainHandler.postDelayed(ringTimeout, StaleCallPolicy.STALE_RING_AFTER_MS)
  }

  private fun disarmRingTimeout() {
    mainHandler.removeCallbacks(ringTimeout)
  }

  /**
   * Погасить соединение, если оно не отвечено дольше порога
   * (`StaleCallPolicy.isStale`). JS не извещается: к этому моменту сервер
   * звонок уже закрыл, а свой JS-экран провайдер сверяет сам (`reconcile`).
   */
  fun expireIfStale(): Boolean {
    if (!StaleCallPolicy.isStale(isUnanswered(), ageMs())) return false
    val cause = if (state == Connection.STATE_DIALING) DisconnectCause.CANCELED else DisconnectCause.MISSED
    terminateFromApp(DisconnectCause(cause))
    return true
  }

  override fun onShowIncomingCallUi() {
    Log.i(TAG, "onShowIncomingCallUi callId=$callId")
    val context = VedamatchCallsModule.applicationContextOrNull() ?: return
    val info = PendingCallStore.infoFor(callId) ?: return
    CallNotifications.show(context, info)
  }

  override fun onAnswer() {
    disarmRingTimeout()
    setActive()
    VedamatchCallsModule.applicationContextOrNull()?.let { CallNotifications.cancel(it, callId) }
    onAnswerCallback(callId)
  }

  override fun onAnswer(videoState: Int) {
    onAnswer()
  }

  override fun onReject() {
    disarmRingTimeout()
    setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
    destroy()
    // Симметрично `onDisconnect()`/`disconnectFromApp()` ниже: отклонение —
    // тоже терминальное состояние, запись про это соединение больше не
    // нужна (feedback-001.md, non-blocking п.2 — раньше не убиралась,
    // жила в HashMap до случайной перезаписи тем же callId).
    PendingCallStore.removeConnection(callId)
    VedamatchCallsModule.applicationContextOrNull()?.let { CallNotifications.cancel(it, callId) }
    onRejectCallback(callId)
  }

  /**
   * Намеренно дублируется с `endCall` (`VedamatchCallsModule.kt`) —
   * не недосмотр (`feedback-001.md` этого этапа, non-blocking п.3).
   * `onEndCallback(callId)` доводит до JS `onEnd` → `hangUp()` →
   * `callsApi.end(...)`, и та же цепочка в `call-provider.tsx`
   * (`nativeClearedFor`-эффект на `phase === 'ended'`) следом вызывает
   * `clearNativeCall` → `endCall`, который СНОВА зовёт
   * `CallForegroundService.stop()`/`CallNotifications.cancel()`/
   * `connectionFor(callId)?.disconnectFromApp()` на уже отсутствующем к
   * этому моменту соединении. Все четыре операции здесь и в `endCall`
   * идемпотентны на отсутствующем состоянии (`stopService`/`cancel` на не
   * запущенном/не существующем — no-op, `connectionFor` после
   * `removeConnection` возвращает `null`) — двойной проход безопасен и
   * ожидаем, а не гонка, которую нужно устранять.
   */
  override fun onDisconnect() {
    disarmRingTimeout()
    setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
    destroy()
    PendingCallStore.removeConnection(callId)
    VedamatchCallsModule.applicationContextOrNull()?.let { CallForegroundService.stop(it) }
    onEndCallback(callId)
  }

  /** Звонок сняли со стороны приложения — `call.ended`-пуш или обычное
   *  завершение внутри работающего экрана звонка (`endCall` в JS-обёртке,
   *  кнопка «Завершить» в уведомлении разговора). Не `onDisconnect()`: та
   *  обозначает запрос ОТ Telecom, это — от нас, колбэк в JS звать не нужно
   *  (JS и так уже знает — это он попросил). */
  fun disconnectFromApp() {
    disarmRingTimeout()
    setDisconnected(DisconnectCause(DisconnectCause.REMOTE))
    destroy()
    PendingCallStore.removeConnection(callId)
  }

  /** Сняли со стороны приложения вместе со всем, что могло остаться от
   *  этого звонка: уведомление входящего и метаданные. Для застрявших
   *  (`expireIfStale`) и для сверки с сервером (`endConnections`). */
  fun terminateFromApp(cause: DisconnectCause) {
    disarmRingTimeout()
    setDisconnected(cause)
    destroy()
    PendingCallStore.removeConnection(callId)
    PendingCallStore.removeInfo(callId)
    VedamatchCallsModule.applicationContextOrNull()?.let { CallNotifications.cancel(it, callId) }
  }
}
