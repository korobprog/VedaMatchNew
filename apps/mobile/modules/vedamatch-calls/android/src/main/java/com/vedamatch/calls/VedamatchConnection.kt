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
 * `onAnswer`/`onReject` здесь — путь, которым Telecom сообщает об ответе не
 * через нашу собственную кнопку в уведомлении (`CallActionReceiver`), а
 * системно: гарнитура, Bluetooth-кнопка, Android Auto. Наша кнопка отвечает
 * напрямую через `CallActionReceiver` и тоже переводит соединение в нужное
 * состояние — события ниже это дублирует для остальных путей, а не только
 * для UI.
 */
class VedamatchConnection(
  private val callId: String,
  // Имена с суффиксом `Callback`, а не `onAnswer`/`onReject`: в Kotlin
  // свойство и переопределённый метод с одинаковым именем в одном классе —
  // риск неоднозначного резолва вызова, а не только стиль.
  private val onAnswerCallback: (String) -> Unit,
  private val onRejectCallback: (String) -> Unit,
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

  override fun onDisconnect() {
    setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
    destroy()
    PendingCallStore.removeConnection(callId)
  }

  /** Звонок сняли со стороны приложения — `call.ended`-пуш или обычное
   *  завершение внутри работающего экрана звонка (`endCall` в JS-обёртке).
   *  Не `onDisconnect()`: та обозначает запрос от Telecom, это — от нас. */
  fun disconnectFromApp() {
    setDisconnected(DisconnectCause(DisconnectCause.REMOTE))
    destroy()
    PendingCallStore.removeConnection(callId)
  }
}
