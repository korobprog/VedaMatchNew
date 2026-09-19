package com.vedamatch.calls

import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log

/**
 * Self-managed `ConnectionService` (VED-221/222, docs/mobile-calls-native.md
 * §3/§12). Единственная обязанность — превращать запрос Telecom в
 * `Connection` с нужными свойствами и передавать ответ/отклонение/завершение
 * дальше в JS (`VedamatchCallsModule`, события `answer`/`decline`/`end`).
 * Экран и рингтон — не здесь (`CallNotifications`, вызывается из
 * `Connection.onShowIncomingCallUi`).
 */
class VedamatchConnectionService : ConnectionService() {
  companion object {
    private const val TAG = "VedamatchCalls"
  }

  private fun buildConnection(callId: String): VedamatchConnection =
    VedamatchConnection(
      callId = callId,
      onAnswerCallback = { VedamatchCallsModule.sendAnswerEvent(it) },
      onRejectCallback = { VedamatchCallsModule.sendDeclineEvent(it) },
      onEndCallback = { VedamatchCallsModule.sendEndEvent(it) },
    )

  override fun onCreateIncomingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ): Connection {
    val callId = request.extras?.getString(PendingCallStore.EXTRA_CALL_ID) ?: ""
    Log.i(TAG, "onCreateIncomingConnection callId=$callId")
    // Прод-баг 2026-09-19: `call.ended` обогнал создание соединения — `endCall`
    // оставил отметку, звонить уже нечему (иначе `RINGING` навсегда и
    // «занято» для всех следующих звонков).
    if (PendingCallStore.isEnded(callId, System.currentTimeMillis())) {
      Log.w(TAG, "onCreateIncomingConnection: звонок уже завершён, соединение не создаём, callId=$callId")
      PendingCallStore.removeInfo(callId)
      return Connection.createCanceledConnection()
    }
    val connection = buildConnection(callId)
    connection.setRinging()
    connection.armRingTimeout()
    connection.connectionProperties = Connection.PROPERTY_SELF_MANAGED
    connection.audioModeIsVoip = true
    request.extras?.getString(PendingCallStore.EXTRA_CALLER_NAME)?.let {
      connection.setCallerDisplayName(it, TelecomManager.PRESENTATION_ALLOWED)
    }
    PendingCallStore.putConnection(callId, connection)
    return connection
  }

  /**
   * Системный отказ «занято» (VED-222, п.7 — правка по факту живой проверки):
   * Telecom сам решил, что этому self-managed запросу отказано — типично
   * реальный конкурирующий звонок (сотовый или другое self-managed
   * приложение), которого наша JS-проверка ДО показа (`call-busy-decision.ts`,
   * `AudioManager.mode` в `VedamatchCallsModule.callConflictState`) могла не
   * поймать: `AudioManager.MODE_IN_CALL` выставляется телефонией не мгновенно,
   * гонка возможна. Раньше это решалось молча («JS всё равно узнает по
   * таймауту `DISCONNECT_GRACE_MS`») — теперь явно отклоняем звонок на
   * сервере сразу тем же headless-путём, что кнопка «Отклонить» из шторки
   * (`DeclineHeadlessTaskService`, тот же контракт токенов
   * `background-call-action.ts`), а не ждём таймер: `callId` берётся из тех
   * же `extras`, что и `onCreateIncomingConnection` — Telecom передаёт их в
   * оба колбэка одинаково.
   */
  override fun onCreateIncomingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ) {
    val callId = request.extras?.getString(PendingCallStore.EXTRA_CALL_ID)
    Log.i(TAG, "onCreateIncomingConnectionFailed callId=$callId")
    if (!callId.isNullOrEmpty()) DeclineHeadlessTaskService.start(applicationContext, callId)
  }

  override fun onCreateOutgoingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ): Connection {
    // VED-222, п.1: система должна знать об исходящем разговоре — регистрация
    // через `TelecomManager.placeCall` (`VedamatchCallsModule.placeOutgoingCall`)
    // приходит сюда с тем же набором `extras`, что и входящий. WebRTC-сигналинг
    // самого звонка (`chat-calls-client.ts`) не зависит от Telecom — это
    // только системная интеграция (аудиомаршрутизация, Bluetooth/гарнитура,
    // «занято», показ в Android Auto), поэтому отказ здесь (например, Telecom
    // недоступен на конкретном OEM) не должен мешать самому дозвону — JS уже
    // не ждёт результата этого вызова (`placeOutgoingCall`, best-effort).
    val callId = request.extras?.getString(PendingCallStore.EXTRA_CALL_ID)
      ?: return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
    if (PendingCallStore.isEnded(callId, System.currentTimeMillis())) {
      Log.w(TAG, "onCreateOutgoingConnection: звонок уже завершён, callId=$callId")
      return Connection.createCanceledConnection()
    }
    val connection = buildConnection(callId)
    connection.setDialing()
    connection.armRingTimeout()
    connection.connectionProperties = Connection.PROPERTY_SELF_MANAGED
    connection.audioModeIsVoip = true
    request.extras?.getString(PendingCallStore.EXTRA_CALLER_NAME)?.let {
      connection.setCallerDisplayName(it, TelecomManager.PRESENTATION_ALLOWED)
    }
    PendingCallStore.putConnection(callId, connection)
    return connection
  }

  override fun onCreateOutgoingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ) {
    // Тот же принцип, что у `onCreateIncomingConnectionFailed`: сам дозвон
    // идёт через WebRTC-сигналинг независимо от Telecom.
  }
}
