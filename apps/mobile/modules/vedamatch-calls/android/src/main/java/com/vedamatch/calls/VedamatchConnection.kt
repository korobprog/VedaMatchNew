package com.vedamatch.calls

import android.telecom.Connection
import android.telecom.DisconnectCause

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

  override fun onShowIncomingCallUi() {
    val context = VedamatchCallsModule.applicationContextOrNull() ?: return
    val info = PendingCallStore.infoFor(callId) ?: return
    CallNotifications.show(context, info)
  }

  override fun onAnswer() {
    setActive()
    VedamatchCallsModule.applicationContextOrNull()?.let { CallNotifications.cancel(it, callId) }
    onAnswerCallback(callId)
  }

  override fun onAnswer(videoState: Int) {
    onAnswer()
  }

  override fun onReject() {
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
    setDisconnected(DisconnectCause(DisconnectCause.REMOTE))
    destroy()
    PendingCallStore.removeConnection(callId)
  }
}
